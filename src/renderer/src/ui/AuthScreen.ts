import loginArt from '../assets/auth/login-art.png'
import { t, type MessageKey } from '../i18n/es'
import { type AuthProvider, type AuthService, type AuthResult } from '../services/AuthService'
import { brandIcon, icon } from './icons'

/**
 * Pantalla/modal de autenticación (Login y Registro) sobre Supabase.
 *
 * Diseño de dos columnas: a la izquierda la ilustración de marca con degradado
 * azul marino, el logotipo y la frase «Diseña tu casa en 2D y 3D»; a la derecha
 * el formulario. Todos los rótulos son en español y salen del sistema de
 * traducciones (`i18n/es.ts`).
 *
 * Esta capa SOLO maneja interfaz: la lógica de sesión sigue viva en
 * `services/AuthService.ts` (Supabase o modo local) y aquí no se toca. Los
 * mensajes que llegan de Supabase se traducen a un texto claro con
 * `friendlyError()` antes de mostrarlos. Nunca se escribe el correo ni la
 * contraseña en consola ni en ningún log.
 */

export type AuthMode = 'login' | 'signup'

export interface AuthScreenOptions {
  auth: AuthService
  /** Se dispara cuando la sesión queda activa (para reanudar la acción pendiente). */
  onAuthenticated(): void
}

export interface AuthScreenHandle {
  open(mode?: AuthMode, reason?: string): void
  close(): void
  isOpen(): boolean
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 6
/** Correo recordado para la casilla «Recordarme» (solo en este equipo). */
const REMEMBER_KEY = 'arqstudio.auth.rememberEmail.v1'

/**
 * Traduce a un texto claro y en español los mensajes que devuelve Supabase
 * (o el AuthService). Se aplica SOLO en la capa de interfaz: `AuthService`
 * no se modifica. Nunca registra el mensaje en consola.
 */
function friendlyError(message: string): string {
  const text = (message || '').toLowerCase()
  // Google/GitHub deshabilitados en Supabase: evitar el texto técnico.
  if (
    (text.includes('provider') || text.includes('proveedor') || text.includes('google') || text.includes('github')) &&
    (text.includes('not enabled') || text.includes('no está habilitado') || text.includes('not supported'))
  ) {
    return t('auth.error.provider')
  }
  if (text.includes('invalid login credentials') || text.includes('invalid_credentials') || text.includes('incorrectos')) {
    return t('auth.error.badCredentials')
  }
  if (text.includes('already registered') || text.includes('already has an account') || text.includes('ya tiene una cuenta') || text.includes('user already exists')) {
    return t('auth.error.emailTaken')
  }
  if (
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('network request failed') ||
    text.includes('load failed') ||
    text.includes('no se pudo conectar') ||
    text.includes('revisa la conexión') ||
    text.includes('fetch')
  ) {
    return t('auth.error.offline')
  }
  if (
    text.includes('email not confirmed') ||
    text.includes('no ha sido confirmada') ||
    (text.includes('confirmar') && text.includes('correo'))
  ) {
    return t('auth.error.confirmEmail')
  }
  if (text.includes('rate limit') || text.includes('too many') || text.includes('demasiados')) {
    return t('auth.error.rateLimit')
  }
  if (text.includes('password should be at least') || (text.includes('contraseña') && text.includes('al menos'))) {
    return t('auth.error.passwordShort')
  }
  if (text.includes('unable to validate email') || text.includes('invalid email') || text.includes('formato válido')) {
    return t('auth.error.emailInvalid')
  }
  return message || t('auth.error.generic')
}

/** Fortaleza de la contraseña: 0 (vacía) … 4 (fuerte). */
function passwordStrength(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= MIN_PASSWORD) score++
  if (password.length >= 10) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return Math.max(1, Math.min(4, score))
}

