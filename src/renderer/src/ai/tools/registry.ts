/** Registro central de herramientas (fuente única para cerebro y Gemini). */
import type { ToolDef } from './types'
import { crearMuro } from './walls'
import { crearHabitacion, alargarMuro } from './walls2'
import { moverMuro, borrarMuro, alturaMuro } from './walls3'
import { colocarPuerta } from './door'
import { colocarVentana } from './window'
import { colocarObjeto, moverObjeto } from './objects12'
import { borrarObjeto, aplicarMaterial, listarMateriales } from './objects3'
import { crearTecho } from './roof1'
import { editarTecho, crearPlanta, cambiarPlanta } from './rooflevels'
import { duplicarPlanta } from './duplevel'
import { crearCerca } from './fence'
import { colocarPorton } from './gate'
import { describirEscena, seleccionar } from './query'
import { deshacer, rehacer } from './undo'
import { generarCasa } from './house'
import { crearColumna, crearLosa, crearEscalera } from './primitives'
import { generarEdificio } from './building'
import { borrarHabitacion, unirHabitaciones, agregarHabitaciones, redimensionarHabitacion } from './roomOps'
export const AI_TOOLS: ReadonlyArray<ToolDef> = [
  crearMuro, crearHabitacion, alargarMuro, moverMuro, borrarMuro, alturaMuro,
  colocarPuerta, colocarVentana, colocarObjeto, moverObjeto, borrarObjeto,
  aplicarMaterial, listarMateriales,
  crearTecho, editarTecho,
  crearColumna, crearLosa, crearEscalera,
  crearPlanta, duplicarPlanta, cambiarPlanta,
  crearCerca, colocarPorton,
  describirEscena, seleccionar, deshacer, rehacer,
  generarCasa, generarEdificio,
  borrarHabitacion, unirHabitaciones, agregarHabitaciones, redimensionarHabitacion
]
const BY_NAME = new Map(AI_TOOLS.map((t) => [t.nombre, t]))
export function getTool(nombre: string): ToolDef | undefined {
  return BY_NAME.get(nombre)
}
export function listToolNames(): string[] {
  return AI_TOOLS.map((t) => t.nombre)
}
