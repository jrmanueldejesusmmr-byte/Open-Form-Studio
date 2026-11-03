import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createProjectAfterImport,
  type CreateProjectAfterImportDependencies
} from './ProjectImportService'
import {
  mountImportDialog,
  openImportDialog,
  hasImportedContent,
  type ImportedFileResult
} from '../ui/ImportDialog'
import type { DashboardProject } from '../models/DashboardProject'

/**
 * Mock DOM para probar el ciclo de vida del modal en entorno Vitest / Node.
 */
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
}

class MockElement {
  tagName: string
  classList: MockClassList
  dataset: Record<string, string> = {}
  children: MockElement[] = []
  listeners = new Map<string, Array<{ fn: (e: unknown) => void; signal?: AbortSignal }>>()
  disabled = false
  value = ''
  private _innerHTML = ''

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
    this.classList = new MockClassList()
  }

  get innerHTML(): string {
    return this._innerHTML
  }

  set innerHTML(val: string) {
    this._innerHTML = val
    if (val === '') {
      this.children = []
    }
  }

  get textContent(): string {
    return this._innerHTML
  }

  set textContent(val: string) {
    this._innerHTML = val
  }

  addEventListener(type: string, fn: (e: unknown) => void, options?: { signal?: AbortSignal }): void {
    if (options?.signal?.aborted) return
    const list = this.listeners.get(type) ?? []
    list.push({ fn, signal: options?.signal })
    this.listeners.set(type, list)

    options?.signal?.addEventListener('abort', () => {
      this.removeEventListener(type, fn)
    })
  }

  removeEventListener(type: string, fn: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? []
    this.listeners.set(
      type,
      list.filter((item) => item.fn !== fn)
    )
  }

  querySelector<T = MockElement>(_sel: string): T | null {
    // Para renderModal, devolvemos un MockElement genérico para que no falle al buscar hijos
    return new MockElement('div') as unknown as T
  }

  querySelectorAll<T = MockElement>(_sel: string): T[] {
    return []
  }

  closest(): MockElement | null {
    return null
  }
}

