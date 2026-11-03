/** Panel de línea de tiempo acoplable (inferior, ocultable con atajo). */
import * as THREE from 'three'
import type { SceneManager } from '../engine/SceneManager'
import type { HistoryManager } from '../engine/HistoryManager'
import {
  ANIMATABLE_PROPERTIES,
  AnimatableProperty,
  Animation,
  DEFAULT_ANIMATION,
  Interpolation,
  Keyframe,
  KeyframeValue,
  SerializedAnimation,
  Track,
  cloneAnimation,
  cloneKeyframeValue,
  evaluateTrack,
  fromJSON,
  keyframeValuesEqual,
  toJSON
} from './model'
import {
  AnimationEngine,
  applyTracksAtTime,
  getSceneElementProperty,
  setSceneElementProperty
} from './AnimationEngine'

export interface TimelineState {
  currentTime: number
  fps: number
  duration: number
  isAnimating: boolean
  isAutoKey: boolean
  selectedObjectId: string | null
  activeProperty: AnimatableProperty
  tracks: Track[]
}

export interface TimelinePanelOptions {
  scene?: SceneManager
  history?: HistoryManager
  engine?: AnimationEngine
  onStateChange?: (state: TimelineState) => void
  onVisibilityChange?: (visible: boolean) => void
  /** Callback disparado al presionar el botón de grabación sincronizada */
  onToggleRecord?: () => void
}

const TIME_EPSILON = 0.01

const INTERPOLATION_LABELS: Record<Interpolation, string> = {
  linear: 'Lineal',
  easeInOut: 'Suave',
  constant: 'Constante'
}

export class TimelinePanel {
  private visible: boolean = false
  private container: HTMLDivElement | null
  private contextMenuEl: HTMLDivElement | null = null
  private scene: SceneManager | null = null
  private history: HistoryManager | null = null
  private engine: AnimationEngine | null = null
  private onStateChange?: (state: TimelineState) => void
  private onVisibilityChange?: (visible: boolean) => void
  private onToggleRecord?: () => void
  private isRecordingState: boolean = false
  private recordingFormattedTime: string = '00:00'
  private suppressAutoKey: boolean = false
  private baselineValues = new Map<string, Map<AnimatableProperty, KeyframeValue>>()
  private selectedKeyframe: { objectId: string; property: string; t: number } | null = null
  private state: TimelineState

  constructor(options: TimelinePanelOptions = {}) {
    this.visible = false
    this.state = {
      currentTime: 0,
      fps: DEFAULT_ANIMATION.fps,
      duration: DEFAULT_ANIMATION.duration,
      isAnimating: false,
      isAutoKey: false,
      selectedObjectId: null,
      activeProperty: 'position',
      tracks: []
    }
    this.container = this.createContainer()
    if (this.container) {
      this.container.style.display = 'none'
    }
    if (options.scene || options.history || options.engine || options.onStateChange || options.onVisibilityChange) {
      this.connect(options)
    }
  }

  connect(options: TimelinePanelOptions): void {
    if (options.scene) this.scene = options.scene
    if (options.history) this.history = options.history
    if (options.engine) this.engine = options.engine
    if (options.onStateChange) this.onStateChange = options.onStateChange
    if (options.onVisibilityChange) this.onVisibilityChange = options.onVisibilityChange
    if (options.onToggleRecord) this.onToggleRecord = options.onToggleRecord
    this.redraw()
  }

  /**
   * Actualiza el indicador y botón de grabación sincronizada en la barra de animación.
   */
  setRecordingState(isRecording: boolean, formattedTime = '00:00'): void {
    this.isRecordingState = isRecording
    this.recordingFormattedTime = formattedTime
    if (!this.container) return
    const recBtn = this.container.querySelector<HTMLButtonElement>('[data-timeline-action="toggle-record"]')
    const recLabel = this.container.querySelector<HTMLElement>('[data-timeline-rec-label]')
    if (recBtn) {
      recBtn.classList.toggle('is-recording', isRecording)
      recBtn.setAttribute('aria-pressed', isRecording ? 'true' : 'false')
      recBtn.title = isRecording
        ? `Detener grabación de video (${formattedTime})`
        : 'Grabar animación del visor 3D (REC)'
    }
    if (recLabel) {
      recLabel.textContent = isRecording ? `Detener (${formattedTime})` : 'Grabar REC'
    }
  }

  /** Captura los valores base de un elemento para que Auto-key detecte qué propiedades cambiaron. */
  captureBaselineForObject(objectId: string): void {
    if (!this.scene) return
    const propMap = new Map<AnimatableProperty, KeyframeValue>()
    for (const prop of ANIMATABLE_PROPERTIES) {
      const val = getSceneElementProperty(this.scene, objectId, prop.id)
      if (val !== undefined) {
        propMap.set(prop.id, cloneKeyframeValue(val))
      }
    }
    this.baselineValues.set(objectId, propMap)
  }

