import { icon, IconName } from './icons'

/**
 * Navegador del Proyecto (columna derecha): árbol de plantas, secciones,
 * fachadas y navegación 3D. Sustituye a la antigua galería inferior
 * ("Diseños de Cosas"): los diseños de ejemplo pasan a ser las plantas del
 * árbol y se cargan en el lienzo al seleccionarlas.
 */
export interface NavigatorNode {
  id: string
  label: string
  icon: IconName
  children?: NavigatorNode[]
  /** Índice del ProjectDesign que esta planta carga en el lienzo. */
  designIndex?: number
  /** Acción especial del motor asociada al nodo. */
  action?: 'fit-3d' | 'fit-2d'
  /** Marca el nodo como un piso (nivel) del proyecto. */
  kind?: 'level'
  /** Id del nivel (`Level.id`) que representa este nodo. */
  levelId?: string
  /** Visibilidad actual del piso (ojo del Navegador). */
  visible?: boolean
  /** true si es el piso activo (muestra además los controles de edición). */
  isActive?: boolean
}

/** Acciones propias de los pisos; las resuelve el workspace. */
export type LevelNodeAction =
  | 'add'
  | 'next'
  | 'toggle-visible'
  | 'solo'
  | 'rename'
  | 'height'
  | 'delete'

export interface ProjectNavigatorOptions {
  tree: readonly NavigatorNode[]
  /** Se invoca al seleccionar cualquier nodo del árbol. */
  onSelect: (node: NavigatorNode) => void
  /** Se invoca en los botones de piso (ojo, solo, renombrar, añadir, subir…). */
  onLevelAction?: (action: LevelNodeAction, levelId?: string) => void
}

export interface ProjectNavigatorHandle {
  /** Marca un nodo como seleccionado (sin disparar `onSelect`). */
  select: (nodeId: string) => void
  /** Sustituye el árbol (p. ej. al añadir/eliminar un piso) y repinta. */
  setTree: (tree: readonly NavigatorNode[]) => void
}

const DEFAULT_EXPANDED = ['project', 'floors']

/** Tope de profundidad al pintar el árbol: garantiza que la recursión siempre acaba. */
const MAX_TREE_DEPTH = 32

/** Escapa texto del usuario (renombrar un piso) para insertarlo en el HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Botones de un nodo-piso: ojo (ocultar/mostrar) y «solo este piso» siempre;
 * renombrar, altura y eliminar sólo en el piso activo (evita filas saturadas).
 */
function renderLevelTools(node: NavigatorNode): string {
  const levelId = escapeHtml(node.levelId ?? node.id)
  const hidden = node.visible === false
  const tools = [
    `<button class="icon-btn icon-btn--tiny" data-level-action="toggle-visible" data-level-id="${levelId}" title="${hidden ? 'Mostrar piso' : 'Ocultar piso'}">${icon(hidden ? 'eyeOff' : 'eye', 13)}</button>`,
    `<button class="icon-btn icon-btn--tiny" data-level-action="solo" data-level-id="${levelId}" title="Mostrar solo este piso">${icon('maximize', 13)}</button>`
  ]
  if (node.isActive) {
    tools.push(
      `<button class="icon-btn icon-btn--tiny" data-level-action="rename" data-level-id="${levelId}" title="Renombrar piso">${icon('pencil', 13)}</button>`,
      `<button class="icon-btn icon-btn--tiny" data-level-action="height" data-level-id="${levelId}" title="Cambiar altura del piso">${icon('sliders', 13)}</button>`,
      `<button class="icon-btn icon-btn--tiny" data-level-action="delete" data-level-id="${levelId}" title="Eliminar piso">${icon('trash', 13)}</button>`
    )
  }
  return `<span class="tree-node__tools">${tools.join('')}</span>`
}

function renderNode(node: NavigatorNode, depth: number, expanded: Set<string>, selected: string | null): string {
  // Condición de parada explícita: con datos anidados en exceso la rama se
  // corta en vez de recursar sin fin.
  if (depth > MAX_TREE_DEPTH) return ''

  const hasChildren = (node.children?.length ?? 0) > 0
  const isOpen = expanded.has(node.id)
  const chevron = hasChildren
    ? `<span class="tree-node__toggle">${icon(isOpen ? 'chevronDown' : 'chevronRight', 13)}</span>`
    : '<span class="tree-node__toggle tree-node__toggle--empty"></span>'

  const row = `<button class="tree-node__row${selected === node.id ? ' is-selected' : ''}"
              data-node="${escapeHtml(node.id)}"
              style="padding-left:${6 + depth * 13}px">
        ${chevron}
        <span class="tree-node__icon">${icon(node.icon, 13)}</span>
        <span class="tree-node__label">${escapeHtml(node.label)}</span>
      </button>`

  // Los botones de piso van FUERA del <button> de la fila (HTML válido) y en
  // una línea flex que mantiene la fila flexible a su izquierda.
  const head =
    node.kind === 'level'
      ? `<div class="tree-node__line">${row}${renderLevelTools(node)}</div>`
      : row

  return `<div class="tree-node">
      ${head}
      ${
        hasChildren && isOpen
          ? `<div class="tree-node__children">${node.children!
              .map((child) => renderNode(child, depth + 1, expanded, selected))
              .join('')}</div>`
          : ''
      }
    </div>`
}

