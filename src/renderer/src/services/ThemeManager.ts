export type BackgroundThemeId = 'deep-dark' | 'space-blue' | 'cad-dark' | 'light-arch'
export type AccentColorId = 'electric-blue' | 'tech-cyan' | 'violet-magenta' | 'emerald' | 'cad-orange'
export type WorkBgStyleId = 'grid' | 'dots' | 'solid'
export type RenderQuality = 'high' | 'medium' | 'low'

export interface BackgroundThemeDef {
  id: BackgroundThemeId
  name: string
  subtitle: string
  bgApp: string
  bgPanel: string
  bgElevated: string
  bgCard: string
  bgChrome: string
  bgInput: string
  bgHover: string
  bgActive: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textDim: string
  textActive: string
  colorScheme: 'dark' | 'light'
  /** Color de fondo del lienzo 3D en Three.js (`scene.background`). */
  sceneBg: string
  /** Color de líneas maestras de `THREE.GridHelper`. */
  gridMajor: string
  /** Color de subdivisiones secundarias de `THREE.GridHelper`. */
  gridMinor: string
  /** Color de puntos en el estilo de fondo `'dots'`. */
  gridDots: string
}

export interface AccentColorDef {
  id: AccentColorId
  name: string
  hex: string
  hoverHex: string
  softRgba: string
  glowRgba: string
}

export interface ThemeConfig {
  themeId: BackgroundThemeId
  accentId: AccentColorId
  workBgStyle: WorkBgStyleId
  renderQuality: RenderQuality
  hardwareAcceleration: boolean
}

export const BACKGROUND_THEMES: Record<BackgroundThemeId, BackgroundThemeDef> = {
  'deep-dark': {
    id: 'deep-dark',
    name: 'Oscuro Profundo',
    subtitle: 'Deep Dark, #090D16',
    bgApp: '#090D16',
    bgPanel: '#111726',
    bgElevated: '#161F32',
    bgCard: '#111726',
    bgChrome: '#0E1320',
    bgInput: '#0B101C',
    bgHover: 'rgba(255, 255, 255, 0.06)',
    bgActive: 'rgba(255, 255, 255, 0.10)',
    border: 'rgba(255, 255, 255, 0.09)',
    borderStrong: 'rgba(255, 255, 255, 0.17)',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    textDim: '#64748B',
    textActive: '#FFFFFF',
    colorScheme: 'dark',
    sceneBg: '#090D16',
    gridMajor: '#334155',
    gridMinor: '#1A2438',
    gridDots: '#475569'
  },
  'space-blue': {
    id: 'space-blue',
    name: 'Azul Espacial',
    subtitle: 'Space Blue, #0B1528',
    bgApp: '#0B1528',
    bgPanel: '#132238',
    bgElevated: '#182B47',
    bgCard: '#132238',
    bgChrome: '#0E1A30',
    bgInput: '#0D182D',
    bgHover: 'rgba(125, 211, 252, 0.08)',
    bgActive: 'rgba(125, 211, 252, 0.14)',
    border: '#1E3A5F',
    borderStrong: '#2E558A',
    text: '#F0F6FC',
    textMuted: '#A5B8D4',
    textDim: '#6B87B0',
    textActive: '#FFFFFF',
    colorScheme: 'dark',
    sceneBg: '#0B1528',
    gridMajor: '#06B6D4',
    gridMinor: '#164E63',
    gridDots: '#22D3EE'
  },
  'cad-dark': {
    id: 'cad-dark',
    name: 'Gris Estudio',
    subtitle: 'CAD Dark, #121316',
    bgApp: '#121316',
    bgPanel: '#1C1E24',
    bgElevated: '#242730',
    bgCard: '#1C1E24',
    bgChrome: '#16181D',
    bgInput: '#14161B',
    bgHover: 'rgba(255, 255, 255, 0.06)',
    bgActive: 'rgba(255, 255, 255, 0.11)',
    border: 'rgba(255, 255, 255, 0.10)',
    borderStrong: 'rgba(255, 255, 255, 0.18)',
    text: '#F1F5F9',
    textMuted: '#A1A9B7',
    textDim: '#6E7681',
    textActive: '#FFFFFF',
    colorScheme: 'dark',
    sceneBg: '#121316',
    gridMajor: '#525663',
    gridMinor: '#262932',
    gridDots: '#6B7280'
  },
  'light-arch': {
    id: 'light-arch',
    name: 'Claro Arquitectónico',
    subtitle: 'Light Arch, #F8FAFC',
    bgApp: '#F8FAFC',
    bgPanel: '#FFFFFF',
    bgElevated: '#F8FAFC',
    bgCard: '#FFFFFF',
    bgChrome: '#F1F5F9',
    bgInput: '#FFFFFF',
    bgHover: 'rgba(15, 23, 42, 0.05)',
    bgActive: 'rgba(15, 23, 42, 0.09)',
    border: 'rgba(15, 23, 42, 0.14)',
    borderStrong: 'rgba(15, 23, 42, 0.24)',
    text: '#0F172A',
    textMuted: '#334155',
    textDim: '#64748B',
    textActive: '#0F172A',
    colorScheme: 'light',
    sceneBg: '#E2E8F0',
    gridMajor: '#64748B',
    gridMinor: '#94A3B8',
    gridDots: '#64748B'
  }
}

