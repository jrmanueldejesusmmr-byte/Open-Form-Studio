/** Panel de propiedades de una abertura (puerta o ventana) seleccionada.
 * Muestra campos para editar la variante, dimensiones, materiales y sentido de apertura.
 * Se usa cuando el usuario selecciona una puerta/ventana en el lienzo.
 */
import { SceneObject } from "../models/SceneObject"

/** Panel de propiedades de una abertura (puerta o ventana) seleccionada.
 * Muestra campos para editar la variante, dimensiones, materiales y sentido de apertura.
 * Se usa cuando el usuario selecciona una puerta/ventana en el lienzo.
 */
export interface DoorPropertiesPanelOptions {
  /** El objeto SceneObject de la puerta/ventana seleccionada. */
  object: SceneObject
  /** Callback cuando cambian las propiedades. */
  onChange: (props: Partial<DoorProperties>) => void
  /** Callback cuando se cierra el panel. */
  onClose: () => void
}

/** Propiedades editables de una puerta/ventana. */
export interface DoorProperties {
  /** Variante de la puerta (simple, doble, corrediza, garaje, vidrio, puerta-ventana). */
  variant: string
  /** Ancho del hueco en metros. */
  width: number
  /** Alto del hueco en metros. */
  height: number
  /** Material del catálogo para la hoja de la puerta. */
  leafMaterialId: string | null
  /** Material del catálogo para el marco de la puerta. */
  frameMaterialId: string | null
  /** Sentido de apertura (left-in, right-in, left-out, right-out). */
  swing: string
  /** Si la manilla debe mostrarse. */
  handleVisible: boolean
}