export function mountProjectNavigator(
  container: HTMLElement,
  options: ProjectNavigatorOptions
): ProjectNavigatorHandle {
  const expanded = new Set(DEFAULT_EXPANDED)
  let selected: string | null = null
  // Árbol vivo: `setTree` lo sustituye (p. ej. al crear, renombrar o borrar un piso).
  let tree: readonly NavigatorNode[] = options.tree

  container.innerHTML = `
    <header class="panel__head">
      <span class="panel__title">${icon('folderOpen', 14)} Navegador del Proyecto</span>
      <div class="panel__icons">
        <button class="icon-btn" data-nav-action="add-level" title="Añadir piso">${icon('plus', 14)}</button>
        <button class="icon-btn" data-nav-action="next-level" title="Subir al siguiente piso">${icon('stairs', 14)}</button>
        <button class="icon-btn" data-nav-action="expand" title="Desplegar todo">${icon('chevronDown', 14)}</button>
        <button class="icon-btn" data-nav-action="collapse" title="Plegar todo">${icon('chevronRight', 14)}</button>
        <button class="icon-btn" data-nav-action="fit" title="Encuadrar la vista">${icon('crosshair', 14)}</button>
        <button class="icon-btn" data-panel-close title="Cerrar panel lateral">${icon('close', 14)}</button>
      </div>
    </header>
    <div class="panel__body panel__body--flush" id="navigator-body"></div>
  `

  const body = container.querySelector<HTMLDivElement>('#navigator-body')!

  function render(): void {
    body.innerHTML = `<div class="tree">${tree
      .map((node) => renderNode(node, 0, expanded, selected))
      .join('')}</div>`

    body.querySelectorAll<HTMLButtonElement>('.tree-node__row').forEach((row) => {
      row.addEventListener('click', () => {
        const nodeId = row.dataset.node ?? ''
        const node = findNode(tree, nodeId)
        if (!node) return

        const hasChildren = (node.children?.length ?? 0) > 0
        if (hasChildren && expanded.has(node.id)) expanded.delete(node.id)
        else expanded.add(node.id)

        selected = node.id
        render()
        options.onSelect(node)
      })
    })

    // Botones de piso: viven fuera de la fila (HTML válido) y no seleccionan.
    body.querySelectorAll<HTMLButtonElement>('[data-level-action]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation()
        const action = btn.dataset.levelAction as LevelNodeAction | undefined
        if (!action) return
        options.onLevelAction?.(action, btn.dataset.levelId)
      })
    })
  }

  container.querySelector('[data-nav-action="add-level"]')?.addEventListener('click', () => {
    options.onLevelAction?.('add')
  })

  container.querySelector('[data-nav-action="next-level"]')?.addEventListener('click', () => {
    options.onLevelAction?.('next')
  })

  container.querySelector('[data-nav-action="expand"]')?.addEventListener('click', () => {
    collectIds(tree).forEach((id) => expanded.add(id))
    render()
  })

  container.querySelector('[data-nav-action="collapse"]')?.addEventListener('click', () => {
    expanded.clear()
    render()
  })

  container.querySelector('[data-nav-action="fit"]')?.addEventListener('click', () => {
    options.onSelect({ id: 'fit', label: 'Encuadrar', icon: 'crosshair', action: 'fit-3d' })
  })

  render()

  return {
    select(nodeId: string): void {
      selected = nodeId
      render()
    },
    setTree(next: readonly NavigatorNode[]): void {
      tree = next
      render()
    }
  }
}

function findNode(
  nodes: readonly NavigatorNode[],
  id: string,
  seen = new Set<NavigatorNode>()
): NavigatorNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    // Un nodo ya visitado se ignora: corta cualquier ciclo en los datos del
    // árbol, que antes provocaría una recursión infinita.
    if (seen.has(node)) continue
    seen.add(node)
    const found = node.children ? findNode(node.children, id, seen) : undefined
    if (found) return found
  }
  return undefined
}

function collectIds(nodes: readonly NavigatorNode[], seen = new Set<NavigatorNode>()): string[] {
  return nodes.flatMap((node) => {
    if (seen.has(node)) return []
    seen.add(node)
    return [node.id, ...(node.children ? collectIds(node.children, seen) : [])]
  })
}
