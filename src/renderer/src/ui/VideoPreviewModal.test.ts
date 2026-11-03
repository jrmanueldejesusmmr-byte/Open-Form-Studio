import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  formatByteSize,
  mountVideoPreviewModal
} from './VideoPreviewModal'
import type { CanvasRecordedVideo } from '../animation/CanvasRecorder'

class MockClassList {
  private classes = new Set<string>()
  constructor(initial = '') {
    if (initial) {
      initial.split(/\s+/).filter(Boolean).forEach((c) => this.classes.add(c))
    }
  }
  add(...tokens: string[]): void {
    tokens.forEach((t) => this.classes.add(t))
  }
  remove(...tokens: string[]): void {
    tokens.forEach((t) => this.classes.delete(t))
  }
  contains(token: string): boolean {
    return this.classes.has(token)
  }
  toggle(token: string, force?: boolean): boolean {
    if (force !== undefined) {
      if (force) this.classes.add(token)
      else this.classes.delete(token)
      return force
    }
    if (this.classes.has(token)) {
      this.classes.delete(token)
      return false
    }
    this.classes.add(token)
    return true
  }
  toString(): string {
    return Array.from(this.classes).join(' ')
  }
}

class MockElement {
  tagName: string
  classList: MockClassList
  dataset: Record<string, string> = {}
  attributes = new Map<string, string>()
  children: MockElement[] = []
  parentElement: MockElement | null = null
  listeners = new Map<string, Array<(e: unknown) => void>>()
  disabled = false
  private _innerHTML = ''

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
    this.classList = new MockClassList()
  }

  get className(): string {
    return this.classList.toString()
  }

  set className(val: string) {
    this.classList = new MockClassList(val)
  }

  get innerHTML(): string {
    return this._innerHTML
  }

  set innerHTML(html: string) {
    this._innerHTML = html
    this.children = []
    this.parseSimpleChildren(html)
  }

  setAttribute(name: string, val: string): void {
    this.attributes.set(name, val)
    if (name.startsWith('data-')) {
      const camel = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
      this.dataset[camel] = val
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name)
  }

  appendChild(child: MockElement): MockElement {
    child.parentElement = this
    this.children.push(child)
    return child
  }

  removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child)
    if (idx !== -1) {
      this.children.splice(idx, 1)
      child.parentElement = null
    }
    return child
  }

  addEventListener(type: string, fn: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(fn)
    this.listeners.set(type, list)
  }

  removeEventListener(type: string, fn: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? []
    this.listeners.set(
      type,
      list.filter((f) => f !== fn)
    )
  }

  click(): void {
    const list = this.listeners.get('click') ?? []
    const event = {
      type: 'click',
      target: this,
      stopPropagation: vi.fn(),
      preventDefault: vi.fn()
    }
    list.forEach((fn) => fn(event))
  }

  pause(): void {
    /* mock */
  }

  play(): void {
    /* mock */
  }

  querySelector<T = MockElement>(sel: string): T | null {
    const res = this.querySelectorAll(sel)
    return (res[0] as unknown as T) ?? null
  }

  querySelectorAll(sel: string): MockElement[] {
    const results: MockElement[] = []
    const match = (el: MockElement): boolean => {
      if (sel.startsWith('.')) {
        return el.classList.contains(sel.slice(1))
      }
      if (sel.startsWith('[data-preview-action="')) {
        const action = sel.slice('[data-preview-action="'.length, -2)
        return el.dataset.previewAction === action
      }
      if (sel === '[data-preview-action]') {
        return Boolean(el.dataset.previewAction)
      }
      if (sel === '[data-preview-card]') {
        return 'previewCard' in el.dataset
      }
      if (sel === '[data-preview-video]') {
        return 'previewVideo' in el.dataset
      }
      return el.tagName.toLowerCase() === sel.toLowerCase()
    }

    const traverse = (node: MockElement): void => {
      for (const child of node.children) {
        if (match(child)) results.push(child)
        traverse(child)
      }
    }
    traverse(this)
    return results
  }

  private parseSimpleChildren(html: string): void {
    // Simple parser para extraer elementos principales data-* y clases para pruebas
    const regex = /<([a-z0-9]+)([^>]*)>/gi
    let match: RegExpExecArray | null
    while ((match = regex.exec(html)) !== null) {
      const tag = match[1]
      const attrsStr = match[2]
      if (tag.startsWith('/')) continue

      const el = new MockElement(tag)
      const attrRegex = /([a-z0-9_-]+)(?:=["']([^"']*)["'])?/gi
      let attrMatch: RegExpExecArray | null
      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
        const aName = attrMatch[1]
        const aVal = attrMatch[2] ?? ''
        if (aName === 'class') {
          el.className = aVal
        } else {
          el.setAttribute(aName, aVal)
        }
      }
      this.children.push(el)
      el.parentElement = this
    }
  }
}

