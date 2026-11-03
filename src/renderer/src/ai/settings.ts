/** Ajustes de IA en caliente (renderer). Se leen en cada envío, así que un
 *  cambio aquí NO requiere reiniciar: la próxima orden ya usa el nuevo valor. */
export const aiSettings = {
  /** Function calling con Gemini (Fase 3). Por defecto APAGADO: mientras sea
   *  false, Astro funciona solo con el cerebro local, igual que antes. */
  geminiEnabled: false
}