/** Componente panel de propiedades para puertas/ventanas. */
export function DoorPropertiesPanel(options: DoorPropertiesPanelOptions): void {
  const { object, onChange, onClose } = options

  // Elementos del DOM
  const container = document.createElement('div')
  container.className = 'properties-panel is-hidden'
  container.innerHTML = `
    <div class="panel-header">
      <h3>Propiedades de la abertura</h3>
      <button class="panel-close" aria-label="Cerrar panel">&times;</button>
    </div>
    <div class="panel-body">
      <div class="form-group">
        <label>Tipo</label>
        <select class="form-select" data-field="variant">
          <option value="simple">Puerta simple</option>
          <option value="doble">Puerta doble</option>
          <option value="corrediza">Puerta corrediza</option>
          <option value="garaje">Puerta de garaje</option>
          <option value="vidrio">Puerta de vidrio</option>
          <option value="puerta-ventana">Puerta-ventana</option>
        </select>
      </div>
      <div class="form-group">
        <label>Ancho (m)</label>
        <input type="number" class="form-input" data-field="width" step="0.01" min="0.1" />
      </div>
      <div class="form-group">
        <label>Alto (m)</label>
        <input type="number" class="form-input" data-field="height" step="0.01" min="0.1" />
      </div>
      <div class="form-group">
        <label>Material hoja</label>
        <select class="form-select" data-field="leafMaterialId">
          <option value="">Ninguno</option>
        </select>
      </div>
      <div class="form-group">
        <label>Material marco</label>
        <select class="form-select" data-field="frameMaterialId">
          <option value="">Ninguno</option>
        </select>
      </div>
      <div class="form-group">
        <label>Sentido de apertura</label>
        <select class="form-select" data-field="swing">
          <option value="left-in">Izquierda adentro</option>
          <option value="right-in">Derecha adentro</option>
          <option value="left-out">Izquierda afuera</option>
          <option value="right-out">Derecha afuera</option>
        </select>
      </div>
      <div class="form-group">
        <label>Manilla visible</label>
        <label class="checkbox-label">
          <input type="checkbox" data-field="handleVisible" />
          Mostrar manilla en la vista 3D
        </label>
      </div>
    </div>
    <div class="panel-footer">
      <button class="btn-save">Aplicar</button>
      <button class="btn-cancel">Cancelar</button>
    </div>
  `

  // Referencias a los campos del formulario
  const selectVariant = container.querySelector('[data-field="variant"]') as HTMLSelectElement
  const inputWidth = container.querySelector('[data-field="width"]') as HTMLInputElement
  const inputHeight = container.querySelector('[data-field="height"]') as HTMLInputElement
  const selectLeafMaterial = container.querySelector('[data-field="leafMaterialId"]') as HTMLSelectElement
  const selectFrameMaterial = container.querySelector('[data-field="frameMaterialId"]') as HTMLSelectElement
  const selectSwing = container.querySelector('[data-field="swing"]') as HTMLSelectElement
  const checkboxHandle = container.querySelector('[data-field="handleVisible"]') as HTMLInputElement

  // Inicializar el formulario con los valores actuales del objeto
  // Usar object.size.x para width y object.size.y para height (THREE.Vector3)
  selectVariant.value = object.openingVariant ?? 'simple'
  inputWidth.value = object.size.x.toString()
  inputHeight.value = object.size.y.toString()
  selectSwing.value = (object.openingAngle ?? 0).toString()

  // Cargar materiales del catálogo (asíncronamente después de renderizar)
  requestAnimationFrame(loadMaterials)

  function loadMaterials(): void {
    // Usar require como los otros archivos del proyecto (sin extensión .ts)
    const { MATERIAL_CATALOG } = require('../catalog/materials')
    const leafOptions = MATERIAL_CATALOG.map((mat: any) => `
      <option value="${mat.id}" ${mat.id === object.leafMaterialId ? 'selected' : ''}>
        ${mat.label}
      </option>
    `).join('')

    const frameOptions = MATERIAL_CATALOG.map((mat: any) => `
      <option value="${mat.id}" ${mat.id === object.frameMaterialId ? 'selected' : ''}>
        ${mat.label}
      </option>
    `).join('')

    selectLeafMaterial.innerHTML = '<option value="">Ninguno</option>' + leafOptions
    selectFrameMaterial.innerHTML = '<option value="">Ninguno</option>' + frameOptions
  }

  // Actualizar el objeto cuando cambian los campos
  function updateObject(): void {
    // Usar object.size.x/y para width/height (Vector3)
    if (inputWidth.value !== '') object.size.x = parseFloat(inputWidth.value)
    if (inputHeight.value !== '') object.size.y = parseFloat(inputHeight.value)

    const props: DoorProperties = {
      variant: selectVariant.value,
      width: object.size.x || 0.9,
      height: object.size.y || 2.1,
      leafMaterialId: selectLeafMaterial.value ?? null,
      frameMaterialId: selectFrameMaterial.value ?? null,
      swing: selectSwing.value,
      handleVisible: checkboxHandle.checked
    }
    onChange(props)
  }

  // Event listeners para los campos
  selectVariant.addEventListener('change', updateObject)
  inputWidth.addEventListener('input', updateObject)
  inputHeight.addEventListener('input', updateObject)
  selectSwing.addEventListener('change', updateObject)
  checkboxHandle.addEventListener('change', updateObject)

  // Botones
  const btnSave = container.querySelector('.btn-save') as HTMLButtonElement
  const btnCancel = container.querySelector('.btn-cancel') as HTMLButtonElement
  const panelClose = container.querySelector('.panel-close') as HTMLButtonElement

  btnSave.addEventListener('click', () => {
    updateObject()
    container.classList.add('is-hidden')
    onClose()
  })

  btnCancel.addEventListener('click', () => {
    container.classList.add('is-hidden')
    onClose()
  })

  panelClose.addEventListener('click', () => {
    container.classList.add('is-hidden')
    onClose()
  })

  // Añadir al DOM (el caller se encargará de posicionarlo)
  document.body.appendChild(container)
}

/** Abre el panel de propiedades para un objeto de abertura. */
export function openDoorPropertiesPanel(object: SceneObject): void {
  const container = document.querySelector('.properties-panel')
  // Usar casting para evitar el error TS2339 de remove en tipo never
  const propsPanel = container as HTMLElement | null
  if (propsPanel) {
    propsPanel.classList.remove('is-hidden')
    return
  }

  // Llamar directamente a DoorPropertiesPanel (es una función, no una clase)
  DoorPropertiesPanel({
    object,
    onChange: (props) => {
      if (props.variant) object.openingVariant = props.variant
      if (props.width !== undefined) object.size.x = props.width
      if (props.height !== undefined) object.size.y = props.height
      if (props.leafMaterialId !== undefined) object.leafMaterialId = props.leafMaterialId
      if (props.frameMaterialId !== undefined) object.frameMaterialId = props.frameMaterialId
      if (props.swing) object.openingAngle = parseInt(props.swing) || 0
      if (props.handleVisible !== undefined) object.handleVisible = props.handleVisible
    },
    onClose: () => {
      // El container se removerá dentro de DoorPropertiesPanel
    }
  })
}