describe('VideoPreviewModal component', () => {
  let originalDocument: unknown
  let mockBody: MockElement

  beforeEach(() => {
    originalDocument = (globalThis as unknown as { document?: unknown }).document
    mockBody = new MockElement('body')

    const mockDoc = {
      body: mockBody,
      createElement: (tag: string) => new MockElement(tag),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      querySelector: (sel: string) => mockBody.querySelector(sel),
      querySelectorAll: (sel: string) => mockBody.querySelectorAll(sel)
    }
    ;(globalThis as unknown as { document: unknown }).document = mockDoc
  })

  afterEach(() => {
    ;(globalThis as unknown as { document: unknown }).document = originalDocument
  })

  it('formats byte sizes correctly', () => {
    expect(formatByteSize(0)).toBe('0 KB')
    expect(formatByteSize(512)).toBe('512 B')
    expect(formatByteSize(1024 * 50)).toBe('50.0 KB')
    expect(formatByteSize(1024 * 1024 * 3.5)).toBe('3.5 MB')
  })

  it('mounts, opens and renders video preview with HTML5 video player attributes', () => {
    const fakeVideo: CanvasRecordedVideo = {
      blob: new Blob(['fake-video-bytes'], { type: 'video/webm' }),
      objectUrl: 'blob:arqstudio/test-video-123',
      fileName: 'Recorrido_Animacion_26_10_2026.webm',
      mimeType: 'video/webm;codecs=vp9',
      durationSeconds: 12.5,
      byteLength: 2048000,
      createdAt: new Date()
    }

    const onDownload = vi.fn()
    const onDiscard = vi.fn()
    const onClose = vi.fn()

    const modal = mountVideoPreviewModal(mockBody as unknown as HTMLElement)
    expect(modal.isOpen()).toBe(false)
    expect(modal.isMinimized()).toBe(false)

    modal.open({
      video: fakeVideo,
      onDownload,
      onDiscard,
      onClose
    })

    expect(modal.isOpen()).toBe(true)
    expect(modal.isMinimized()).toBe(false)
    expect(modal.getCurrentVideo()).toBe(fakeVideo)

    const overlay = mockBody.querySelector('.video-preview-overlay')
    expect(overlay).toBeTruthy()
    expect(overlay?.classList.contains('is-hidden')).toBe(false)

    const videoEl = mockBody.querySelector<MockElement>('[data-preview-video]')
    expect(videoEl).toBeTruthy()
    expect(videoEl?.getAttribute('src')).toBe('blob:arqstudio/test-video-123')
    expect(videoEl?.hasAttribute('controls')).toBe(true)
    expect(videoEl?.hasAttribute('autoplay')).toBe(true)
    expect(videoEl?.hasAttribute('loop')).toBe(true)

    modal.destroy()
  })

  it('handles optional download without downloading automatically upon open', async () => {
    const fakeVideo: CanvasRecordedVideo = {
      blob: new Blob(['data'], { type: 'video/webm' }),
      objectUrl: 'blob:arqstudio/video-download-test',
      fileName: 'Prueba_Descarga.webm',
      mimeType: 'video/webm',
      durationSeconds: 5,
      byteLength: 1024,
      createdAt: new Date()
    }

    const onDownload = vi.fn().mockResolvedValue(undefined)
    const onDiscard = vi.fn()

    const modal = mountVideoPreviewModal(mockBody as unknown as HTMLElement)
    modal.open({
      video: fakeVideo,
      onDownload,
      onDiscard
    })

    // No debe descargarse de inmediato
    expect(onDownload).not.toHaveBeenCalled()

    const downloadBtn = mockBody.querySelector<MockElement>('[data-preview-action="download"]')
    expect(downloadBtn).toBeTruthy()
    downloadBtn?.click()

    expect(onDownload).toHaveBeenCalledTimes(1)
    modal.destroy()
  })

  it('minimizes to floating mini dock and restores on user click', () => {
    const fakeVideo: CanvasRecordedVideo = {
      blob: new Blob(['data'], { type: 'video/webm' }),
      objectUrl: 'blob:arqstudio/video-minimize-test',
      fileName: 'Recorrido_Minimizar.webm',
      mimeType: 'video/webm',
      durationSeconds: 8,
      byteLength: 5000,
      createdAt: new Date()
    }

    const modal = mountVideoPreviewModal(mockBody as unknown as HTMLElement)
    modal.open({
      video: fakeVideo,
      onDownload: vi.fn(),
      onDiscard: vi.fn()
    })

    const minimizeBtn = mockBody.querySelector<MockElement>('[data-preview-action="minimize"]')
    expect(minimizeBtn).toBeTruthy()
    minimizeBtn?.click()

    expect(modal.isMinimized()).toBe(true)
    const overlay = mockBody.querySelector('.video-preview-overlay')
    expect(overlay?.classList.contains('is-minimized')).toBe(true)

    const card = mockBody.querySelector('.video-preview-card')
    expect(card?.classList.contains('is-minimized')).toBe(true)

    const restoreBtn = mockBody.querySelector<MockElement>('[data-preview-action="restore"]')
    expect(restoreBtn).toBeTruthy()
    restoreBtn?.click()

    expect(modal.isMinimized()).toBe(false)
    const restoredCard = mockBody.querySelector('.video-preview-card')
    expect(restoredCard?.classList.contains('is-minimized')).toBe(false)
    modal.destroy()
  })

  it('discards video and triggers onDiscard callback', () => {
    const fakeVideo: CanvasRecordedVideo = {
      blob: new Blob(['data'], { type: 'video/webm' }),
      objectUrl: 'blob:arqstudio/video-discard-test',
      fileName: 'Recorrido_Descartar.webm',
      mimeType: 'video/webm',
      durationSeconds: 4,
      byteLength: 1000,
      createdAt: new Date()
    }

    const onDiscard = vi.fn()
    const onNewRecording = vi.fn()

    const modal = mountVideoPreviewModal(mockBody as unknown as HTMLElement)
    modal.open({
      video: fakeVideo,
      onDownload: vi.fn(),
      onDiscard,
      onNewRecording
    })

    const discardBtn = mockBody.querySelector<MockElement>('[data-preview-action="discard"]')
    expect(discardBtn).toBeTruthy()
    discardBtn?.click()

    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onNewRecording).toHaveBeenCalledTimes(1)
    expect(modal.isOpen()).toBe(false)
    modal.destroy()
  })

  it('closes without discarding video from memory', () => {
    const fakeVideo: CanvasRecordedVideo = {
      blob: new Blob(['data'], { type: 'video/webm' }),
      objectUrl: 'blob:arqstudio/video-close-test',
      fileName: 'Recorrido_Cerrar.webm',
      mimeType: 'video/webm',
      durationSeconds: 6,
      byteLength: 2000,
      createdAt: new Date()
    }

    const onDiscard = vi.fn()
    const onClose = vi.fn()

    const modal = mountVideoPreviewModal(mockBody as unknown as HTMLElement)
    modal.open({
      video: fakeVideo,
      onDownload: vi.fn(),
      onDiscard,
      onClose
    })

    const closeBtn = mockBody.querySelector<MockElement>('[data-preview-action="close"]')
    expect(closeBtn).toBeTruthy()
    closeBtn?.click()

    expect(onDiscard).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(modal.isOpen()).toBe(false)
    expect(modal.getCurrentVideo()).toBe(fakeVideo)
    modal.destroy()
  })
})
