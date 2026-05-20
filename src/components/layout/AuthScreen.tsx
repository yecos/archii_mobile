'use client';
import React, { useState, useEffect } from 'react';
import { Home } from 'lucide-react';

interface AuthScreenProps {
  forms: Record<string, any>;
  setForms: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  doLogin: () => void;
  doRegister: () => void;
  doGoogleLogin: () => void;
  doMicrosoftLogin: () => void;
  showToast: (msg: string, type?: string) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── Firebase health check ── */
function useFirebaseStatus() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [detail, setDetail] = useState('');
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 10;
    let mounted = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const check = () => {
      if (!mounted) return;
      attempts++;
      try {
        const w = window as any;
        // Check raw script tags loaded
        const scripts = document.querySelectorAll('script[src*="firebase"]');
        const loadedScripts = Array.from(scripts).filter((s: any) => s.src);
        
        if (!w.firebase) {
          if (attempts < maxAttempts) {
            timers.push(setTimeout(check, 500));
            return;
          }
          setStatus('error');
          setDetail(`Firebase SDK no cargó. Scripts en DOM: ${loadedScripts.length}.`);
          return;
        }
        if (!w.firebase.apps || w.firebase.apps.length === 0) {
          if (attempts < maxAttempts) {
            timers.push(setTimeout(check, 500));
            return;
          }
          setStatus('error');
          setDetail('Firebase App no inicializado.');
          return;
        }
        // IMPORTANT: GoogleAuthProvider is on the namespace firebase.auth (no parentheses!)
        // NOT on the instance firebase.auth()
        const authNS = w.firebase.auth; // namespace — has GoogleAuthProvider, OAuthProvider
        const authInstance = w.firebase.auth(); // instance — has signInWithPopup, currentUser
        
        if (!authNS || !authNS.GoogleAuthProvider) {
          if (attempts < maxAttempts) {
            timers.push(setTimeout(check, 500));
            return;
          }
          setStatus('error');
          setDetail('GoogleAuthProvider no disponible — firebase-auth-compat.js no cargó.');
          return;
        }
        if (!authNS.OAuthProvider) {
          if (attempts < maxAttempts) {
            timers.push(setTimeout(check, 500));
            return;
          }
          setStatus('error');
          setDetail('OAuthProvider no disponible.');
          return;
        }
        setStatus('ok');
        setDetail(`Firebase OK — ${w.firebase.apps[0]?.options?.projectId || '?'}`);
      } catch (e: any) {
        if (attempts < maxAttempts) {
          timers.push(setTimeout(check, 500));
          return;
        }
        setStatus('error');
        setDetail(e.message || 'Error desconocido al verificar Firebase');
      }
    };
    // Start checking after 1 second, retry every 500ms
    timers.push(setTimeout(check, 1000));
    return () => {
      mounted = false;
      timers.forEach(t => clearTimeout(t));
    };
  }, []);
  return { status, detail };
}

function validateLoginForm(forms: Record<string, any>) {
  const errors: Record<string, string> = {};
  const email = (forms.loginEmail || '').trim();
  const pass = forms.loginPass || '';

  if (!email) {
    errors.loginEmail = 'El correo electrónico es obligatorio';
  } else if (!EMAIL_REGEX.test(email)) {
    errors.loginEmail = 'Ingresa un correo electrónico válido';
  }

  if (!pass) {
    errors.loginPass = 'La contraseña es obligatoria';
  } else if (pass.length < 6) {
    errors.loginPass = 'La contraseña debe tener al menos 6 caracteres';
  }

  return errors;
}

function validateRegisterForm(forms: Record<string, any>) {
  const errors: Record<string, string> = {};
  const name = (forms.regName || '').trim();
  const email = (forms.regEmail || '').trim();
  const pass = forms.regPass || '';

  if (!name) {
    errors.regName = 'El nombre es obligatorio';
  } else if (name.length < 2) {
    errors.regName = 'El nombre debe tener al menos 2 caracteres';
  }

  if (!email) {
    errors.regEmail = 'El correo electrónico es obligatorio';
  } else if (!EMAIL_REGEX.test(email)) {
    errors.regEmail = 'Ingresa un correo electrónico válido';
  }

  if (!pass) {
    errors.regPass = 'La contraseña es obligatoria';
  } else if (pass.length < 6) {
    errors.regPass = 'La contraseña debe tener al menos 6 caracteres';
  }

  return errors;
}

const inputBase =
  'w-full bg-[var(--af-bg3)] border rounded-lg px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none transition-colors';

function inputClasses(hasError: boolean) {
  return hasError
    ? `${inputBase} border-[var(--destructive)] focus:border-[var(--destructive)]`
    : `${inputBase} border-[var(--input)] focus:border-[var(--af-accent)]`;
}

