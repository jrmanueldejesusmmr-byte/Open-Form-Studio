/**
 * Textos de la interfaz en español — **fuente única de verdad** para todos los
 * rótulos visibles. Tenerlos aquí (y no repartidos por cada panel) permite
 * traducir la app a otros idiomas más adelante sustituyendo solo este módulo, y
 * evita que un mismo texto se escriba con dos grafías distintas en dos paneles.
 *
 * Uso: `t('menu.file')`, `t('action.file.save')`… El tipo `MessageKey` es la
 * unión de todas las claves, así que un error tipográfico se detecta al compilar.
 */
const MESSAGES = {
  /* --- Marca y contenedores --- */
  'app.name': 'ArqStudio 3D',
  'app.subtitle': 'Herramientas AEC',
  'app.workspaceLabel': 'Espacio de trabajo 3D interactivo',
  'status.ready': 'Listo',
  'panel.toolboxRail': 'Herramientas',
  'hud.coords': 'Coord',
  'hud.view2d': '2D',
  'hud.view3d': '3D',
  'hud.convert': 'Convertir a plano',

  /* --- Títulos de menú (barra superior) --- */
  'menu.file': 'Archivo',
  'menu.drawing': 'Dibujo',
  'menu.annotation': 'Anotación',
  'menu.aec': 'Herramientas AEC',
  'menu.notas': 'Notas',
  'menu.view': 'Ver',
  'menu.aux': 'Auxiliar',
  'menu.aids': 'Ayudas',
  'menu.quickbar': 'Acceso rápido',

  /* --- Títulos de paneles --- */
  'panel.layers': 'Capas y propiedades',
  'panel.navigator': 'Navegador del Proyecto',
  'panel.toolbox': 'Herramientas AEC',
  'panel.chat': 'Chat de IA',
  'panel.materials': 'Materiales',

  /* --- Secciones (acordeones) --- */
  'section.designTools': 'Herramientas de diseño',
  'section.modifiers': 'Modificadores',
  'section.roofTypes': 'Tipos de techos',
  'section.materials': 'Paleta de materiales',
  'section.catalog': 'Catálogo de objetos',
  'section.shapes': 'Formas predefinidas',
  'section.furniture': 'Mobiliario',
  'section.openings': 'Puertas y ventanas',
  'section.properties': 'Propiedades',
  'section.layers': 'Capas',

  /* --- Propiedades de capa --- */
  'layer.lineType': 'Línea de tipo',
  'layer.color': 'Color',
  'layer.core': 'Núcleo',
  'layer.material': 'Materiales',
  'layer.zone': 'Zona interna',
  'layer.visibleAll': 'Mostrar / ocultar todas las capas',
  'layer.lockAll': 'Bloquear / desbloquear todas las capas',

  /* --- Estados varios --- */
  'state.db': 'Datos',
  'state.tool': 'Herramienta',
  'state.view': 'Vista',
  'state.planta': 'Planta',

  /* --- Acciones: Archivo --- */
  'action.file.dashboard': 'Ir a Mis proyectos',
  'action.file.new': 'Nuevo proyecto',
  'action.file.open': 'Abrir…',
  'action.file.save': 'Guardar',
  'action.file.import': 'Importar modelos / planos',
  'action.file.print': 'Imprimir…',
  'action.file.export': 'Exportar (DWG / IFC)',
  'action.file.clear': 'Vaciar escena',
  'action.file.exit': 'Salir',

  /* --- Acciones: Edición --- */
  'action.edit.undo': 'Deshacer',
  'action.edit.redo': 'Rehacer',
  'action.edit.copy': 'Copiar',
  'action.edit.cut': 'Recortar',
  'action.edit.delete': 'Borrar',
  'action.edit.selectAll': 'Seleccionar todo',

  /* --- Acciones: Dibujo --- */
  'action.tool.simpleWall': 'Muro simple',
  'action.tool.structuralSegment': 'Segmento estructural',
  'action.tool.roomWalls': 'Muros de habitación',
  'action.tool.roof': 'Cubierta / techo',
  'action.tool.slab': 'Losa / forjado',

  /* --- Propiedades del techo --- */
  'roof.label.type': 'Tipo',
  'roof.label.slope': 'Pendiente (°)',
  'roof.label.overhang': 'Alero (m)',
  'roof.label.thickness': 'Espesor (m)',
  'roof.label.material': 'Material',
  'roof.label.ridgeDir': 'Dirección de caballete',
  'roof.label.ridgeDir.x': 'Este–Oeste',
  'roof.label.ridgeDir.z': 'Norte–Sur',
  'roof.btn.rebalance': 'Reajustar techo',
  'roof.msg.openFootprint': 'Los muros no forman un contorno cerrado',
  'roof.msg.openFootprintCount': '%d extremos sin unir',
  'roof.msg.unsupportedShape': 'Forma no soportada: cubierta plana',
  'roof.msg.created': 'Techo creado (Ctrl+Z para deshacer)',
  'section.roofProps': 'Propiedades del techo',
  'action.tool.door': 'Puerta',
  'action.tool.window': 'Ventana',
  'action.tool.stairs': 'Escalera',
  'action.tool.add': 'Añadir elemento',
  'action.level.add': 'Añadir piso',
  'action.level.next': 'Subir al siguiente piso',

  /* --- Acciones: Modificadores --- */
  'action.modify.move': 'Mover',
  'action.modify.trim': 'Recortar',
  'action.modify.copy': 'Copiar',
  'action.modify.erase': 'Borrar',
  'action.modify.zoom': 'Zoom',

  /* --- Acciones: Herramientas de dibujo --- */
  'action.tool.pencil': 'Lápiz',
  'action.tool.highlighter': 'Resaltador',
  'action.tool.pen': 'Pluma / contorno',
  'action.tool.eraser': 'Borrador',
  'action.tool.ruler': 'Regla / cota',
  'action.tool.hand': 'Encuadrar (pan)',
  'action.tool.crosshair': 'Seleccionar',

  /* --- Acciones: Anotación --- */
  'action.annot.text': 'Texto',
  'action.annot.dimension': 'Cota lineal',
  'action.annot.tag': 'Etiqueta de material',
  'action.annot.highlight': 'Resaltador',

  /* --- Acciones: Herramientas AEC --- */
  'action.aec.testHouse': 'Casa de prueba',
  'action.aec.space': 'Zona / espacio',
  'action.aec.curtain': 'Muro cortina',
  'action.aec.core': 'Núcleo de muro',
  'action.aec.quantity': 'Medición / presupuesto',
  'action.aec.levels': 'Niveles y plantas',

  /* --- Acciones: Notas --- */
  'action.notas.note': 'Nota de texto',
  'action.notas.leader': 'Directriz',
  'action.notas.revision': 'Nube de revisión',
  'action.notas.table': 'Tabla de planos',

  /* --- Acciones: Vistas --- */
  'action.aux.2d': 'Vista 2D (planta)',
  'action.aux.3d': 'Vista 3D',
  'action.aux.fit': 'Ajustar a pantalla',
  'action.aux.reset': 'Restablecer vista',
  'action.aux.top': 'Vista superior',
  'action.aux.front': 'Vista frontal',
  'action.aux.right': 'Vista lateral',
  'action.aux.zoomIn': 'Acercar',
  'action.aux.zoomOut': 'Alejar',
  'action.view.orbit': 'Orbitar (girar cámara)',

  /* --- Acciones: Ayudas --- */
  'action.aids.grid': 'Cuadrícula',
  'action.aids.snap': 'Enganche a rejilla',
  'action.aids.ortho': 'Modo ortogonal',
  'action.aids.polar': 'Seguimiento polar',
  'action.aids.layers': 'Panel de capas y propiedades',

  /* --- Acciones: Paleta de comandos --- */
  'action.view.commandPalette': 'Paleta de comandos',

  /* --- Acciones: paneles acoplables (menú «Ver») --- */
  'action.view.toggleToolbox': 'Herramientas AEC',
  'action.view.toggleLayers': 'Capas y Propiedades',
  'action.view.toggleNavigator': 'Navegador del Proyecto',
  'action.view.toggleCosts': 'Costos / Presupuesto',
  'action.view.toggleChat': 'Chat de IA',
  'action.view.toggleTimeline': 'Línea de tiempo',
  'action.view.focusMode': 'Modo concentración',
  'action.view.resetLayout': 'Restablecer diseño',

  /* --- Paleta de comandos --- */
  'palette.title': 'Buscar comando',
  'palette.placeholder': 'Escribe el nombre de una acción…',
  'palette.empty': 'Ninguna acción coincide con la búsqueda.',
  'palette.hint': '↑ ↓ navegar · Intro ejecutar · Esc cerrar',
  'palette.disabled': 'No disponible ahora mismo',

  /* --- Categorías de acciones (agrupan la paleta) --- */
  'category.archivo': 'Archivo',
  'category.edicion': 'Edición',
  'category.dibujo': 'Dibujo',
  'category.modificadores': 'Modificadores',
  'category.herramientas': 'Herramientas',
  'category.anotacion': 'Anotación',
  'category.aec': 'Herramientas AEC',
  'category.notas': 'Notas',
  'category.vista': 'Vista',
  'category.ayudas': 'Ayudas',

  /* --- Autenticación (Login / Registro) --- */
  'auth.close': 'Cerrar',
  'auth.art.tagline': 'Diseña tu casa en 2D y 3D',
  'auth.login.title': 'Bienvenido de nuevo',
  'auth.login.subtitle': 'Inicia sesión para abrir el editor 3D.',
  'auth.signup.title': 'Crear cuenta',
  'auth.signup.subtitle': 'Guarda y edita tus proyectos en 2D y 3D.',
  'auth.field.name': 'Nombre completo',
  'auth.field.email': 'Correo electrónico',
  'auth.field.password': 'Contraseña',
  'auth.field.confirm': 'Confirmar contraseña',
  'auth.placeholder.name': 'Tu nombre completo',
  'auth.placeholder.email': 'tu@correo.com',
  'auth.placeholder.password': 'Escribe tu contraseña',
  'auth.placeholder.confirm': 'Repite tu contraseña',
  'auth.remember': 'Recordarme',
  'auth.forgot': '¿Olvidaste tu contraseña?',
  'auth.terms': 'Acepto los términos y la política de privacidad',
  'auth.submit.login': 'Iniciar sesión',
  'auth.submit.signup': 'Crear cuenta',
  'auth.busy.login': 'Iniciando sesión…',
  'auth.busy.signup': 'Creando cuenta…',
  'auth.divider': 'o continúa con',
  'auth.switch.login.question': '¿Ya tienes cuenta?',
  'auth.switch.login.action': 'Inicia sesión',
  'auth.switch.signup.question': '¿No tienes cuenta?',
  'auth.switch.signup.action': 'Regístrate',
  'auth.toggle.show': 'Mostrar contraseña',
  'auth.toggle.hide': 'Ocultar contraseña',
  'auth.strength.1': 'Muy débil',
  'auth.strength.2': 'Débil',
  'auth.strength.3': 'Aceptable',
  'auth.strength.4': 'Fuerte',
  'auth.match.ok': 'Las contraseñas coinciden',
  'auth.error.nameRequired': 'Escribe tu nombre completo.',
  'auth.error.emailRequired': 'Escribe tu correo electrónico.',
  'auth.error.emailInvalid': 'El correo no tiene un formato válido.',
  'auth.error.passwordRequired': 'Escribe tu contraseña.',
  'auth.error.passwordShort': 'La contraseña debe tener al menos 6 caracteres.',
  'auth.error.confirmRequired': 'Repite la contraseña.',
  'auth.error.confirmMismatch': 'Las contraseñas no coinciden.',
  'auth.error.terms': 'Debes aceptar los términos para continuar.',
  'auth.error.badCredentials': 'Correo o contraseña incorrectos.',
  'auth.error.emailTaken': 'Ese correo ya está registrado. Inicia sesión o usa otro correo.',
  'auth.error.offline': 'Sin conexión a internet. Comprueba tu red e inténtalo de nuevo.',
  'auth.error.provider': 'Este método de acceso aún no está disponible.',
  'auth.error.confirmEmail': 'Tu cuenta aún no ha sido confirmada. Revisa tu bandeja de entrada o carpeta de spam para verificarla.',
  'auth.banner.unconfirmed': 'Tu cuenta aún no ha sido confirmada. Revisa tu bandeja de entrada o carpeta de spam para verificarla.',
  'auth.button.resend': 'Reenviar correo de confirmación',
  'auth.button.resending': 'Reenviando…',
  'auth.button.resendCooldown': 'Reenviar de nuevo en %ds',
  'auth.banner.resendSuccess': 'Correo de confirmación reenviado con éxito a %s. Revisa tu bandeja.',
  'auth.error.rateLimit': 'Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.',
  'auth.error.generic': 'No se pudo completar la operación. Inténtalo de nuevo.'
} as const

export type MessageKey = keyof typeof MESSAGES

/** Devuelve el texto asociado a una clave. */
export function t(key: MessageKey): string {
  return MESSAGES[key]
}