/** Lee el correo guardado por «Recordarme» (vacío si no hay ninguno). */
function readRememberedEmail(): string {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Guarda (o borra con cadena vacía) el correo de «Recordarme». */
function storeRememberedEmail(email: string): void {
  try {
    if (email) window.localStorage.setItem(REMEMBER_KEY, email)
    else window.localStorage.removeItem(REMEMBER_KEY)
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

/** Campo con etiqueta, icono, control y hueco de error accesible. */
function field(
  name: string,
  label: string,
  input: string,
  iconName: 'user' | 'mail' | 'lock',
  below = ''
): string {
  return `
    <div class="auth-field" data-field="${name}">
      <label class="auth-field__label" for="auth-${name}">${label}</label>
      <div class="auth-field__control">
        <span class="auth-field__icon" aria-hidden="true">${icon(iconName, 15)}</span>
        ${input}
      </div>
      ${below}
      <p class="auth-field__error" id="auth-${name}-error" data-error-for="${name}" aria-live="polite"></p>
    </div>`
}

function textInput(name: string, type: string, placeholder: string, autocomplete: string, value = ''): string {
  return `<input class="auth-field__input" id="auth-${name}" type="${type}" name="${name}" placeholder="${placeholder}" autocomplete="${autocomplete}" aria-describedby="auth-${name}-error" value="${value.replace(/"/g, '&quot;')}" />`
}

function passwordInput(name: string, placeholder: string, autocomplete: string): string {
  return `
    <input class="auth-field__input auth-field__input--password" id="auth-${name}" type="password" name="${name}" placeholder="${placeholder}" autocomplete="${autocomplete}" aria-describedby="auth-${name}-error" />
    <button class="auth-field__toggle" type="button" data-toggle-password="${name}" title="${t('auth.toggle.show')}" aria-label="${t('auth.toggle.show')}" aria-pressed="false">${icon('eye', 15)}</button>`
}

export function mountAuthScreen(container: HTMLElement, options: AuthScreenOptions): AuthScreenHandle {
  let mode: AuthMode = 'login'
  let reason = ''
  let busy = false
  let rememberMe = false
  let termsAccepted = false
  let unconfirmedEmail: string | null = null
  let isResending = false
  let cooldownRemaining = 0
  let cooldownTimer: number | null = null
  /** Campos en los que ya se editó: la validación al salir no molesta antes. */
  const touched = new Set<string>()
  const values: Record<string, string> = { name: '', email: '', password: '', confirm: '' }

  container.classList.add('is-hidden')

  function clearCooldown(): void {
    if (cooldownTimer !== null) {
      window.clearInterval(cooldownTimer)
      cooldownTimer = null
    }
    cooldownRemaining = 0
  }

  function startCooldown(seconds = 60): void {
    clearCooldown()
    cooldownRemaining = seconds
    updateResendButtonState()

    cooldownTimer = window.setInterval(() => {
      cooldownRemaining--
      if (cooldownRemaining <= 0) {
        clearCooldown()
      }
      updateResendButtonState()
    }, 1000)
  }

  function updateResendButtonState(): void {
    const btn = container.querySelector<HTMLButtonElement>('[data-resend-confirmation]')
    if (!btn) return

    if (isResending) {
      btn.disabled = true
      btn.innerHTML = `<span class="auth__spinner">${icon('loader', 13)}</span> ${t('auth.button.resending')}`
      return
    }

    if (cooldownRemaining > 0) {
      btn.disabled = true
      btn.textContent = t('auth.button.resendCooldown').replace('%d', String(cooldownRemaining))
      return
    }

    btn.disabled = false
    btn.textContent = t('auth.button.resend')
  }

  function clearUnconfirmedBanner(): void {
    unconfirmedEmail = null
    const banner = container.querySelector<HTMLElement>('[data-unconfirmed-banner]')
    if (banner) {
      banner.style.display = 'none'
      banner.innerHTML = ''
    }
  }

  function setBannerError(message: string): void {
    const errorEl = container.querySelector<HTMLElement>('[data-unconfirmed-error]')
    if (errorEl) {
      errorEl.textContent = message
      errorEl.style.display = message ? 'block' : 'none'
    }
  }

  function showUnconfirmedBanner(
    email: string,
    state: 'warning' | 'success' = 'warning',
    customMessage?: string
  ): void {
    unconfirmedEmail = email

    // Ocultar mensajes de error genéricos para dar prioridad y foco al banner
    const generalBox = container.querySelector<HTMLElement>('[data-auth-message]')
    if (generalBox) {
      generalBox.textContent = ''
      generalBox.className = 'auth__message'
    }

    const banner = container.querySelector<HTMLElement>('[data-unconfirmed-banner]')
    if (!banner) return

    const isWarning = state === 'warning'
    banner.style.display = 'flex'
    banner.className = isWarning
      ? 'auth__banner auth__banner--warning bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-lg p-3'
      : 'auth__banner auth__banner--success bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 rounded-lg p-3'

    const messageText =
      customMessage ||
      (isWarning
        ? t('auth.banner.unconfirmed')
        : t('auth.banner.resendSuccess').replace('%s', email))

    banner.innerHTML = `
      <div class="auth__banner-header">
        <span class="auth__banner-icon" aria-hidden="true">${icon(isWarning ? 'mail' : 'check', 16)}</span>
        <p class="auth__banner-text">${messageText}</p>
      </div>
      <div class="auth__banner-actions">
        <button type="button" class="auth__resend-btn" data-resend-confirmation>
          ${t('auth.button.resend')}
        </button>
      </div>
      <p class="auth__banner-error" data-unconfirmed-error style="display: none;"></p>
    `

    const resendBtn = banner.querySelector<HTMLButtonElement>('[data-resend-confirmation]')
    resendBtn?.addEventListener('click', () => {
      void handleResend()
    })

    updateResendButtonState()
  }

  async function handleResend(): Promise<void> {
    if (isResending || cooldownRemaining > 0) return
    const targetEmail = (unconfirmedEmail || values.email || '').trim().toLowerCase()
    if (!targetEmail) {
      setBannerError(t('auth.error.emailRequired'))
      return
    }

    isResending = true
    setBannerError('')
    updateResendButtonState()

    try {
      const result = await options.auth.resendVerificationEmail(targetEmail)
      isResending = false

      if (result.ok || result.success) {
        showUnconfirmedBanner(
          targetEmail,
          'success',
          t('auth.banner.resendSuccess').replace('%s', targetEmail)
        )
        startCooldown(60)
      } else {
        updateResendButtonState()
        const errMsg = friendlyError(result.error || '')
        setBannerError(errMsg)
        if (result.code === 'RATE_LIMITED' || (result.error && result.error.toLowerCase().includes('rate limit'))) {
          startCooldown(60)
        }
      }
    } catch {
      isResending = false
      updateResendButtonState()
      setBannerError(t('auth.error.offline'))
    }
  }

  function open(nextMode: AuthMode = 'login', nextReason = ''): void {
    mode = nextMode
    reason = nextReason
    // «Recordarme»: si hay un correo guardado se precarga y se marca la casilla.
    const remembered = readRememberedEmail()
    if (remembered) {
      if (!values.email) values.email = remembered
      rememberMe = true
    }
    container.classList.remove('is-hidden')
    render()
    // El foco puede no estar disponible en entornos embebidos.
    try {
      container.querySelector<HTMLInputElement>('input[name="email"]')?.focus()
    } catch {
      /* sin foco disponible */
    }
  }

  function close(): void {
    clearCooldown()
    clearUnconfirmedBanner()
    container.classList.add('is-hidden')
    container.innerHTML = ''
  }

  function isOpen(): boolean {
    return !container.classList.contains('is-hidden')
  }

  function setError(message: string): void {
    clearUnconfirmedBanner()
    const box = container.querySelector<HTMLElement>('[data-auth-message]')
    if (box) {
      box.textContent = message
      box.className = 'auth__message auth__message--error'
    }
  }

  function setNotice(message: string): void {
    clearUnconfirmedBanner()
    const box = container.querySelector<HTMLElement>('[data-auth-message]')
    if (box) {
      box.textContent = message
      box.className = 'auth__message auth__message--notice'
    }
  }

  function clearErrorFor(name: string): void {
    const error = container.querySelector<HTMLElement>(`[data-error-for="${name}"]`)
    if (error) error.textContent = ''
    container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.removeAttribute('aria-invalid')
  }

  function setFieldError(name: string, message: string): void {
    const error = container.querySelector<HTMLElement>(`[data-error-for="${name}"]`)
    if (error) error.textContent = message
    container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.setAttribute('aria-invalid', 'true')
  }

  /** Valida un campo y pinta/limpia su error en español. Devuelve si es válido. */
  function validateField(name: 'name' | 'email' | 'password' | 'confirm'): boolean {
    clearErrorFor(name)
    const value = values[name] ?? ''

    switch (name) {
      case 'name':
        if (mode === 'signup' && !value.trim()) {
          setFieldError(name, t('auth.error.nameRequired'))
          return false
        }
        break
      case 'email':
        if (!value.trim()) {
          setFieldError(name, t('auth.error.emailRequired'))
          return false
        }
        if (!EMAIL_PATTERN.test(value.trim())) {
          setFieldError(name, t('auth.error.emailInvalid'))
          return false
        }
        break
      case 'password':
        if (!value) {
          setFieldError(name, t('auth.error.passwordRequired'))
          return false
        }
        if (value.length < MIN_PASSWORD) {
          setFieldError(name, t('auth.error.passwordShort'))
          return false
        }
        break
      case 'confirm':
        if (mode !== 'signup') break
        if (!value) {
          setFieldError(name, t('auth.error.confirmRequired'))
          return false
        }
        if (value !== values.password) {
          setFieldError(name, t('auth.error.confirmMismatch'))
          return false
        }
        break
    }
    return true
  }

  function validate(): boolean {
    // Se revisan todos los campos (en vez de parar en el primero) para que el
    // usuario vea de una sola vez todo lo que falta por corregir.
    let firstInvalid: string | null = null
    const check = (name: 'name' | 'email' | 'password' | 'confirm'): void => {
      if (!validateField(name) && firstInvalid === null) firstInvalid = name
    }

    if (mode === 'signup') check('name')
    check('email')
    check('password')
    if (mode === 'signup') check('confirm')

    if (mode === 'signup') {
      if (!termsAccepted) {
        setFieldError('terms', t('auth.error.terms'))
        if (firstInvalid === null) firstInvalid = 'terms'
      } else {
        clearErrorFor('terms')
      }
    }

    if (firstInvalid) {
      try {
        container.querySelector<HTMLInputElement>(`input[name="${firstInvalid}"]`)?.focus()
      } catch {
        /* sin foco disponible */
      }
      return false
    }
    return true
  }

  function setBusy(next: boolean): void {
    busy = next
    const submit = container.querySelector<HTMLButtonElement>('[data-auth-submit]')
    if (submit) {
      submit.disabled = next
      submit.classList.toggle('is-busy', next)
      submit.setAttribute('aria-busy', String(next))
      submit.innerHTML = next
        ? `<span class="auth__spinner">${icon('loader', 15)}</span> ${mode === 'login' ? t('auth.busy.login') : t('auth.busy.signup')}`
        : `${mode === 'login' ? t('auth.submit.login') : t('auth.submit.signup')} <span class="auth__cta-arrow">${icon('arrowRight', 15)}</span>`
    }
    // Mientras se envía también se bloquea el cambio de modo y los proveedores
    // para evitar dobles envíos o acciones cruzadas.
    container
      .querySelectorAll<HTMLButtonElement>('[data-auth-provider], [data-auth-switch], [data-forgot]')
      .forEach((button) => {
        button.disabled = next
      })
  }

  function switchTo(next: AuthMode): void {
    if (busy || next === mode) return
    clearCooldown()
    clearUnconfirmedBanner()
    mode = next
    reason = ''
    render(true)
    // Tras la transición, el foco va al primer campo del formulario nuevo.
    try {
      container.querySelector<HTMLInputElement>('.auth__form input')?.focus()
    } catch {
      /* sin foco disponible */
    }
  }

  /** Actualiza el medidor de fortaleza de la contraseña (solo Registro). */
  function updateStrength(): void {
    const box = container.querySelector<HTMLElement>('[data-strength]')
    const text = container.querySelector<HTMLElement>('[data-strength-text]')
    if (!box || !text) return
    const level = passwordStrength(values.password)
    box.dataset.level = String(level)
    text.textContent = level > 0 ? t(`auth.strength.${level}` as MessageKey) : ''
  }

  /** Indicador de que las dos contraseñas coinciden (solo Registro). */
  function updateMatch(): void {
    const hint = container.querySelector<HTMLElement>('[data-match-hint]')
    if (!hint) return
    if (values.confirm && values.confirm === values.password) {
      hint.textContent = t('auth.match.ok')
      hint.className = 'auth-field__hint auth-field__hint--ok'
    } else {
      hint.textContent = ''
      hint.className = 'auth-field__hint'
    }
  }

  /** Transición de máx. 200 ms al cambiar entre Login y Registro. */
  function playSwitchAnimation(): void {
    const body = container.querySelector<HTMLElement>('[data-auth-body]')
    if (!body) return
    body.classList.remove('is-switching')
    void body.offsetWidth // reinicia la animación si se cambia muy rápido
    body.classList.add('is-switching')
    body.addEventListener('animationend', () => body.classList.remove('is-switching'), { once: true })
  }

  /** Formulario de Login/Registro: campos, medidor, casillas y botón de envío. */
  function formHtml(isSignup: boolean): string {
    return `
              <form class="auth__form" novalidate>
                ${
                  isSignup
                    ? field('name', t('auth.field.name'), textInput('name', 'text', t('auth.placeholder.name'), 'name', values.name), 'user')
                    : ''
                }
                ${field('email', t('auth.field.email'), textInput('email', 'email', t('auth.placeholder.email'), 'email', values.email), 'mail')}
                ${field(
                  'password',
                  t('auth.field.password'),
                  passwordInput('password', t('auth.placeholder.password'), isSignup ? 'new-password' : 'current-password'),
                  'lock',
                  isSignup
                    ? `<div class="auth-strength" data-strength data-level="0">
                        <span class="auth-strength__bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                        <span class="auth-strength__text" data-strength-text aria-live="polite"></span>
                      </div>`
                    : `<div class="auth__row">
                        <label class="auth__check" for="auth-remember">
                          <input type="checkbox" id="auth-remember" name="remember" ${rememberMe ? 'checked' : ''} />
                          <span>${t('auth.remember')}</span>
                        </label>
                        <button class="auth-field__link" type="button" data-forgot>${t('auth.forgot')}</button>
                      </div>`
                )}
                ${
                  isSignup
                    ? field(
                        'confirm',
                        t('auth.field.confirm'),
                        passwordInput('confirm', t('auth.placeholder.confirm'), 'new-password'),
                        'lock',
                        `<p class="auth-field__hint" data-match-hint aria-live="polite"></p>`
                      )
                    : ''
                }
                ${
                  isSignup
                    ? `<div class="auth__terms">
                        <input class="auth__terms-input" type="checkbox" id="auth-terms" name="terms" ${termsAccepted ? 'checked' : ''} aria-describedby="auth-terms-error" />
                        <label for="auth-terms">${t('auth.terms')}</label>
                      </div>
                      <p class="auth-field__error auth__terms-error" id="auth-terms-error" data-error-for="terms" aria-live="polite"></p>`
                    : ''
                }

                <div class="auth__unconfirmed-banner" data-unconfirmed-banner style="display: none;"></div>
                <p class="auth__message" data-auth-message role="status" aria-live="polite"></p>
                <button class="auth__submit" type="submit" data-auth-submit></button>
              </form>`
  }

  function render(animate = false): void {
    const isSignup = mode === 'signup'

    container.innerHTML = `
      <div class="auth">
        <div class="auth__backdrop" aria-hidden="true"></div>
        <div class="auth__card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <aside class="auth__art">
            <img class="auth__art-img" src="${loginArt}" alt="" aria-hidden="true" />
            <span class="auth__art-shade" aria-hidden="true"></span>
            <span class="auth__art-brand">
              <span class="auth__art-mark">${icon('cube', 17)}</span>
              <span>${t('app.name')}</span>
            </span>
            <p class="auth__art-tagline">${t('auth.art.tagline')}</p>
          </aside>

          <div class="auth__panel">
            <button class="auth__close" type="button" data-auth-close title="${t('auth.close')}" aria-label="${t('auth.close')}">${icon('close', 16)}</button>

            <div class="auth__panel-body" data-auth-body>
              <h1 class="auth__title" id="auth-title">${isSignup ? t('auth.signup.title') : t('auth.login.title')}</h1>
              <p class="auth__subtitle">${isSignup ? t('auth.signup.subtitle') : t('auth.login.subtitle')}</p>
              ${reason ? `<p class="auth__reason">${icon('lock', 14)}<span>${reason}</span></p>` : ''}
              ${
                options.auth.configured
                  ? ''
                  : `<p class="auth__mode-hint">${icon('info', 14)}<span>Modo local: no hay claves de Supabase en el .env, así que la sesión se guarda solo en este equipo (ver SUPABASE_SETUP.md).</span></p>`
              }

              ${formHtml(isSignup)}

              <div class="auth__divider"><span>${t('auth.divider')}</span></div>
              <div class="auth__providers">
                <button class="auth__provider" type="button" data-auth-provider="google">${brandIcon('google', 15)} Google</button>
                <button class="auth__provider" type="button" data-auth-provider="github">${brandIcon('github', 15)} GitHub</button>
              </div>

              <p class="auth__switch">
                ${isSignup ? t('auth.switch.login.question') : t('auth.switch.signup.question')}
                <button type="button" data-auth-switch="${isSignup ? 'login' : 'signup'}">${isSignup ? t('auth.switch.login.action') : t('auth.switch.signup.action')}</button>
              </p>
            </div>
          </div>
        </div>
      </div>
    `

    wire()
    if (animate) playSwitchAnimation()
    updateStrength()
    updateMatch()
    if (mode === 'login' && unconfirmedEmail) {
      showUnconfirmedBanner(unconfirmedEmail)
    }
  }

  function wire(): void {
    container.querySelectorAll<HTMLButtonElement>('[data-auth-switch]').forEach((button) => {
      button.addEventListener('click', () => switchTo(button.dataset.authSwitch as AuthMode))
    })

    container.querySelector<HTMLButtonElement>('[data-auth-close]')?.addEventListener('click', close)

    container.querySelector<HTMLButtonElement>('[data-forgot]')?.addEventListener('click', () => {
      setNotice(
        'Recuperar contraseña: activa el correo de recuperación en Supabase (Authentication → Email) o envía el enlace desde el panel.'
      )
    })

    container.querySelectorAll<HTMLInputElement>('.auth-field__input').forEach((input) => {
      input.addEventListener('input', () => {
        values[input.name] = input.value
        touched.add(input.name)
        clearErrorFor(input.name)
        if (input.name === 'email') {
          setBannerError('')
        }
        if (input.name === 'password' || input.name === 'confirm') {
          updateStrength()
          updateMatch()
          // Si «Confirmar» ya tenía un error, se corrige al vuelo.
          if (input.name === 'password' && values.confirm) validateField('confirm')
        }
      })
      input.addEventListener('blur', () => {
        // Solo se valida al salir si el usuario ya tocó el campo (o escribió
        // algo): así no aparecen errores antes de tiempo.
        if (!touched.has(input.name) && !input.value) return
        if (input.name === 'name' || input.name === 'email' || input.name === 'password' || input.name === 'confirm') {
          validateField(input.name)
        }
      })
    })

    container.querySelector<HTMLInputElement>('#auth-remember')?.addEventListener('change', (event) => {
      rememberMe = (event.target as HTMLInputElement).checked
    })

    container.querySelector<HTMLInputElement>('#auth-terms')?.addEventListener('change', (event) => {
      termsAccepted = (event.target as HTMLInputElement).checked
      if (termsAccepted) clearErrorFor('terms')
    })

    container.querySelectorAll<HTMLButtonElement>('[data-toggle-password]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = container.querySelector<HTMLInputElement>(`input[name="${button.dataset.togglePassword}"]`)
        if (!input) return
        const wasVisible = input.type === 'text'
        input.type = wasVisible ? 'password' : 'text'
        button.innerHTML = icon(wasVisible ? 'eye' : 'eyeOff', 15)
        const label = wasVisible ? t('auth.toggle.show') : t('auth.toggle.hide')
        button.title = label
        button.setAttribute('aria-label', label)
        button.setAttribute('aria-pressed', String(!wasVisible))
        input.focus()
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-auth-provider]').forEach((button) => {
      button.addEventListener('click', () => void handleProvider(button.dataset.authProvider as AuthProvider))
    })

    container.querySelector<HTMLFormElement>('.auth__form')?.addEventListener('submit', (event) => {
      event.preventDefault()
      if (!busy) void handleSubmit()
    })

    setBusy(busy)
  }

  /** Cierra la pantalla y avisa a la app para que reanude la acción pendiente. */
  function finish(notice?: string): void {
    if (notice) setNotice(notice)
    window.setTimeout(
      () => {
        close()
        options.onAuthenticated()
      },
      notice ? 900 : 0
    )
  }

  async function handleSubmit(): Promise<void> {
    if (busy) return
    if (!validate()) return
    setBusy(true)

    // «Recordarme»: solo se guarda (o borra) el correo en este equipo;
    // la contraseña nunca se persiste aquí ni se registra en consola.
    if (mode === 'login') storeRememberedEmail(rememberMe ? values.email.trim() : '')

    let result: AuthResult
    try {
      result =
        mode === 'login'
          ? await options.auth.signIn(values.email, values.password)
          : await options.auth.signUp({ name: values.name, email: values.email, password: values.password })
    } catch {
      // Sin red o Supabase inaccesible: mensaje claro, sin datos sensibles.
      setBusy(false)
      setError(t('auth.error.offline'))
      return
    }

    setBusy(false)
    if (!result.ok) {
      if (
        result.code === 'EMAIL_NOT_CONFIRMED' ||
        (result.error && result.error.toLowerCase().includes('email not confirmed')) ||
        (result.error && result.error.toLowerCase().includes('no ha sido confirmada'))
      ) {
        showUnconfirmedBanner(result.email || values.email.trim(), 'warning')
        return
      }
      clearUnconfirmedBanner()
      setError(friendlyError(result.error ?? ''))
      return
    }

    if (result.needsEmailConfirmation) {
      // Con «Confirm email» activo en Supabase hay que confirmar antes de entrar.
      mode = 'login'
      reason = ''
      render()
      showUnconfirmedBanner(result.email || values.email.trim(), 'warning')
      return
    }

    finish(result.notice)
  }

  async function handleProvider(provider: AuthProvider): Promise<void> {
    if (busy) return
    setBusy(true)

    let result: AuthResult
    try {
      result = await options.auth.signInWithProvider(provider)
    } catch {
      setBusy(false)
      setError(t('auth.error.offline'))
      return
    }
    setBusy(false)

    if (!result.ok) {
      setError(friendlyError(result.error ?? ''))
      return
    }
    // OAuth real: la sesión se completará en el navegador y llegará por onAuthStateChange.
    if (result.external) {
      setNotice(result.notice ?? '')
      return
    }
    finish(result.notice)
  }

  // Si la sesión se activa externamente (ej: deep link arqstudio://auth/callback)
  options.auth.onChange((user) => {
    if (user && isOpen()) {
      finish()
    }
  })

  // Cerrar con Escape o pulsando fuera de la tarjeta.
  // Fase 1: SOLO con sesión activa. Sin sesión, login/registro es la única
  // vista permitida (no se puede descartar para espiar el Dashboard).
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen() && options.auth.isAuthenticated()) close()
  })
  container.addEventListener('click', (event) => {
    if (!options.auth.isAuthenticated()) return
    const target = event.target as HTMLElement
    if (target === container || target.classList.contains('auth__backdrop')) close()
  })

  return { open, close, isOpen }
}