export const ACCENT_COLORS: Record<AccentColorId, AccentColorDef> = {
  'tech-cyan': {
    id: 'tech-cyan',
    name: 'Cian Tecnológico',
    hex: '#06B6D4',
    hoverHex: '#0891B2',
    softRgba: 'rgba(6, 182, 212, 0.18)',
    glowRgba: 'rgba(6, 182, 212, 0.45)'
  },
  'electric-blue': {
    id: 'electric-blue',
    name: 'Azul Eléctrico',
    hex: '#2563EB',
    hoverHex: '#1D4ED8',
    softRgba: 'rgba(37, 99, 235, 0.18)',
    glowRgba: 'rgba(37, 99, 235, 0.45)'
  },
  'violet-magenta': {
    id: 'violet-magenta',
    name: 'Violeta/Magenta',
    hex: '#8B5CF6',
    hoverHex: '#7C3AED',
    softRgba: 'rgba(139, 92, 246, 0.18)',
    glowRgba: 'rgba(139, 92, 246, 0.45)'
  },
  'emerald': {
    id: 'emerald',
    name: 'Esmeralda',
    hex: '#10B981',
    hoverHex: '#059669',
    softRgba: 'rgba(16, 185, 129, 0.18)',
    glowRgba: 'rgba(16, 185, 129, 0.45)'
  },
  'cad-orange': {
    id: 'cad-orange',
    name: 'Naranja CAD',
    hex: '#F97316',
    hoverHex: '#EA580C',
    softRgba: 'rgba(249, 115, 22, 0.18)',
    glowRgba: 'rgba(249, 115, 22, 0.45)'
  }
}

const STORAGE_KEY = 'openform_theme_config'

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  themeId: 'deep-dark',
  accentId: 'tech-cyan',
  workBgStyle: 'grid',
  renderQuality: 'high',
  hardwareAcceleration: true
}

class ThemeManager {
  private config: ThemeConfig
  private listeners = new Set<(config: ThemeConfig) => void>()

  constructor() {
    this.config = this.loadConfig()
    this.applyTheme(this.config)
  }

  public getConfig(): ThemeConfig {
    return { ...this.config }
  }

  public setTheme(themeId: BackgroundThemeId): void {
    if (BACKGROUND_THEMES[themeId]) {
      this.config.themeId = themeId
      this.saveAndApply()
    }
  }

  public setAccent(accentId: AccentColorId): void {
    if (ACCENT_COLORS[accentId]) {
      this.config.accentId = accentId
      this.saveAndApply()
    }
  }

  public setWorkBgStyle(style: WorkBgStyleId): void {
    this.config.workBgStyle = style
    this.saveAndApply()
  }

  public setRenderQuality(quality: RenderQuality): void {
    this.config.renderQuality = quality
    this.saveAndApply()
  }

  public setHardwareAcceleration(enabled: boolean): void {
    this.config.hardwareAcceleration = enabled
    this.saveAndApply()
  }

  public resetToDefaults(): void {
    this.config = { ...DEFAULT_THEME_CONFIG }
    this.saveAndApply()
  }

