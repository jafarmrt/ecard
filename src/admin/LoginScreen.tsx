import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { api } from '../services/api';
import { RoyaLogo } from '../components/RoyaLogo';
import { Button, inputClass } from './ui';

export const LoginScreen: React.FC<{ onLoggedIn: () => void }> = ({ onLoggedIn }) => {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return setError('رمز را وارد کنید.');
    setLoading(true);
    setError(null);
    const res = await api.loginAdmin(password);
    setLoading(false);
    if (res.success) {
      setPassword('');
      onLoggedIn();
    } else setError(res.error || 'رمز درست نیست.');
  };

  return (
    <div className="min-h-dvh bg-stone-100 flex items-center justify-center p-4">
      <main className="w-full max-w-sm bg-white rounded-3xl border border-stone-200 shadow-xl p-6 sm:p-8">
        <div className="flex justify-center mb-4">
          <RoyaLogo size="sm" />
        </div>
        <h1 className="text-[17px] font-black text-stone-900 text-center">ورود به پنل مدیریت کارت‌ها</h1>
        <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
          <label htmlFor="admin-password" className="block text-[12.5px] font-bold text-stone-700">
            رمز مدیر
          </label>
          <div className="relative">
            <input
              id="admin-password"
              type={show ? 'text' : 'password'}
              dir="ltr"
              autoComplete="current-password"
              autoFocus
              className={`${inputClass} pl-11`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'admin-password-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-stone-500 hover:text-stone-800 cursor-pointer"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && (
            <p id="admin-password-error" role="alert" className="text-[12.5px] text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" tone="primary" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Lock className="w-4 h-4" aria-hidden="true" />}
            ورود
          </Button>
          <p className="text-[11.5px] text-stone-500 text-center leading-relaxed">
            این دستگاه تا ۳۰ روز وارد می‌ماند. روی دستگاه عمومی، بعد از کار «خروج» را بزنید.
          </p>
        </form>
        <p className="mt-4 text-center">
          <a href="/" className="text-[12.5px] text-stone-600 underline underline-offset-4">
            بازگشت به صفحه اصلی
          </a>
        </p>
      </main>
    </div>
  );
};