describe('Flujo de Importar Proyecto del Dashboard', () => {
  let createdProjects: DashboardProject[]
  let mockDeps: CreateProjectAfterImportDependencies

  const sampleValidImport: ImportedFileResult = {
    fileName: 'chalet-moderno.glb',
    projectName: 'Chalet Moderno',
    format: 'glb',
    hasContent: true,
    parsedModel: {
      format: 'glb',
      meshCount: 4,
      meshes: [],
      bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 3, z: 8 } } as unknown as import('three').Box3
    },
    transformParams: {
      scale: 1,
      x: 0,
      y: 0,
      z: 0,
      rotYRad: 0,
      rotYDeg: 0,
      centerAtOrigin: true,
      includeInCosts: true
    }
  }

  beforeEach(() => {
    createdProjects = []
    mockDeps = {
      store: {
        create: vi.fn().mockImplementation(async (input: { name: string; mode: '2D' | '3D' }) => {
          const project: DashboardProject = {
            id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: input.name,
            mode: input.mode,
            designIndex: 0,
            updatedAt: Date.now(),
            ownerId: 'test-user',
            source: 'local'
          }
          createdProjects.push(project)
          return { ok: true, project }
        })
      },
      dashboard: {
        refresh: vi.fn().mockResolvedValue(undefined)
      },
      openWorkspace: vi.fn().mockResolvedValue(undefined),
      ensureWorkspace: vi.fn().mockResolvedValue({
        openProject: vi.fn(),
        focus: vi.fn(),
        closeProject: vi.fn(),
        openImportModal: vi.fn(),
        applyImportedFile: vi.fn().mockResolvedValue(undefined)
      }),
      showDialogError: vi.fn().mockResolvedValue(undefined)
    }
  })

  // (a) Diálogo que resuelve null no llama a crear proyecto
  it('(a) diálogo que resuelve null no llama a crear proyecto ni escribe en base de datos', async () => {
    const result = await createProjectAfterImport(null, mockDeps)

    expect(result).toBeNull()
    expect(mockDeps.store.create).not.toHaveBeenCalled()
    expect(createdProjects).toHaveLength(0)
    expect(mockDeps.dashboard?.refresh).not.toHaveBeenCalled()
    expect(mockDeps.openWorkspace).not.toHaveBeenCalled()
    expect(mockDeps.showDialogError).not.toHaveBeenCalled()
  })

  // (b) Importación válida crea exactamente un proyecto
  it('(b) importación válida crea exactamente un proyecto con el nombre y modo correctos', async () => {
    const result = await createProjectAfterImport(sampleValidImport, mockDeps)

    expect(result).not.toBeNull()
    expect(result?.name).toBe('Chalet Moderno')
    expect(result?.mode).toBe('3D')
    expect(mockDeps.store.create).toHaveBeenCalledTimes(1)
    expect(mockDeps.store.create).toHaveBeenCalledWith({
      name: 'Chalet Moderno',
      mode: '3D'
    })
    expect(createdProjects).toHaveLength(1)
    expect(mockDeps.dashboard?.refresh).toHaveBeenCalledTimes(1)
    expect(mockDeps.openWorkspace).toHaveBeenCalledTimes(1)
    expect(mockDeps.ensureWorkspace).toHaveBeenCalledTimes(1)
  })

  // (c) Abrir y cancelar 3 veces y abrir otra vez funciona
  it('(c) abrir y cancelar 3 veces y abrir otra vez funciona sin bloquear el diálogo', async () => {
    const fakeOverlay = new MockElement('div') as unknown as HTMLElement
    (fakeOverlay as unknown as MockElement).classList.add('is-hidden')

    // Mock document.addEventListener / removeEventListener for keydown
    const origDoc = global.document
    const docListeners = new Map<string, Array<(e: unknown) => void>>()
    global.document = {
      addEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
        const list = docListeners.get(type) ?? []
        list.push(fn)
        docListeners.set(type, list)
      }),
      removeEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
        const list = docListeners.get(type) ?? []
        docListeners.set(
          type,
          list.filter((f) => f !== fn)
        )
      })
    } as unknown as Document

    try {
      const dialog = mountImportDialog(fakeOverlay)

      // Ciclo 1: Abrir y cancelar
      const p1 = dialog.open()
      expect(dialog.isOpen()).toBe(true)
      expect((fakeOverlay as unknown as MockElement).classList.contains('is-hidden')).toBe(false)
      dialog.close(null)
      const res1 = await p1
      expect(res1).toBeNull()
      expect(dialog.isOpen()).toBe(false)
      expect((fakeOverlay as unknown as MockElement).classList.contains('is-hidden')).toBe(true)
      expect((fakeOverlay as unknown as MockElement).innerHTML).toBe('')

      // Ciclo 2: Abrir y cancelar
      const p2 = dialog.open()
      expect(dialog.isOpen()).toBe(true)
      dialog.close(null)
      const res2 = await p2
      expect(res2).toBeNull()
      expect(dialog.isOpen()).toBe(false)
      expect((fakeOverlay as unknown as MockElement).classList.contains('is-hidden')).toBe(true)

      // Ciclo 3: Abrir y cancelar
      const p3 = dialog.open()
      expect(dialog.isOpen()).toBe(true)
      dialog.close(null)
      const res3 = await p3
      expect(res3).toBeNull()
      expect(dialog.isOpen()).toBe(false)
      expect((fakeOverlay as unknown as MockElement).classList.contains('is-hidden')).toBe(true)

      // Ciclo 4: Abrir otra vez funciona perfectamente y resuelve con éxito
      const p4 = dialog.open()
      expect(dialog.isOpen()).toBe(true)
      expect((fakeOverlay as unknown as MockElement).classList.contains('is-hidden')).toBe(false)

      dialog.close(sampleValidImport)
      const res4 = await p4
      expect(res4).toEqual(sampleValidImport)
      expect(dialog.isOpen()).toBe(false)
      expect((fakeOverlay as unknown as MockElement).classList.contains('is-hidden')).toBe(true)
    } finally {
      global.document = origDoc
    }
  })

  // (d) Una importación con error no deja proyectos vacíos
  it('(d) una importación con error no deja proyectos vacíos en el almacén', async () => {
    // 1. Archivo sin contenido o corrupto (hasContent = false)
    const invalidImportNoContent: ImportedFileResult = {
      fileName: 'corrupto.glb',
      projectName: 'Corrupto',
      format: 'glb',
      hasContent: false,
      parsedModel: null,
      transformParams: sampleValidImport.transformParams
    }

    const res1 = await createProjectAfterImport(invalidImportNoContent, mockDeps)
    expect(res1).toBeNull()
    expect(mockDeps.store.create).not.toHaveBeenCalled()
    expect(createdProjects).toHaveLength(0)

    // 2. Modelo 3D con 0 mallas
    const modelZeroMeshes: ImportedFileResult = {
      ...sampleValidImport,
      parsedModel: {
        ...sampleValidImport.parsedModel!,
        meshCount: 0
      }
    }
    expect(hasImportedContent(modelZeroMeshes)).toBe(false)
    const res2 = await createProjectAfterImport(modelZeroMeshes, mockDeps)
    expect(res2).toBeNull()
    expect(mockDeps.store.create).not.toHaveBeenCalled()
    expect(createdProjects).toHaveLength(0)

    // 3. Plano DXF con 0 muros
    const dxfZeroWalls: ImportedFileResult = {
      ...sampleValidImport,
      format: 'dxf',
      parsedModel: null,
      parsedDxf: {
        text: 'dummy dxf',
        plan: {
          walls: [],
          skipped: 10,
          textCount: 2,
          unitFactor: 1
        }
      }
    }
    expect(hasImportedContent(dxfZeroWalls)).toBe(false)
    const res3 = await createProjectAfterImport(dxfZeroWalls, mockDeps)
    expect(res3).toBeNull()
    expect(mockDeps.store.create).not.toHaveBeenCalled()
    expect(createdProjects).toHaveLength(0)
  })

  it('protección contra doble clic: abrir mientras está abierto no crea duplicados', async () => {
    const fakeOverlay = new MockElement('div') as unknown as HTMLElement
    (fakeOverlay as unknown as MockElement).classList.add('is-hidden')

    const origDoc = global.document
    global.document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as Document

    try {
      const dialog = mountImportDialog(fakeOverlay)
      const p1 = dialog.open()
      expect(dialog.isOpen()).toBe(true)

      // Segundo intento concurrente / doble clic
      const p2 = dialog.open()
      const res2 = await p2
      expect(res2).toBeNull() // Rechazado / ignorado inmediatamente

      dialog.close(null)
      const res1 = await p1
      expect(res1).toBeNull()
      expect(dialog.isOpen()).toBe(false)
    } finally {
      global.document = origDoc
    }
  })
})