  private createContainer(): HTMLDivElement | null {
    if (typeof document === 'undefined') return null
    const container = document.createElement('div')
    container.className = 'timeline-panel'
    container.innerHTML = /*html*/ `
      <div class="timeline-toolbar">
        <div class="timeline-toolbar__group">
          <button type="button" class="timeline-btn" data-timeline-action="toggle-animating" title="Activar/desactivar edición de animación">
            ◆ Animar
          </button>
          <button type="button" class="timeline-btn" data-timeline-action="toggle-autokey" title="Auto-key: graba fotogramas automáticamente al modificar objetos">
            ● Auto-key
          </button>
          <button type="button" class="timeline-btn" data-timeline-action="insert-keyframe" title="Insertar fotograma en el tiempo actual (K)">
            + Fotograma (K)
          </button>
          <button type="button" class="timeline-btn timeline-btn--rec" data-timeline-action="toggle-record" title="Grabar animación del visor 3D (REC)">
            <span class="timeline-rec-dot" aria-hidden="true"></span>
            <span data-timeline-rec-label>Grabar REC</span>
          </button>
        </div>
        <div class="timeline-toolbar__group">
          <label class="timeline-field">
            <span>Propiedad:</span>
            <select class="timeline-select" data-timeline-prop>
              ${ANIMATABLE_PROPERTIES.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}
            </select>
          </label>
          <div class="timeline-value-editor" data-timeline-value-editor></div>
        </div>
        <div class="timeline-toolbar__group timeline-toolbar__group--right">
          <span class="timeline-time-readout" data-timeline-readout>0.00s / 10.0s</span>
          <label class="timeline-field" title="Duración total (segundos)">
            <span>Duración:</span>
            <input type="number" class="timeline-input" data-timeline-duration min="1" max="300" step="1" value="10" />
            <span>s</span>
          </label>
          <label class="timeline-field" title="Velocidad de reproducción">
            <span>Vel:</span>
            <select class="timeline-select" data-timeline-speed>
              <option value="0.5">0.5x</option>
              <option value="1" selected>1x</option>
              <option value="2">2x</option>
            </select>
          </label>
          <label class="timeline-field timeline-field--checkbox" title="Repetir en bucle">
            <input type="checkbox" data-timeline-loop />
            <span>Bucle</span>
          </label>
        </div>
      </div>
      <div class="timeline-header" data-timeline-ruler>
        <div class="timeline-track-label-col">Pista / Propiedad</div>
        <div class="timeline-ruler-track" data-timeline-ruler-track>
          <span class="timeline-label">0s</span>
          <div class="timeline-marks" id="timeline-marks"></div>
          <span class="playhead" id="timeline-playhead"></span>
        </div>
      </div>
      <div class="timeline-tracklist" id="timeline-tracklist"></div>
      <div class="timeline-context-menu is-hidden" data-timeline-context-menu>
        <div class="timeline-context-menu__title">Interpolación</div>
        <button type="button" class="timeline-context-menu__item" data-interp="linear">Lineal</button>
        <button type="button" class="timeline-context-menu__item" data-interp="easeInOut">Suave (Ease In-Out)</button>
        <button type="button" class="timeline-context-menu__item" data-interp="constant">Constante (Paso)</button>
        <div class="timeline-context-menu__sep"></div>
        <button type="button" class="timeline-context-menu__item timeline-context-menu__item--danger" data-context-delete>Eliminar fotograma</button>
      </div>
    `
    this.contextMenuEl = container.querySelector<HTMLDivElement>('[data-timeline-context-menu]')
    this.setupEvents(container)
    return container
  }

  private setupEvents(container: HTMLDivElement): void {
    // Botones de la barra de herramientas de la línea de tiempo
    container
      .querySelector<HTMLButtonElement>('[data-timeline-action="toggle-animating"]')
      ?.addEventListener('click', () => {
        this.setState({ isAnimating: !this.state.isAnimating })
        this.onStateChange?.(this.getState())
      })

    container
      .querySelector<HTMLButtonElement>('[data-timeline-action="toggle-autokey"]')
      ?.addEventListener('click', () => {
        const nextAuto = !this.state.isAutoKey
        this.setState({
          isAutoKey: nextAuto,
          isAnimating: nextAuto ? true : this.state.isAnimating
        })
        if (nextAuto && this.state.selectedObjectId) {
          this.captureBaselineForObject(this.state.selectedObjectId)
        }
        this.onStateChange?.(this.getState())
      })

    container
      .querySelector<HTMLButtonElement>('[data-timeline-action="insert-keyframe"]')
      ?.addEventListener('click', () => {
        if (!this.state.isAnimating) {
          this.setState({ isAnimating: true })
        }
        this.insertKeyframe()
      })

    container
      .querySelector<HTMLButtonElement>('[data-timeline-action="toggle-record"]')
      ?.addEventListener('click', () => {
        this.onToggleRecord?.()
      })

    const propSelect = container.querySelector<HTMLSelectElement>('[data-timeline-prop]')
    propSelect?.addEventListener('change', () => {
      this.state.activeProperty = propSelect.value as AnimatableProperty
      this.renderValueEditor()
    })

    const durationInput = container.querySelector<HTMLInputElement>('[data-timeline-duration]')
    durationInput?.addEventListener('change', () => {
      const val = Math.max(1, Math.min(300, Number(durationInput.value) || DEFAULT_ANIMATION.duration))
      durationInput.value = String(val)
      this.engine?.setDuration(val)
      const clampedTime = Math.min(this.state.currentTime, val)
      this.setState({ duration: val, currentTime: clampedTime })
      this.onStateChange?.(this.getState())
    })

    const speedSelect = container.querySelector<HTMLSelectElement>('[data-timeline-speed]')
    speedSelect?.addEventListener('change', () => {
      const spd = Number(speedSelect.value) || 1
      this.engine?.setSpeed(spd)
      this.onStateChange?.(this.getState())
    })

    const loopCheckbox = container.querySelector<HTMLInputElement>('[data-timeline-loop]')
    loopCheckbox?.addEventListener('change', () => {
      this.engine?.setLoop(Boolean(loopCheckbox.checked))
      this.onStateChange?.(this.getState())
    })

    // Arrastrar / hacer clic sobre la regla para mover el cabezal e interpolar
    const rulerTrack = container.querySelector<HTMLElement>('[data-timeline-ruler-track]')
    if (rulerTrack) {
      let draggingPlayhead = false
      const updateFromPointer = (clientX: number): void => {
        const rect = rulerTrack.getBoundingClientRect()
        const width = Math.max(1, rect.width)
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / width))
        const newTime = Math.round(ratio * this.state.duration * 100) / 100
        this.seek(newTime)
      }

