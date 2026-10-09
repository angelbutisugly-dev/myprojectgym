import React, { useState } from 'react';
import { HardDrive, Lock, ShieldCheck, User } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (username: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanUser = username.trim();
    const cleanPass = password.trim();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          onLoginSuccess(cleanUser);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback to local verification if offline
    }

    if (cleanUser === 'formatilin' && cleanPass === 'formatilin67') {
      onLoginSuccess('formatilin');
    } else {
      setError('Acceso denegado. Verifica tu usuario y contraseña de FormaGym.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-[#F8FAFC] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-[#111827] border border-slate-800 rounded-xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-lg bg-[#25D366]/15 border border-[#25D366]/40 flex items-center justify-center text-[#25D366] font-bold text-xl">
            FG
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              FormaGym — Acceso Privado
            </h1>
            <p className="text-xs text-slate-400">
              Sistema de Membresías, Precios y Bot de WhatsApp
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Usuario
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ingresa tu usuario"
                autoComplete="username"
                required
                className="w-full bg-[#090D16] border border-slate-700 focus:border-[#25D366] rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-white outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
                className="w-full bg-[#090D16] border border-slate-700 focus:border-[#25D366] rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-white outline-none transition"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4" />
            {loading ? 'Verificando...' : 'Iniciar Sesión en FormaGym'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-start gap-2.5 text-[11px] text-slate-400">
          <HardDrive className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-slate-200">Almacenamiento Local Activo:</strong> Toda la
            información de membresías, pagos y precios se guarda localmente en tu equipo (y puedes
            descargarla en Excel/CSV o JSON y correr el bot 100% local en tu PC sin depender de
            ninguna página web).
          </p>
        </div>
      </div>
    </div>
  );
};
