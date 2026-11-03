import type { ProjectStore } from './ProjectStore'
import type { DashboardHandle } from '../ui/Dashboard'
import type { DashboardProject, ProjectMode } from '../models/DashboardProject'
import type { WorkspaceHandle } from '../workspace/mountWorkspace'
import {
  type ImportedFileResult,
  hasImportedContent
} from '../ui/ImportDialog'

export interface CreateProjectAfterImportDependencies {
  store: Pick<ProjectStore, 'create'>
  dashboard?: Pick<DashboardHandle, 'refresh'>
  openWorkspace?: (project: DashboardProject) => Promise<void>
  ensureWorkspace?: () => Promise<WorkspaceHandle>
  showDialogError?: (title: string, message?: string | null) => Promise<void>
}

/**
 * Crea el proyecto en almacenamiento tras una importación válida.
 * Si el resultado es null o cancelado:
 * - Cierra el diálogo y se queda en el dashboard.
 * - NO crea proyecto.
 * - NO escribe en la base de datos.
 * - NO muestra mensajes de error ni éxito.
 *
 * El proyecto se crea únicamente cuando el archivo se importó con éxito
 * y contiene geometría o datos válidos.
 */
export async function createProjectAfterImport(
  imported: ImportedFileResult | null | undefined,
  deps: CreateProjectAfterImportDependencies
): Promise<DashboardProject | null> {
  // 1. Si el diálogo resolvió null (cancelado, cerrado con X, Esc o clic fuera):
  // no crear proyecto, no escribir en BD y no mostrar mensajes.
  if (!imported) {
    return null
  }

  // 2. Solo crear si tiene contenido y se importó con éxito.
  if (!hasImportedContent(imported)) {
    return null
  }

  const name =
    imported.projectName?.trim() ||
    imported.fileName.replace(/\.[^.]+$/, '').trim() ||
    'Proyecto importado'

  const mode: ProjectMode =
    imported.format === 'dxf' || imported.format === 'svg' || imported.format === 'pdf'
      ? '2D'
      : '3D'

  const created = await deps.store.create({
    name,
    mode
  })

  if (!created.ok || !created.project) {
    if (deps.showDialogError) {
      await deps.showDialogError('No se pudo crear el proyecto importado', created.error)
    }
    return null
  }

  if (deps.dashboard) {
    await deps.dashboard.refresh()
  }

  if (deps.openWorkspace) {
    await deps.openWorkspace(created.project)
  }

  if (deps.ensureWorkspace) {
    const handle = await deps.ensureWorkspace()
    if (handle.applyImportedFile) {
      await handle.applyImportedFile(imported)
    }
  }

  return created.project
}