export default function AuthScreen({ forms, setForms, doLogin, doRegister, doGoogleLogin, doMicrosoftLogin }: AuthScreenProps) {
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});
  const [authLoading, setAuthLoading] = useState(false);
  const fbStatus = useFirebaseStatus();

  const handleLoginClick = async () => {
    const errors = validateLoginForm(forms);
    setLoginErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setAuthLoading(true);
    try {
      await doLogin();
    } finally {
      setTimeout(() => setAuthLoading(false), 2000);
    }
  };

  const handleLoginKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLoginClick();
    }
  };

  const handleRegisterClick = async () => {
    const errors = validateRegisterForm(forms);
    setRegisterErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setAuthLoading(true);
    try {
      await doRegister();
    } finally {
      setTimeout(() => setAuthLoading(false), 2000);
    }
  };

  const handleRegisterKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRegisterClick();
    }
  };

  const handleGoogleClick = async () => {
    setAuthLoading(true);
    try {
      await doGoogleLogin();
    } finally {
      setTimeout(() => setAuthLoading(false), 3000);
    }
  };

  const handleMicrosoftClick = async () => {
    setAuthLoading(true);
    try {
      await doMicrosoftLogin();
    } finally {
      setTimeout(() => setAuthLoading(false), 3000);
    }
  };

  const clearLoginError = (field: string) => {
    if (loginErrors[field]) setLoginErrors(prev => ({ ...prev, [field]: '' }));
  };

  const clearRegisterError = (field: string) => {
    if (registerErrors[field]) setRegisterErrors(prev => ({ ...prev, [field]: '' }));
  };

  const trimLoginField = (field: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed !== value) {
      setForms(p => ({ ...p, [field]: trimmed }));
    }
  };

  const trimRegisterField = (field: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed !== value) {
      setForms(p => ({ ...p, [field]: trimmed }));
    }
  };

  const hasLoginErrors = Object.values(loginErrors).some(e => e.length > 0);
  const hasRegisterErrors = Object.values(registerErrors).some(e => e.length > 0);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[var(--background)] via-[var(--background)] to-[var(--af-bg3)] z-50 flex items-center justify-center p-6">
      <div className="af-ambient-bg" />
      {/* Firebase status indicator — bottom left, small */}
      <div className="fixed bottom-2 left-2 z-[60] text-[10px] px-2 py-1 rounded bg-black/60 text-white/70 font-mono">
        Firebase: {fbStatus.status === 'checking' ? '⏳ cargando...' : fbStatus.status === 'ok' ? '✅ OK' : `❌ ${fbStatus.detail}`}
      </div>

      <div className="relative bg-[var(--card)] border border-[var(--input)] rounded-2xl p-8 w-full max-w-[400px] af-card shadow-2xl">
        <div className="flex items-center gap-3 mb-7">
          <div className="w-10 h-10 bg-gradient-to-br from-[var(--af-accent)] to-[var(--af-accent2)] rounded-xl shadow-lg af-glow-accent flex items-center justify-center">
            <Home size={20} className="stroke-background" aria-hidden="true"/>
          </div>
          <span style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl">Archii</span>
        </div>

        {/* Firebase error banner */}
        {fbStatus.status === 'error' && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-sm text-red-400">
            <div className="font-medium mb-1">Firebase no pudo cargar</div>
            <div className="text-xs opacity-80">{fbStatus.detail}</div>
            <div className="text-xs opacity-60 mt-1">Abre la consola del navegador (F12) para ver más detalles.</div>
          </div>
        )}

        {/* Loading overlay */}
        {authLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-[var(--background)]/60 backdrop-blur-sm rounded-2xl">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-[var(--af-accent)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] text-[var(--muted-foreground)]">Ingresando...</span>
            </div>
          </div>
        )}

        {!forms.showRegister ? (<>
          <div className="text-xl font-semibold mb-1">Bienvenido de vuelta</div>
          <div className="text-sm text-[var(--muted-foreground)] mb-7">Ingresa con tu cuenta para continuar</div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Correo electrónico</label>
            <input
              className={inputClasses(!!loginErrors.loginEmail)}
              placeholder="tu@correo.com"
              value={forms.loginEmail || ''}
              onChange={e => { setForms(p => ({ ...p, loginEmail: e.target.value })); clearLoginError('loginEmail'); }}
              onBlur={e => trimLoginField('loginEmail', e.target.value)}
              onKeyDown={handleLoginKeyDown}
              disabled={authLoading}
            />
            {loginErrors.loginEmail && <p className="text-xs mt-1 text-[var(--destructive)]">{loginErrors.loginEmail}</p>}
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Contraseña</label>
            <input
              className={inputClasses(!!loginErrors.loginPass)}
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={forms.loginPass || ''}
              onChange={e => { setForms(p => ({ ...p, loginPass: e.target.value })); clearLoginError('loginPass'); }}
              onBlur={e => trimLoginField('loginPass', e.target.value)}
              onKeyDown={handleLoginKeyDown}
              disabled={authLoading}
            />
            {loginErrors.loginPass && <p className="text-xs mt-1 text-[var(--destructive)]">{loginErrors.loginPass}</p>}
          </div>
          <button
            className={`af-btn-primary w-full ${hasLoginErrors || authLoading || fbStatus.status !== 'ok' ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleLoginClick}
            disabled={authLoading || fbStatus.status !== 'ok'}
          >{authLoading ? 'Ingresando...' : 'Ingresar'}</button>
          <div className="flex items-center gap-3 my-4 text-xs text-[var(--af-text3)]"><div className="flex-1 h-px bg-[var(--border)]" />o<div className="flex-1 h-px bg-[var(--border)]" /></div>
          <button className="af-btn-secondary w-full flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleGoogleClick} disabled={authLoading || fbStatus.status !== 'ok'}>
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continuar con Google
          </button>
          <button className="af-btn-secondary w-full mt-2 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleMicrosoftClick} disabled={authLoading || fbStatus.status !== 'ok'}>
            <svg viewBox="0 0 21 21" className="w-[18px] h-[18px]"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
            Continuar con Microsoft
          </button>
          <div className="text-center mt-5 text-sm text-[var(--af-text3)]">¿No tienes cuenta? <a className="text-[var(--af-accent)] cursor-pointer hover:underline" onClick={() => setForms(p => ({ ...p, showRegister: true }))}>Regístrate</a></div>
        </>) : (<>
          <div className="text-xl font-semibold mb-1">Crear cuenta</div>
          <div className="text-sm text-[var(--muted-foreground)] mb-7">Únete a tu equipo en Archii</div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Nombre completo</label>
            <input
              className={inputClasses(!!registerErrors.regName)}
              placeholder="Tu nombre"
              value={forms.regName || ''}
              onChange={e => { setForms(p => ({ ...p, regName: e.target.value })); clearRegisterError('regName'); }}
              onBlur={e => trimRegisterField('regName', e.target.value)}
              onKeyDown={handleRegisterKeyDown}
              disabled={authLoading}
            />
            {registerErrors.regName && <p className="text-xs mt-1 text-[var(--destructive)]">{registerErrors.regName}</p>}
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Correo electrónico</label>
            <input
              className={inputClasses(!!registerErrors.regEmail)}
              type="email"
              placeholder="tu@correo.com"
              value={forms.regEmail || ''}
              onChange={e => { setForms(p => ({ ...p, regEmail: e.target.value })); clearRegisterError('regEmail'); }}
              onBlur={e => trimRegisterField('regEmail', e.target.value)}
              onKeyDown={handleRegisterKeyDown}
              disabled={authLoading}
            />
            {registerErrors.regEmail && <p className="text-xs mt-1 text-[var(--destructive)]">{registerErrors.regEmail}</p>}
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Contraseña</label>
            <input
              className={inputClasses(!!registerErrors.regPass)}
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={forms.regPass || ''}
              onChange={e => { setForms(p => ({ ...p, regPass: e.target.value })); clearRegisterError('regPass'); }}
              onBlur={e => trimRegisterField('regPass', e.target.value)}
              onKeyDown={handleRegisterKeyDown}
              disabled={authLoading}
            />
            {registerErrors.regPass && <p className="text-xs mt-1 text-[var(--destructive)]">{registerErrors.regPass}</p>}
          </div>
          <button
            className={`af-btn-primary w-full ${hasRegisterErrors || authLoading || fbStatus.status !== 'ok' ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleRegisterClick}
            disabled={authLoading || fbStatus.status !== 'ok'}
          >{authLoading ? 'Creando cuenta...' : 'Crear cuenta'}</button>
          <div className="flex items-center gap-3 my-4 text-xs text-[var(--af-text3)]"><div className="flex-1 h-px bg-[var(--border)]" />o<div className="flex-1 h-px bg-[var(--border)]" /></div>
          <button className="af-btn-secondary w-full flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleGoogleClick} disabled={authLoading || fbStatus.status !== 'ok'}>
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Registrarse con Google
          </button>
          <button className="af-btn-secondary w-full mt-2 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleMicrosoftClick} disabled={authLoading || fbStatus.status !== 'ok'}>
            <svg viewBox="0 0 21 21" className="w-[18px] h-[18px]"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
            Registrarse con Microsoft
          </button>
          <div className="text-center mt-5 text-sm text-[var(--af-text3)]">¿Ya tienes cuenta? <a className="text-[var(--af-accent)] cursor-pointer hover:underline" onClick={() => setForms(p => ({ ...p, showRegister: false }))}>Ingresar</a></div>
        </>)}
      </div>
    </div>
  );
}
