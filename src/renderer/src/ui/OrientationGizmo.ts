import { Axis3D, CameraState } from '../models/CameraState'

/**
 * Opciones de interacción para la esfera y gizmo de orientación.
 */
export interface NavigationSphereOptions {
  /** Clic en un extremo de eje; `negative` identifica −X, −Y o −Z. */
  onSnapAxis?(axis: Axis3D, negative?: boolean): void
  onOrbit?(deltaX: number, deltaY: number): void
  onReset3D?(): void
}

/**
 * Gizmo de orientación de la esquina superior del Viewport. Representación
 * ligera en DOM (sin coste de otra escena 3D). Los botones de eje llaman a
 * Viewport3DController.snapToAxis desde main.ts.
 */
export function mountOrientationGizmo(
  container: HTMLElement,
  onSnapAxis: (axis: Axis3D) => void,
  onReset3D?: () => void
): void {
  container.innerHTML = `
    <div class="gizmo-cube" title="Restablecer perspectiva 3D (clic)">3D</div>
    <button class="gizmo-axis gizmo-x" data-axis="${Axis3D.X}" title="Vista Lateral (Eje X)">X</button>
    <button class="gizmo-axis gizmo-y" data-axis="${Axis3D.Y}" title="Vista Superior / Planta (Eje Y)">Y</button>
    <button class="gizmo-axis gizmo-z" data-axis="${Axis3D.Z}" title="Vista Frontal (Eje Z)">Z</button>
  `

  const cube = container.querySelector<HTMLElement>('.gizmo-cube')
  if (cube && onReset3D) {
    cube.addEventListener('click', () => onReset3D())
  }

  container.querySelectorAll<HTMLButtonElement>('.gizmo-axis').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      onSnapAxis(btn.dataset.axis as Axis3D)
    })
  })
}

/**
 * Esfera de navegación de ejes interactiva (esquina superior derecha del visor).
 *
 * Características:
 * - Refleja la orientación real de la cámara (yaw/pitch) en tiempo real.
 * - Soporta arrastre directo para orbitar la escena 3D libremente en 360°.
 * - Clic en los ejes (X, Y, Z) o caras (Top, Front, Side, 3D) para orientar la vista.
 * - Reposicionamiento automático en el contenedor del viewport al redimensionar o abrir paneles.
 */
export interface NavigationSphereHandle {
  /** Refleja la orientación de la cámara (yaw/pitch) en la esfera de ejes. */
  update(state: CameraState): void
}

