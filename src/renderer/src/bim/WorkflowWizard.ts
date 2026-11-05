import type { SceneManager } from '../engine/SceneManager'
import type { BimMasterTable } from './BimMasterTable'
import type { QuadViewBimManager } from './QuadViewBimManager'

export type WorkflowStepId = 1 | 2 | 3 | 4 | 5

export interface WorkflowWizardStep {
  id: WorkflowStepId
  title: string
  icon: string
  hint: string
  action: () => void
  validate: () => { valid: boolean; statusLabel: string; warning?: string }
}

export interface WorkflowWizardHandle {
  setActiveStep: (step: WorkflowStepId) => void
  getActiveStep: () => WorkflowStepId
  refresh: () => void
  destroy: () => void
}

export function mountWorkflowWizard(
  container: HTMLElement,
  options: {
    scene: SceneManager
    bimTable: BimMasterTable
    quadView?: QuadViewBimManager
    onSelectTool?: (toolId: string) => void
    onOpenBimTable?: () => void
  }
): WorkflowWizardHandle {
  const { scene, bimTable, quadView, onSelectTool, onOpenBimTable } = options

  let currentStep: WorkflowStepId = 1

  const steps: WorkflowWizardStep[] = [
    {
      id: 1,
      title: 'Terreno y Niveles',
      icon: '⛰️',
      hint: 'Define los niveles N.B.T del proyecto y la rasante del terreno.',
      action: () => {
        onSelectTool?.('level.add')
      },
      validate: () => {
        const levels = scene.getLevels()
        if (levels.length >= 1) {
          return { valid: true, statusLabel: `✔ ${levels.length} Niveles N.B.T` }
        }
        return { valid: false, statusLabel: '⚠️ Sin niveles configurados', warning: 'Crea al menos el Piso 0.' }
      }
    },
    {
      id: 2,
      title: 'Muros y Estructura',
      icon: '🧱',
      hint: 'Traza muros simples, columnas y losas. Auto-Sanitización activa.',
      action: () => {
        // Ejecuta auto-limpieza antes de trazar
        bimTable.autoSanitize()
        onSelectTool?.('tool.SimpleWall')
      },
      validate: () => {
        const walls = scene.getWalls()
        const totals = bimTable.getTotals()
        if (walls.length === 0) {
          return { valid: false, statusLabel: 'Pendiente', warning: 'Aún no se han trazado muros.' }
        }
        return {
          valid: true,
          statusLabel: `✔ ${walls.length} Muros (${totals.blocksCountTotal} bloques)`
        }
      }
    },
    {
      id: 3,
      title: 'Puertas, Ventanas y Cortes',
      icon: '🪟',
      hint: 'Inserta aberturas y verifica cortes constructivos.',
      action: () => {
        onSelectTool?.('tool.door')
        // Si hay muros, sugiere ver el corte
        if (scene.getWalls().length > 0 && quadView) {
          quadView.open()
        }
      },
      validate: () => {
        const walls = scene.getWalls()
        let count = 0
        for (const w of walls) count += w.openings.length
        return {
          valid: true,
          statusLabel: count > 0 ? `✔ ${count} Aberturas` : 'Listo para colocar'
        }
      }
    },
    {
      id: 4,
      title: 'Instalaciones MEP',
      icon: '⚡',
      hint: 'Traza tuberías eléctricas y cajas. Clash Detection activo en tiempo real.',
      action: () => {
        onSelectTool?.('tool.electrical')
      },
      validate: () => {
        const clashes = bimTable.getClashes()
        if (clashes.length > 0) {
          return {
            valid: false,
            statusLabel: `⚠️ ${clashes.length} Choque detectado`,
            warning: 'Existe interferencia entre tubería eléctrica y estructura.'
          }
        }
        return { valid: true, statusLabel: '✔ 0 Choques (Limpio)' }
      }
    },
    {
      id: 5,
      title: 'Tabla BIM, Cuantificación y Costos',
      icon: '💰',
      hint: 'Auditoría maestra de materiales, cómputo métrico y presupuesto financiero en USD.',
      action: () => {
        onOpenBimTable?.()
      },
      validate: () => {
        const totals = bimTable.getTotals()
        return {
          valid: true,
          statusLabel: `✔ $${totals.totalBudgetCost.toLocaleString('en-US')} USD (${totals.elementCount} elem.)`
        }
      }
    }
  ]

  const wizardEl = document.createElement('div')
  wizardEl.className = 'workflow-wizard-bar'
  wizardEl.setAttribute('id', 'workflow-wizard-bar')
  container.appendChild(wizardEl)

  function render(): void {
    const cur = steps.find((s) => s.id === currentStep) ?? steps[0]
    const curVal = cur.validate()

    wizardEl.innerHTML = `
      <div class="workflow-steps-track">
        ${steps
          .map((step, idx) => {
            const val = step.validate()
            const isActive = step.id === currentStep
            const badgeClass = val.valid ? 'workflow-status-badge--clean' : 'workflow-status-badge--warn'
            const arrowHtml = idx < steps.length - 1 ? `<span class="workflow-arrow">➔</span>` : ''

            return `
              <button
                class="workflow-step-btn ${isActive ? 'is-active' : ''}"
                data-step-id="${step.id}"
                title="${step.hint}"
              >
                <span class="workflow-step-num">${step.id}</span>
                <span>${step.icon} ${step.title}</span>
                <span class="workflow-status-badge ${badgeClass}">${val.statusLabel}</span>
              </button>
              ${arrowHtml}
            `
          })
          .join('')}
      </div>

      <div class="workflow-hint-area">
        <span>💡 <strong>Paso ${cur.id}:</strong> ${cur.hint}</span>
      </div>
    `

    wizardEl.querySelectorAll<HTMLButtonElement>('[data-step-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stepId = parseInt(btn.dataset.stepId || '1', 10) as WorkflowStepId
        currentStep = stepId
        const s = steps.find((step) => step.id === stepId)
        s?.action()
        render()
      })
    })
  }

  // Escuchar cambios de escena y de tabla para mantener las etiquetas validadas en vivo
  const unsubTable = bimTable.onChange(() => {
    render()
  })

  render()

  return {
    setActiveStep: (step: WorkflowStepId) => {
      currentStep = step
      const s = steps.find((st) => st.id === step)
      s?.action()
      render()
    },
    getActiveStep: () => currentStep,
    refresh: () => render(),
    destroy: () => {
      unsubTable()
      wizardEl.remove()
    }
  }
}

