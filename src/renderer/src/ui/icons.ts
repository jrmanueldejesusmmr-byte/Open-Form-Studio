/**
 * Set de iconos SVG inline (estilo Lucide: trazo 24×24, `currentColor`).
 *
 * ¿Por qué no `lucide-react`? El proyecto es TypeScript + DOM puro (sin
 * React) y no tiene ninguna librería de iconos instalada, así que un set
 * propio evita añadir dependencias y funciona offline dentro de Electron.
 * Para usar otro icono basta con añadir su entrada a `ICONS`.
 */
const ICONS = {
  /* --- Ventana / barras superiores --- */
  minimize: '<path d="M5 12h14"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  minimize2: '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>',
  maximize: '<rect x="4" y="4" width="16" height="16" rx="1.5"/>',
  maximize2: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  restore: '<rect x="4" y="8" width="12" height="12" rx="1.5"/><path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4H19a1 1 0 0 1 1 1v9.5A1.5 1.5 0 0 1 18.5 16H16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<polygon points="7 4 19 12 7 20 7 4" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="1.5" fill="currentColor" stroke="none"/>',
  circleDot: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  video: '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9.5" ry="4"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(60 12 12)"/>',

  /* --- Archivo / edición --- */
  folderOpen: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4L10 8h6.5A1.5 1.5 0 0 1 18 9.5V11"/><path d="M3 11h17l-2.2 7.2A2 2 0 0 1 15.9 20H5.5A2.5 2.5 0 0 1 3 17.5z"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3"/><path d="M8 15h8v6H8z"/>',
  printer: '<path d="M7 9V3h10v6"/><path d="M5 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1"/><path d="M7 14h10v7H7z"/>',
  undo: '<path d="M4 8h10a5 5 0 0 1 0 10H9"/><path d="m8 4-4 4 4 4"/>',
  redo: '<path d="M20 8H10a5 5 0 0 0 0 10h5"/><path d="m16 4 4 4-4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15"/>',
  scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M20 4 8.5 16M8.5 8 20 20"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',

  /* --- Herramientas de dibujo --- */
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  pen: '<path d="M12 2 4 12l8 10 8-10z"/><circle cx="12" cy="12" r="2"/>',
  highlighter: '<path d="M4 20h7l10-10a2.83 2.83 0 0 0-4-4L7 16z"/><path d="m4 20 3-3"/>',
  eraser: '<path d="m5 15 7-7 7 7-3 3h-8z"/><path d="M4 21h16"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="M11 8.5v5M8.5 11h5"/><path d="m20 20-4.2-4.2"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="M8.5 11h5"/><path d="m20 20-4.2-4.2"/>',
  move: '<path d="M12 3v18M3 12h18"/><path d="m8 7 4-4 4 4M8 17l4 4 4-4M7 8 3 12l4 4M17 8l4 4-4 4"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11.5V7a1.5 1.5 0 0 1 3 0v7"/><path d="M8 12V9.5a1.5 1.5 0 0 0-3 0V15a6 6 0 0 0 6 6h2a6 6 0 0 0 6-6v-3"/>',
  crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H13a2.5 2.5 0 0 1 0-5h3.5A4.5 4.5 0 0 0 21 7.5C20.4 4.8 16.6 3 12 3z"/><circle cx="8" cy="9" r="1.2"/><circle cx="12" cy="7" r="1.2"/><circle cx="7" cy="14" r="1.2"/>',
  tag: '<path d="M20.6 13.6 12.4 21a2 2 0 0 1-2.8 0l-6.6-6.6V4h10.4l7.2 7.2a2 2 0 0 1 0 2.4z"/><circle cx="8" cy="8" r="1.4"/>',
  type: '<path d="M5 6V4h14v2"/><path d="M12 4v16M9 20h6"/>',
  shapes: '<path d="M4 20h7v-7H4z"/><circle cx="16.5" cy="7.5" r="4"/><path d="m13 20 4-6 4 6z"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',

  /* --- Vista / paneles --- */
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
  plan2d: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M9 4v16M4 14h5"/><path d="M14 9h3v3h-3z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  grid: '<path d="M4 9h16M4 15h16M9 4v16M15 4v16"/><rect x="4" y="4" width="16" height="16" rx="1"/>',
  calculator: '<rect x="4" y="5" width="16" height="14" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/><circle cx="9" cy="9" r="1.2"/><circle cx="12" cy="9" r="1.2"/><circle cx="15" cy="9" r="1.2"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M9.5 6.5A9.6 9.6 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.3 3.9"/><path d="M6.3 8.2A17 17 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 3.6-.7"/>',
  lock: '<rect x="4.5" y="10" width="15" height="10" rx="1.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  unlock: '<rect x="4.5" y="10" width="15" height="10" rx="1.5"/><path d="M8 10V7.5a4 4 0 0 1 7.5-1.9"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5 13.4 5l2.8-.5.6 2.8 2.6 1.2-1.3 2.6 1.3 2.6-2.6 1.2-.6 2.8-2.8-.5L12 21.5 10.6 19l-2.8.5-.6-2.8L4.6 15.5l1.3-2.6-1.3-2.6 2.6-1.2.6-2.8 2.8.5z"/>',
  sliders: '<path d="M5 5v5M5 14v5M12 5v8M12 17v2M19 5v2M19 11v8"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="19" cy="9" r="2"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronsLeft: '<path d="m11 6-6 6 6 6M19 6l-6 6 6 6"/>',

  /* --- Arquitectura / mobiliario --- */
  house: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-6h6v6"/>',
  roof: '<path d="M2 11h20L12 3z"/><path d="M6 11v9h12v-9"/>',
  wall: '<path d="M3 6h18v13H3z"/><path d="M3 10.5h18M3 15h18M9 6v4.5M15 10.5V15M9 15v4"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M4 21h16M14 12h.01"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  stairs: '<path d="M3 20h4v-4h4v-4h4V8h4V4h2"/>',
  sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 2 2v2h16v-2a2 2 0 0 1 2-2 1 1 0 0 1 0 2v4H2v-4a1 1 0 0 1 0-2z"/>',
  armchair: '<path d="M7 11V8a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3"/><path d="M5 11h14a2 2 0 0 1 2 2v4H3v-4a2 2 0 0 1 2-2z"/><path d="M6 17v2M18 17v2"/>',
  table: '<path d="M3 9h18v3H3z"/><path d="M5 12v9M19 12v9"/>',
  chair: '<path d="M7 10V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5"/><path d="M5 10h14v5H5z"/><path d="M7 15v6M17 15v6"/>',
  lamp: '<path d="M9 4h6l3 8H6z"/><path d="M12 12v6M9 21h6"/>',
  plant: '<path d="M12 21v-8"/><path d="M12 13c0-3 2-5 5-5 0 3-2 5-5 5z"/><path d="M12 13c0-3-2-5-5-5 0 3 2 5 5 5z"/><path d="M8 21h8"/>',
  bed: '<path d="M3 18v-6h18v6"/><path d="M3 18h18M6 12V9h5v3M11 12h7a3 3 0 0 1 3 3"/>',
  desk: '<path d="M3 8h18v3H3z"/><path d="M6 11v10M18 11v11"/><rect x="8" y="11" width="8" height="4"/>',

  /* --- IA / estado del sistema --- */
  astro: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-30 12 12)" stroke="currentColor" stroke-width="1.2"/><path d="M12 6.5L13.4 10.6L17.5 12L13.4 13.4L12 17.5L10.6 13.4L6.5 12L10.6 10.6L12 6.5Z" fill="currentColor"/>',
  sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z"/>',
  send: '<path d="m4 12 16-8-6 16-3-6z"/><path d="m11 14 9-10"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l4 2"/>',
  wifi: '<path d="M4 9a13 13 0 0 1 16 0M7 13a8.5 8.5 0 0 1 10 0"/><path d="M12 17h.01"/>',
  volume: '<path d="M5 9h3l4-4v14l-4-4H5z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  battery: '<rect x="3" y="8" width="16" height="8" rx="2"/><path d="M21 11v2"/><path d="M6 11v2M9 11v2"/>',
  plug: '<path d="M9 3v6M15 3v6"/><path d="M6 9h12v3a6 6 0 0 1-12 0z"/><path d="M12 18v3"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',

  /* --- Autenticación y pantalla inicial (Dashboard) --- */
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7.2 8.5 6 8.5-6"/>',
  logOut: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20H15"/><path d="m10.5 8-4 4 4 4"/><path d="M6.5 12H15"/>',
  loader: '<path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21"/><path d="m5.6 5.6 2.2 2.2M16.2 16.2l2.2 2.2M18.4 5.6l-2.2 2.2M7.8 16.2l-2.2 2.2"/>',
  alert: '<path d="M12 3.5 2.6 20h18.8z"/><path d="M12 9.5v4.5M12 17h.01"/>',
  arrowRight: '<path d="M4.5 12h14"/><path d="m12.5 6 6 6-6 6"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.4-3 8.3-7.5 9.5-4.5-1.2-7.5-5.1-7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',

  /* --- Escaneo 3D y Fotogrametría --- */
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  uploadCloud: '<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/><polyline points="16 16 12 12 8 16"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  fileText: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
  fileCode: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/>',
  fileJson: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  building: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',

  /* --- Colaboración y Mensajes (Lucide-style) --- */
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  messageSquare: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  messageCircle: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  userMinus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" x2="16" y1="11" y2="11"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/><line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="14" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/>',
  rotateCcw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  rotateCw: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  bellOff: '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
  radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>'
} as const

/**
 * Marcas de proveedores de autenticación: a diferencia del set anterior son
 * siluetas rellenas (fill), no trazos, para que se reconozcan a 16 px.
 */
const BRAND_ICONS = {
  google:
    '<path d="M21.35 11.1H12v3.2h5.35c-.5 2.4-2.5 3.85-5.35 3.85a5.9 5.9 0 0 1 0-11.8c1.5 0 2.86.55 3.92 1.45l2.34-2.33A9.2 9.2 0 0 0 12 2.8 9.2 9.2 0 1 0 12 21.2c5.3 0 8.82-3.72 8.82-8.96 0-.4-.03-.78-.09-1.14z"/>',
  github:
    '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.35-3.37-1.35-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.9.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.75c0 .26.18.58.69.48A10 10 0 0 0 12 2z"/>'
} as const

export type BrandIconName = keyof typeof BRAND_ICONS

/** Marca de proveedor lista para `innerHTML` (silueta rellena). */
export function brandIcon(name: BrandIconName, size = 16): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${BRAND_ICONS[name]}</svg>`
}

export type IconName = keyof typeof ICONS

/** Devuelve el markup de un icono listo para insertar en `innerHTML`. */
export function icon(name: IconName, size = 16): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
}