  public subscribe(listener: (config: ThemeConfig) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private loadConfig(): ThemeConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ThemeConfig>
        return {
          themeId: parsed.themeId && BACKGROUND_THEMES[parsed.themeId] ? parsed.themeId : DEFAULT_THEME_CONFIG.themeId,
          accentId: parsed.accentId && ACCENT_COLORS[parsed.accentId] ? parsed.accentId : DEFAULT_THEME_CONFIG.accentId,
          workBgStyle: parsed.workBgStyle || DEFAULT_THEME_CONFIG.workBgStyle,
          renderQuality: parsed.renderQuality || DEFAULT_THEME_CONFIG.renderQuality,
          hardwareAcceleration: parsed.hardwareAcceleration ?? DEFAULT_THEME_CONFIG.hardwareAcceleration
        }
      }
    } catch {
      // Usar defaults si hay error al leer localStorage
    }
    return { ...DEFAULT_THEME_CONFIG }
  }

  private saveAndApply(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config))
    } catch {
      // Ignorar quota exceeded o sandbox
    }
    this.applyTheme(this.config)
    for (const listener of this.listeners) {
      listener(this.config)
    }
  }

  public getThemeDef(): BackgroundThemeDef {
    return BACKGROUND_THEMES[this.config.themeId] || BACKGROUND_THEMES['deep-dark']
  }

  public getAccentDef(): AccentColorDef {
    return ACCENT_COLORS[this.config.accentId] || ACCENT_COLORS['tech-cyan']
  }

  public applyTheme(config: ThemeConfig): void {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const theme = BACKGROUND_THEMES[config.themeId] || BACKGROUND_THEMES['deep-dark']
    const accent = ACCENT_COLORS[config.accentId] || ACCENT_COLORS['tech-cyan']

    root.style.setProperty('color-scheme', theme.colorScheme)
    root.setAttribute('data-theme', theme.id)
    root.setAttribute('data-accent', accent.id)
    root.setAttribute('data-bg-style', config.workBgStyle)

    // Variables de fondo y paneles (convención interna + alias semánticos globales)
    root.style.setProperty('--bg-app', theme.bgApp)
    root.style.setProperty('--bg-primary', theme.bgApp)
    root.style.setProperty('--bg-panel', theme.bgPanel)
    root.style.setProperty('--bg-secondary', theme.bgPanel)
    root.style.setProperty('--bg-elevated', theme.bgElevated)
    root.style.setProperty('--bg-card', theme.bgCard)
    root.style.setProperty('--bg-chrome', theme.bgChrome)
    root.style.setProperty('--bg-input', theme.bgInput)
    root.style.setProperty('--bg-hover', theme.bgHover)
    root.style.setProperty('--bg-active', theme.bgActive)
    root.style.setProperty('--bg-sidebar', theme.bgPanel)
    root.style.setProperty('--bg-topbar', theme.bgChrome)
    root.style.setProperty('--bg-canvas', theme.sceneBg)

    // Variables de bordes y texto (convención interna + alias semánticos globales)
    root.style.setProperty('--border', theme.border)
    root.style.setProperty('--border-color', theme.border)
    root.style.setProperty('--border-strong', theme.borderStrong)
    root.style.setProperty('--border-subtle', theme.border)
    root.style.setProperty('--text', theme.text)
    root.style.setProperty('--text-primary', theme.text)
    root.style.setProperty('--text-muted', theme.textMuted)
    root.style.setProperty('--text-secondary', theme.textMuted)
    root.style.setProperty('--muted-color', theme.textMuted)
    root.style.setProperty('--text-dim', theme.textDim)
    root.style.setProperty('--text-active', theme.textActive)

    // Variables de acento dinámico
    root.style.setProperty('--accent', accent.hex)
    root.style.setProperty('--accent-color', accent.hex)
    root.style.setProperty('--accent-hover', accent.hoverHex)
    root.style.setProperty('--accent-soft', accent.softRgba)
    root.style.setProperty('--accent-glow', accent.glowRgba)
    root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${accent.hex} 0%, ${accent.hoverHex} 100%)`)

    // Si es tema claro vs oscuro, ajustar clases de apoyo
    if (theme.colorScheme === 'light') {
      root.classList.add('theme-light')
      root.classList.remove('theme-dark')
    } else {
      root.classList.add('theme-dark')
      root.classList.remove('theme-light')
    }
  }
}

export const themeManager = new ThemeManager()