      rulerTrack.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) return
        draggingPlayhead = true
        rulerTrack.setPointerCapture?.(e.pointerId)
        updateFromPointer(e.clientX)
      })

      rulerTrack.addEventListener('pointermove', (e: PointerEvent) => {
        if (!draggingPlayhead) return
        updateFromPointer(e.clientX)
      })

      const stopDrag = (): void => {
        draggingPlayhead = false
      }
      rulerTrack.addEventListener('pointerup', stopDrag)
      rulerTrack.addEventListener('pointercancel', stopDrag)
    }

    // Menú contextual de interpolación
    this.contextMenuEl?.querySelectorAll<HTMLButtonElement>('[data-interp]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const interp = btn.dataset.interp as Interpolation | undefined
        if (interp && this.selectedKeyframe) {
          this.setKeyframeInterpolation(
            this.selectedKeyframe.objectId,
            this.selectedKeyframe.property,
            this.selectedKeyframe.t,
            interp
          )
        }
        this.hideContextMenu()
      })
    })

    this.contextMenuEl
      ?.querySelector<HTMLButtonElement>('[data-context-delete]')
      ?.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.selectedKeyframe) {
          this.deleteKeyframe(
            this.selectedKeyframe.objectId,
            this.selectedKeyframe.property,
            this.selectedKeyframe.t
          )
        }
        this.hideContextMenu()
      })

    document.addEventListener('click', () => this.hideContextMenu())

    // Atajos de teclado: K para insertar fotograma, Delete para borrar rombo seleccionado
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const rhombus = this.container?.querySelector<HTMLElement>('.timeline-rhombus.selected')
        if (rhombus) {
          e.preventDefault()
          e.stopPropagation()
          this.deleteRhombus(rhombus)
        }
      }
      if (
        (e.key === 'k' || e.key === 'K' || e.code === 'KeyK') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        if (this.state.isAnimating && this.state.selectedObjectId) {
          e.preventDefault()
          this.insertKeyframe()
        }
      }
    })
  }

  private hideContextMenu(): void {
    this.contextMenuEl?.classList.add('is-hidden')
  }

  private openContextMenu(clientX: number, clientY: number, currentInterp: Interpolation): void {
    if (!this.contextMenuEl || !this.container) return
    this.contextMenuEl.classList.remove('is-hidden')
    this.contextMenuEl.querySelectorAll<HTMLButtonElement>('[data-interp]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.interp === currentInterp)
    })
    const panelRect = this.container.getBoundingClientRect()
    const left = Math.max(8, Math.min(clientX - panelRect.left, Math.max(8, panelRect.width - 190)))
    const top = Math.max(8, Math.min(clientY - panelRect.top, Math.max(8, panelRect.height - 140)))
    this.contextMenuEl.style.left = `${left}px`
    this.contextMenuEl.style.top = `${top}px`
  }

  /** Mueve el cabezal al tiempo `t` y aplica los valores interpolados a la escena. */
  seek(t: number): void {
    const clamped = Math.max(0, Math.min(t, this.state.duration))
    this.state.currentTime = clamped
    this.suppressAutoKey = true
    try {
      if (this.engine) {
        this.engine.setTracks(this.state.tracks)
        this.engine.seek(clamped)
      } else if (this.scene) {
        applyTracksAtTime(this.scene, this.state.tracks, clamped, true)
      }
    } finally {
      this.suppressAutoKey = false
    }
    if (this.state.selectedObjectId) {
      this.captureBaselineForObject(this.state.selectedObjectId)
    }
    this.redraw()
    this.onStateChange?.(this.getState())
  }

  private recordChange(label: string, before: Animation): void {
    const after = this.toAnimation()
    this.engine?.setTracks(this.state.tracks)
    this.engine?.setDuration(this.state.duration)
    if (this.history && !this.history.isReplaying()) {
      this.history.recordAnimation(label, before, after, (restored) => {
        this.loadAnimation(restored, true)
      })
    }
    this.onStateChange?.(this.getState())
  }

  /** Inserta o actualiza un fotograma en la pista correspondiente y registra la acción en HistoryManager. */
  insertKeyframe(
    objectId = this.state.selectedObjectId,
    property: string = this.state.activeProperty,
    time: number = this.state.currentTime,
    explicitValue?: KeyframeValue,
    interpolation?: Interpolation
  ): boolean {
    if (!objectId || !this.state.isAnimating) return false

    const before = this.toAnimation()
    let track = this.state.tracks.find(
      (t) => t.objectId === objectId && t.property === property
    )
    if (!track) {
      track = {
        objectId,
        property,
        keyframes: []
      }
      this.state.tracks.push(track)
    }

    const headTime = Math.max(0, Math.min(this.state.duration, Math.round(time * 100) / 100))
    const value =
      explicitValue !== undefined
        ? cloneKeyframeValue(explicitValue)
        : this.getPropertyValue(property, objectId)

    const existingIndex = track.keyframes.findIndex(
      (kf) => Math.abs(kf.t - headTime) < TIME_EPSILON
    )
    if (existingIndex >= 0) {
      track.keyframes[existingIndex] = {
        t: headTime,
        value: cloneKeyframeValue(value),
        interpolation: interpolation ?? track.keyframes[existingIndex].interpolation ?? 'linear'
      }
    } else {
      track.keyframes.push({
        t: headTime,
        value: cloneKeyframeValue(value),
        interpolation: interpolation ?? 'linear'
      })
      track.keyframes.sort((a, b) => a.t - b.t)
    }

    this.selectedKeyframe = { objectId, property, t: headTime }
    this.captureBaselineForObject(objectId)
    this.recordChange('Insertar fotograma', before)
    this.redraw()
    return true
  }

  /** Mueve un fotograma de `fromTime` a `toTime` y lo registra en HistoryManager. */
  moveKeyframe(objectId: string, property: string, fromTime: number, toTime: number): boolean {
    const track = this.state.tracks.find(
      (t) => t.objectId === objectId && t.property === property
    )
    if (!track) return false
    const idx = track.keyframes.findIndex((kf) => Math.abs(kf.t - fromTime) < TIME_EPSILON)
    if (idx === -1) return false

    const clampedTo = Math.max(0, Math.min(this.state.duration, Math.round(toTime * 100) / 100))
    if (Math.abs(clampedTo - fromTime) < 1e-4) return false

    const before = this.toAnimation()
    const movedKf: Keyframe = {
      ...track.keyframes[idx],
      t: clampedTo,
      value: cloneKeyframeValue(track.keyframes[idx].value)
    }
    track.keyframes.splice(idx, 1)
    const collideIdx = track.keyframes.findIndex(
      (kf) => Math.abs(kf.t - clampedTo) < TIME_EPSILON
    )
    if (collideIdx >= 0) {
      track.keyframes[collideIdx] = movedKf
    } else {
      track.keyframes.push(movedKf)
    }
    track.keyframes.sort((a, b) => a.t - b.t)

    this.selectedKeyframe = { objectId, property, t: clampedTo }
    if (this.scene) {
      this.suppressAutoKey = true
      try {
        applyTracksAtTime(this.scene, this.state.tracks, this.state.currentTime, true)
      } finally {
        this.suppressAutoKey = false
      }
    }
    this.recordChange('Mover fotograma', before)
    this.redraw()
    return true
  }

  /** Elimina un fotograma y registra la acción en HistoryManager. */
  deleteKeyframe(objectId: string, property: string, time: number): boolean {
    const track = this.state.tracks.find(
      (t) => t.objectId === objectId && t.property === property
    )
    if (!track) return false
    const idx = track.keyframes.findIndex((kf) => Math.abs(kf.t - time) < TIME_EPSILON)
    if (idx === -1) return false

    const before = this.toAnimation()
    track.keyframes.splice(idx, 1)
    if (track.keyframes.length === 0) {
      this.state.tracks = this.state.tracks.filter((t) => t !== track)
    }
    this.selectedKeyframe = null
    if (this.scene) {
      this.suppressAutoKey = true
      try {
        applyTracksAtTime(this.scene, this.state.tracks, this.state.currentTime, true)
      } finally {
        this.suppressAutoKey = false
      }
    }
    this.recordChange('Borrar fotograma', before)
    this.redraw()
    return true
  }

  /** Cambia la interpolación de un fotograma (lineal, suave, constante) y registra en HistoryManager. */
  setKeyframeInterpolation(
    objectId: string,
    property: string,
    time: number,
    interpolation: Interpolation
  ): boolean {
    const track = this.state.tracks.find(
      (t) => t.objectId === objectId && t.property === property
    )
    if (!track) return false
    const kf = track.keyframes.find((k) => Math.abs(k.t - time) < TIME_EPSILON)
    if (!kf) return false
    if ((kf.interpolation ?? 'linear') === interpolation) return false

    const before = this.toAnimation()
    kf.interpolation = interpolation
    if (this.scene) {
      this.suppressAutoKey = true
      try {
        applyTracksAtTime(this.scene, this.state.tracks, this.state.currentTime, true)
      } finally {
        this.suppressAutoKey = false
      }
    }
    this.recordChange('Cambiar interpolación', before)
    this.redraw()
    return true
  }

  /** Si se borra un objeto o muro de la escena, se eliminan todas sus pistas. */
  removeTracksForObject(objectId: string): boolean {
    const hasAny = this.state.tracks.some((t) => t.objectId === objectId)
    if (!hasAny) return false
    const before = this.toAnimation()
    this.state.tracks = this.state.tracks.filter((t) => t.objectId !== objectId)
    if (this.state.selectedObjectId === objectId) {
      this.state.selectedObjectId = null
    }
    this.baselineValues.delete(objectId)
    this.recordChange('Eliminar pistas de objeto', before)
    this.redraw()
    return true
  }

  /**
   * Auto-key: cuando un muro u objeto cambia en la escena y `isAutoKey` está activo,
   * detecta las propiedades modificadas y crea/actualiza sus fotogramas en `currentTime`.
   */
  handleSceneElementChanged(objectId: string): void {
    if (this.suppressAutoKey) return
    if (!this.state.isAutoKey || !this.state.isAnimating || !this.scene) return
    if (this.history?.isReplaying()) return

    const baseline = this.baselineValues.get(objectId)
    const changedProps: Array<{
      prop: AnimatableProperty
      prevValue: KeyframeValue | undefined
      nextValue: KeyframeValue
    }> = []

    for (const meta of ANIMATABLE_PROPERTIES) {
      const currentVal = getSceneElementProperty(this.scene, objectId, meta.id)
      if (currentVal === undefined) continue
      const prevVal = baseline?.get(meta.id)
      const existingTrack = this.state.tracks.find(
        (t) => t.objectId === objectId && t.property === meta.id
      )
      const evalAtCurrent = existingTrack
        ? evaluateTrack(existingTrack, this.state.currentTime)
        : undefined
      const compareRef = evalAtCurrent !== undefined ? evalAtCurrent : prevVal

      if (compareRef !== undefined && !keyframeValuesEqual(compareRef, currentVal)) {
        changedProps.push({
          prop: meta.id,
          prevValue: prevVal,
          nextValue: cloneKeyframeValue(currentVal)
        })
      }
    }

    if (changedProps.length === 0) return

    const before = this.toAnimation()
    const headTime = Math.max(
      0,
      Math.min(this.state.duration, Math.round(this.state.currentTime * 100) / 100)
    )

    for (const item of changedProps) {
      let track = this.state.tracks.find(
        (t) => t.objectId === objectId && t.property === item.prop
      )
      if (!track) {
        track = { objectId, property: item.prop, keyframes: [] }
        // Si la pista es nueva, el cabezal está en t > 0 y conocemos el valor inicial en t = 0,
        // guardamos el fotograma inicial en t = 0 para que la interpolación A -> B sea inmediata.
        if (headTime > TIME_EPSILON && item.prevValue !== undefined) {
          track.keyframes.push({
            t: 0,
            value: cloneKeyframeValue(item.prevValue),
            interpolation: 'linear'
          })
        }
        this.state.tracks.push(track)
      }

      const existingIdx = track.keyframes.findIndex(
        (kf) => Math.abs(kf.t - headTime) < TIME_EPSILON
      )
      if (existingIdx >= 0) {
        track.keyframes[existingIdx] = {
          ...track.keyframes[existingIdx],
          t: headTime,
          value: cloneKeyframeValue(item.nextValue)
        }
      } else {
        track.keyframes.push({
          t: headTime,
          value: cloneKeyframeValue(item.nextValue),
          interpolation: 'linear'
        })
        track.keyframes.sort((a, b) => a.t - b.t)
      }
    }

    this.captureBaselineForObject(objectId)
    this.recordChange('Auto-key fotograma', before)
    this.redraw()
  }

  private getPropertyValue(
    property: string,
    objectId: string | null = this.state.selectedObjectId
  ): KeyframeValue {
    if (this.scene && objectId) {
      const val = getSceneElementProperty(this.scene, objectId, property)
      if (val !== undefined) return val
    }
    switch (property) {
      case 'position':
        return new THREE.Vector3(0, 0, 0)
      case 'scale':
        return new THREE.Vector3(1, 1, 1)
      case 'visible':
        return true
      case 'color':
        return 0xe0dace
      default:
        return 0
    }
  }

  redraw(): void {
    if (!this.container || typeof document === 'undefined') return
    // Actualizar estado visual de botones en la barra de herramientas
    const animBtn = this.container.querySelector<HTMLButtonElement>(
      '[data-timeline-action="toggle-animating"]'
    )
    animBtn?.classList.toggle('is-active', this.state.isAnimating)

    const autoKeyBtn = this.container.querySelector<HTMLButtonElement>(
      '[data-timeline-action="toggle-autokey"]'
    )
    autoKeyBtn?.classList.toggle('is-active', this.state.isAutoKey)

    const propSelect = this.container.querySelector<HTMLSelectElement>('[data-timeline-prop]')
    if (propSelect && propSelect.value !== this.state.activeProperty) {
      propSelect.value = this.state.activeProperty
    }

    const durationInput = this.container.querySelector<HTMLInputElement>('[data-timeline-duration]')
    if (durationInput && document.activeElement !== durationInput) {
      durationInput.value = String(this.state.duration)
    }

    const readout = this.container.querySelector<HTMLElement>('[data-timeline-readout]')
    if (readout) {
      readout.textContent = `${this.state.currentTime.toFixed(2)}s / ${this.state.duration.toFixed(1)}s`
    }

    this.renderRulerMarks()
    this.renderPlayhead()
    this.renderValueEditor()

    const tracklist =
      this.container.querySelector<HTMLElement>('#timeline-tracklist') ??
      document.getElementById('timeline-tracklist')
    if (!tracklist) return
    tracklist.innerHTML = ''

    if (this.state.tracks.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'timeline-empty'
      empty.textContent = this.state.selectedObjectId
        ? `Seleccionado: ${this.describeObject(this.state.selectedObjectId)} — Pulsa K o «+ Fotograma» para crear una pista.`
        : 'Sin pistas de animación. Activa «Animar», selecciona un muro u objeto y pulsa K.'
      tracklist.appendChild(empty)
      return
    }

    this.state.tracks.forEach((track) => {
      this.redrawTrackRow(tracklist, track)
    })
  }

  private renderRulerMarks(): void {
    if (!this.container || typeof document === 'undefined') return
    const marksEl =
      this.container.querySelector<HTMLElement>('#timeline-marks') ??
      document.getElementById('timeline-marks')
    if (!marksEl) return
    marksEl.innerHTML = ''
    const dur = Math.max(1, this.state.duration)
    const step = dur <= 15 ? 1 : dur <= 60 ? 5 : 10
    for (let s = 0; s <= dur; s += step) {
      const tick = document.createElement('span')
      tick.className = 'timeline-tick'
      tick.style.left = `${(s / dur) * 100}%`
      tick.textContent = `${s}s`
      marksEl.appendChild(tick)
    }
  }

  private renderPlayhead(): void {
    if (!this.container || typeof document === 'undefined') return
    const playhead =
      this.container.querySelector<HTMLElement>('#timeline-playhead') ??
      document.getElementById('timeline-playhead')
    if (!playhead) return
    const dur = Math.max(0.001, this.state.duration)
    const pct = Math.max(0, Math.min(100, (this.state.currentTime / dur) * 100))
    playhead.style.left = `${pct}%`
  }

  /** Editor rápido en la barra del timeline para modificar la propiedad activa (p. ej. ángulo de puerta 0°–90°). */
  private renderValueEditor(): void {
    if (!this.container || typeof document === 'undefined') return
    const host = this.container.querySelector<HTMLElement>('[data-timeline-value-editor]')
    if (!host) return
    host.innerHTML = ''
    const objectId = this.state.selectedObjectId
    if (!objectId || !this.scene) return

    const prop = this.state.activeProperty
    const current = getSceneElementProperty(this.scene, objectId, prop)
    if (current === undefined) return

    const applyEditedValue = (nextVal: KeyframeValue): void => {
      if (!this.scene || !objectId) return
      this.captureBaselineForObject(objectId)
      setSceneElementProperty(this.scene, objectId, prop, nextVal, false)
      if (this.state.isAutoKey && this.state.isAnimating) {
        this.handleSceneElementChanged(objectId)
      } else if (this.state.isAnimating) {
        this.insertKeyframe(objectId, prop, this.state.currentTime, nextVal)
      }
    }

    if (prop === 'openingAngle') {
      const deg = typeof current === 'number' ? Math.round(current) : 0
      host.innerHTML = `
        <label class="timeline-field">
          <span>Apertura:</span>
          <input type="number" class="timeline-input" data-val-angle min="0" max="90" step="5" value="${deg}" />
          <span>°</span>
        </label>
      `
      const input = host.querySelector<HTMLInputElement>('[data-val-angle]')
      input?.addEventListener('change', () => {
        const v = Math.max(0, Math.min(90, Number(input.value) || 0))
        applyEditedValue(v)
      })
      return
    }

    if (prop === 'rotation') {
      const deg = typeof current === 'number' ? Math.round((current * 180) / Math.PI) : 0
      host.innerHTML = `
        <label class="timeline-field">
          <span>Ángulo Y:</span>
          <input type="number" class="timeline-input" data-val-rot min="-360" max="360" step="15" value="${deg}" />
          <span>°</span>
        </label>
      `
      const input = host.querySelector<HTMLInputElement>('[data-val-rot]')
      input?.addEventListener('change', () => {
        const rad = ((Number(input.value) || 0) * Math.PI) / 180
        applyEditedValue(rad)
      })
      return
    }

    if (prop === 'visible') {
      const vis = Boolean(current)
      host.innerHTML = `
        <label class="timeline-field timeline-field--checkbox">
          <input type="checkbox" data-val-visible ${vis ? 'checked' : ''} />
          <span>Visible</span>
        </label>
      `
      const input = host.querySelector<HTMLInputElement>('[data-val-visible]')
      input?.addEventListener('change', () => {
        applyEditedValue(Boolean(input.checked))
      })
      return
    }

    if (prop === 'color') {
      const hexNum = typeof current === 'number' ? current : 0xe0dace
      const hexStr = `#${new THREE.Color(hexNum).getHexString()}`
      host.innerHTML = `
        <label class="timeline-field">
          <input type="color" class="timeline-color-input" data-val-color value="${hexStr}" />
        </label>
      `
      const input = host.querySelector<HTMLInputElement>('[data-val-color]')
      input?.addEventListener('change', () => {
        applyEditedValue(new THREE.Color(input.value).getHex())
      })
      return
    }

    if ((prop === 'position' || prop === 'scale') && current instanceof THREE.Vector3) {
      host.innerHTML = `
        <label class="timeline-field">
          <span>X</span><input type="number" class="timeline-input timeline-input--sm" data-vec-x step="0.5" value="${current.x.toFixed(2)}" />
          <span>Y</span><input type="number" class="timeline-input timeline-input--sm" data-vec-y step="0.5" value="${current.y.toFixed(2)}" />
          <span>Z</span><input type="number" class="timeline-input timeline-input--sm" data-vec-z step="0.5" value="${current.z.toFixed(2)}" />
        </label>
      `
      const ix = host.querySelector<HTMLInputElement>('[data-vec-x]')
      const iy = host.querySelector<HTMLInputElement>('[data-vec-y]')
      const iz = host.querySelector<HTMLInputElement>('[data-vec-z]')
      const onVecChange = (): void => {
        const nx = Number(ix?.value) || 0
        const ny = Number(iy?.value) || 0
        const nz = Number(iz?.value) || 0
        applyEditedValue(new THREE.Vector3(nx, ny, nz))
      }
      ix?.addEventListener('change', onVecChange)
      iy?.addEventListener('change', onVecChange)
      iz?.addEventListener('change', onVecChange)
    }
  }

  private describeObject(objectId: string): string {
    if (this.scene) {
      const obj = this.scene.getObject(objectId)
      if (obj) return `${obj.name} (${obj.id})`
      const wall = this.scene.getWall(objectId)
      if (wall) return `${wall.label} (${wall.id})`
    }
    return objectId
  }

  private describeProperty(property: string): string {
    return ANIMATABLE_PROPERTIES.find((p) => p.id === property)?.label ?? property
  }

  private formatKeyframeValue(value: KeyframeValue): string {
    if (value instanceof THREE.Vector3) {
      return `(${value.x.toFixed(1)}, ${value.y.toFixed(1)}, ${value.z.toFixed(1)})`
    }
    if (value instanceof THREE.Quaternion) {
      return `quat(${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)}, ${value.w.toFixed(2)})`
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? String(value) : value.toFixed(2)
    }
    return String(value)
  }

  private redrawTrackRow(tracklist: HTMLElement, track: Track): void {
    const row = document.createElement('div')
    row.className = 'timeline-track-row'
    if (track.objectId === this.state.selectedObjectId) {
      row.classList.add('is-selected')
    }

    const labelEl = document.createElement('div')
    labelEl.className = 'timeline-track-label'
    labelEl.textContent = `${this.describeObject(track.objectId)} · ${this.describeProperty(track.property)}`
    row.appendChild(labelEl)

    const lane = document.createElement('div')
    lane.className = 'timeline-track-lane'
    row.appendChild(lane)

    const dur = Math.max(0.001, this.state.duration)

    for (const kf of track.keyframes) {
      const rhombus = document.createElement('div')
      rhombus.className = 'timeline-rhombus'
      const interp: Interpolation = kf.interpolation ?? 'linear'
      rhombus.dataset.trackId = track.objectId
      rhombus.dataset.property = track.property
      rhombus.dataset.time = kf.t.toString()
      rhombus.dataset.interpolation = interp
      const pct = Math.max(0, Math.min(100, (kf.t / dur) * 100))
      rhombus.style.left = `${pct}%`
      rhombus.title = `${kf.t.toFixed(2)}s · ${this.formatKeyframeValue(kf.value)} · ${INTERPOLATION_LABELS[interp]}`

      if (
        this.selectedKeyframe &&
        this.selectedKeyframe.objectId === track.objectId &&
        this.selectedKeyframe.property === track.property &&
        Math.abs(this.selectedKeyframe.t - kf.t) < TIME_EPSILON
      ) {
        rhombus.classList.add('selected')
      }

      // Selección y arrastre de fotograma
      let dragging = false
      let startX = 0
      let previewTime = kf.t

      rhombus.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) return
        e.stopPropagation()
        this.container
          ?.querySelectorAll('.timeline-rhombus.selected')
          .forEach((el) => el.classList.remove('selected'))
        rhombus.classList.add('selected')
        this.selectedKeyframe = { objectId: track.objectId, property: track.property, t: kf.t }
        dragging = true
        startX = e.clientX
        previewTime = kf.t
        rhombus.setPointerCapture?.(e.pointerId)
      })

      rhombus.addEventListener('pointermove', (e: PointerEvent) => {
        if (!dragging) return
        const rect = lane.getBoundingClientRect()
        if (rect.width <= 0) return
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        previewTime = Math.round(ratio * this.state.duration * 100) / 100
        rhombus.style.left = `${(previewTime / dur) * 100}%`
      })

      const finishDrag = (e: PointerEvent): void => {
        if (!dragging) return
        dragging = false
        if (Math.abs(e.clientX - startX) > 2 && Math.abs(previewTime - kf.t) >= TIME_EPSILON) {
          this.moveKeyframe(track.objectId, track.property, kf.t, previewTime)
        } else {
          this.seek(kf.t)
        }
      }

      rhombus.addEventListener('pointerup', finishDrag)
      rhombus.addEventListener('pointercancel', () => {
        dragging = false
      })

      // Clic derecho: menú contextual de interpolación (lineal, suave, constante)
      rhombus.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        this.container
          ?.querySelectorAll('.timeline-rhombus.selected')
          .forEach((el) => el.classList.remove('selected'))
        rhombus.classList.add('selected')
        this.selectedKeyframe = { objectId: track.objectId, property: track.property, t: kf.t }
        this.openContextMenu(e.clientX, e.clientY, kf.interpolation ?? 'linear')
      })

      lane.appendChild(rhombus)
    }

    tracklist.appendChild(row)
  }

  private deleteRhombus(rhombus: Element): void {
    const el = rhombus as HTMLElement
    const objectId = el.dataset.trackId
    const property = el.dataset.property
    const time = Number(el.dataset.time)
    if (objectId && property && Number.isFinite(time)) {
      this.deleteKeyframe(objectId, property, time)
      return
    }
    el.remove()
  }

  setState(
    state: Partial<{
      currentTime: number
      fps: number
      duration: number
      tracks: Track[]
      selectedObjectId: string | null
      activeProperty: AnimatableProperty
      isAnimating: boolean
      isAutoKey: boolean
    }>
  ): void {
    const prevSelected = this.state.selectedObjectId
    const prevTime = this.state.currentTime
    this.state = { ...this.state, ...state }
    if (this.state.selectedObjectId && this.state.selectedObjectId !== prevSelected) {
      this.captureBaselineForObject(this.state.selectedObjectId)
    }
    if (state.currentTime !== undefined && Math.abs(state.currentTime - prevTime) > 1e-6) {
      if (this.scene && !this.suppressAutoKey) {
        this.suppressAutoKey = true
        try {
          applyTracksAtTime(this.scene, this.state.tracks, this.state.currentTime, true)
        } finally {
          this.suppressAutoKey = false
        }
      }
    }
    this.redraw()
  }

  getState(): TimelineState {
    return {
      ...this.state,
      tracks: this.state.tracks.map((t) => ({
        objectId: t.objectId,
        property: t.property,
        keyframes: t.keyframes.map((kf) => ({
          t: kf.t,
          value: cloneKeyframeValue(kf.value),
          ...(kf.interpolation ? { interpolation: kf.interpolation } : {})
        }))
      }))
    }
  }

  toAnimation(): Animation {
    return cloneAnimation({
      duration: this.state.duration,
      fps: this.state.fps,
      tracks: this.state.tracks
    })
  }

  loadAnimation(animation: Animation, applyAtCurrentTime = false): void {
    const cloned = cloneAnimation(animation)
    this.state.duration = cloned.duration
    this.state.fps = cloned.fps
    this.state.tracks = cloned.tracks
    if (this.state.currentTime > this.state.duration) {
      this.state.currentTime = 0
    }
    this.engine?.loadAnimation(cloned)
    if (applyAtCurrentTime && this.scene) {
      this.suppressAutoKey = true
      try {
        applyTracksAtTime(this.scene, this.state.tracks, this.state.currentTime, true)
      } finally {
        this.suppressAutoKey = false
      }
    }
    this.redraw()
    this.onStateChange?.(this.getState())
  }

  toJSON(): SerializedAnimation {
    return toJSON(this.toAnimation())
  }

  fromJSON(raw: unknown): Animation {
    const anim = fromJSON(raw)
    this.loadAnimation(anim, false)
    return anim
  }

  isVisible(): boolean {
    return this.visible
  }

  show(): void {
    this.setVisible(true)
  }

  hide(): void {
    this.setVisible(false)
  }

  toggleVisible(): void {
    this.setVisible(!this.visible)
  }

  setVisible(v: boolean): void {
    this.visible = v
    if (this.container) {
      this.container.style.display = v ? 'flex' : 'none'
      if (this.container.parentElement) {
        this.container.parentElement.style.display = v ? 'block' : 'none'
      }
    }
    if (v) this.redraw()
    this.onVisibilityChange?.(v)
  }

  mount(parent: HTMLElement): void {
    parent.innerHTML = ''
    if (this.container) {
      parent.appendChild(this.container)
    }
    parent.style.display = this.visible ? 'block' : 'none'
  }
}