export function mountNavigationSphere(
  container: HTMLElement,
  options?: NavigationSphereOptions
): NavigationSphereHandle {
  container.innerHTML = `
    <div class="nav-sphere" title="Orientación 3D · Arrastra para orbitar, clic en un extremo para ver ese eje o doble clic para restablecer">
      <div class="nav-rig">
        <div class="nav-ring nav-ring-x" data-axis="${Axis3D.X}"></div>
        <div class="nav-ring nav-ring-y" data-axis="${Axis3D.Y}"></div>
        <div class="nav-ring nav-ring-z" data-axis="${Axis3D.Z}"></div>
        <div class="nav-tip nav-tip-x" data-axis="${Axis3D.X}" title="Eje X (Lateral derecha)">X</div>
        <div class="nav-tip nav-tip-nx" data-axis="${Axis3D.X}" data-negative="1" title="Eje −X (Lateral izquierda)">-X</div>
        <div class="nav-tip nav-tip-y" data-axis="${Axis3D.Y}" title="Eje Y (Superior / Planta)">Y</div>
        <div class="nav-tip nav-tip-ny" data-axis="${Axis3D.Y}" data-negative="1" title="Eje −Y (Inferior)">-Y</div>
        <div class="nav-tip nav-tip-z" data-axis="${Axis3D.Z}" title="Eje Z (Frontal)">Z</div>
        <div class="nav-tip nav-tip-nz" data-axis="${Axis3D.Z}" data-negative="1" title="Eje −Z (Posterior)">-Z</div>
        <div class="nav-center-cube" title="Perspectiva 3D orbital (clic) o restablecer (doble clic)">3D</div>
      </div>
    </div>
  `

  const rig = container.querySelector<HTMLElement>('.nav-rig')
  const sphere = container.querySelector<HTMLElement>('.nav-sphere')
  const RAD_TO_DEG = 180 / Math.PI

  // Rótulos (extremos de eje y cubo central): se guardan con su traslación base
  // sobre la esfera y en cada update() se les contrarrota para que el texto
  // enfrente siempre a la cámara, como el viewcube de Windows.
  const billboards = Array.from(
    container.querySelectorAll<HTMLElement>('.nav-tip, .nav-center-cube')
  ).map((el) => {
    const computed = window.getComputedStyle(el).transform
    return { el, base: computed && computed !== 'none' ? `${computed} ` : '' }
  })

  // Drag interaction to orbit the camera
  let isDragging = false
  let lastX = 0
  let lastY = 0
  // Distancia total arrastrada en el gesto actual (para distinguir clic de
  // arrastre) y control del doble clic manual: `preventDefault()` en
  // `pointerdown` puede suprimir el `dblclick` nativo, así que se detecta a
  // mano — dos pulsaciones sobre el cuerpo de la esfera en <400 ms sin mover.
  let dragDistance = 0
  let bodyPressActive = false
  let lastBodyClickAt = 0

  if (sphere) {
    sphere.addEventListener('pointerdown', (e) => {
      // Don't start drag if clicking directly on a button or tip with specific action
      const target = e.target as HTMLElement
      if (target.dataset.axis || target.classList.contains('nav-center-cube')) {
        return
      }
      isDragging = true
      bodyPressActive = true
      dragDistance = 0
      lastX = e.clientX
      lastY = e.clientY
      sphere.setPointerCapture(e.pointerId)
      e.preventDefault()
      e.stopPropagation()
    })

    sphere.addEventListener('pointermove', (e) => {
      if (!isDragging) return
      const deltaX = e.clientX - lastX
      const deltaY = e.clientY - lastY
      dragDistance += Math.abs(deltaX) + Math.abs(deltaY)
      lastX = e.clientX
      lastY = e.clientY

      if (options?.onOrbit) {
        options.onOrbit(deltaX, deltaY)
      }
      e.preventDefault()
      e.stopPropagation()
    })

    const stopDrag = (e: PointerEvent): void => {
      if (isDragging) {
        isDragging = false
        try {
          sphere.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }
      if (bodyPressActive) {
        bodyPressActive = false
        // ¿Fue un clic (sin arrastre)? Entonces evalúa el doble clic manual.
        if (dragDistance <= 3) {
          const now = performance.now()
          if (now - lastBodyClickAt < 400) {
            lastBodyClickAt = 0
            options?.onReset3D?.()
          } else {
            lastBodyClickAt = now
          }
        } else {
          lastBodyClickAt = 0
        }
      }
    }

    sphere.addEventListener('pointerup', stopDrag)
    sphere.addEventListener('pointercancel', stopDrag)

    // Axis click handlers (extremos + y − de cada eje)
    sphere.querySelectorAll<HTMLElement>('[data-axis]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const axis = el.dataset.axis as Axis3D
        if (axis && options?.onSnapAxis) {
          options.onSnapAxis(axis, el.dataset.negative === '1')
        }
      })
    })

    const centerCube = sphere.querySelector<HTMLElement>('.nav-center-cube')
    if (centerCube) {
      centerCube.addEventListener('click', (e) => {
        e.stopPropagation()
        if (options?.onReset3D) {
          options.onReset3D()
        }
      })
    }
  }

  const update = (state: CameraState): void => {
    if (!rig) return
    const pitchDeg = state.pitch * RAD_TO_DEG
    const yawDeg = -state.yaw * RAD_TO_DEG
    rig.style.transform = `rotateX(${pitchDeg}deg) rotateY(${yawDeg}deg)`
    // Contrarrotación de cada rótulo (rig = Rx·Ry ⇒ inverso = Ry(−y)·Rx(−p)):
    // la posición sigue girando con la esfera pero el texto nunca queda de
    // espaldas — siempre de cara al espectador.
    const counter = `rotateY(${-yawDeg}deg) rotateX(${-pitchDeg}deg)`
    for (const { el, base } of billboards) {
      el.style.transform = `${base}${counter}`
    }
  }

  update(new CameraState())
  return { update }
}

