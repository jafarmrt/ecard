import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toPersianDigits } from '../utils/phone';

// ---------------- Toast ----------------
type ToastFn = (message: string, tone?: 'ok' | 'error') => void;
const ToastContext = createContext<ToastFn>(() => {});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error'; key: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback<ToastFn>((message, tone = 'ok') => {
    window.clearTimeout(timer.current);
    setToast({ message, tone, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 inset-x-0 z-[70] flex justify-center pointer-events-none px-3">
        {toast && (
          <div
            key={toast.key}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto max-w-md px-4 py-2.5 rounded-xl shadow-lg text-[13px] font-medium ${
              toast.tone === 'error' ? 'bg-red-700 text-white' : 'bg-stone-900 text-white'
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

// ---------------- Buttons ----------------
const buttonTones = {
  primary: 'bg-[#D0192A] hover:bg-[#B51221] text-white shadow-sm',
  dark: 'bg-stone-900 hover:bg-stone-800 text-white',
  ghost: 'bg-white hover:bg-stone-100 text-stone-800 border border-stone-300',
  danger: 'bg-white hover:bg-red-50 text-red-700 border border-red-300',
  subtle: 'bg-stone-100 hover:bg-stone-200 text-stone-800',
} as const;

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof buttonTones; size?: 'sm' | 'md' }
> = ({ tone = 'ghost', size = 'md', className = '', type = 'button', ...rest }) => (
  <button
    type={type}
    className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D0192A] ${
      size === 'sm' ? 'min-h-9 px-3 text-[12.5px]' : 'min-h-11 px-4 text-[13.5px]'
    } ${buttonTones[tone]} ${className}`}
    {...rest}
  />
);

// ---------------- Form fields ----------------
export const inputClass =
  'w-full min-h-11 px-3 py-2 bg-white border border-stone-300 rounded-xl text-[14px] text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:border-[#D0192A] focus:ring-2 focus:ring-red-100 transition-colors';

export const smallSelect =
  'min-h-9 px-2.5 bg-white border border-stone-300 rounded-xl text-[13px] text-stone-900 focus:outline-hidden focus:border-[#D0192A] focus:ring-2 focus:ring-red-100';

export const Field: React.FC<{
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ label, htmlFor, hint, required, children, className = '' }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="block text-[12.5px] font-bold text-stone-700 mb-1">
      {label}
      {required && <span className="text-red-600"> *</span>}
    </label>
    {children}
    {hint && <p className="mt-1 text-xs text-stone-500 leading-relaxed">{hint}</p>}
  </div>
);

export const Section: React.FC<{ title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  description,
  actions,
  children,
}) => (
  <section className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="text-[15px] font-black text-stone-900">{title}</h2>
        {description && <p className="text-[12.5px] text-stone-500 mt-1 leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    {children}
  </section>
);

// ---------------- Modal ----------------
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ open, onClose, title, children, footer, wide }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-stone-950/60 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`bg-stone-50 w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-stone-200">
          <h2 className="text-[16px] font-black text-stone-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="w-10 h-10 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-stone-200 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

// ---------------- Formatting ----------------
export const fa = (n: number | string | undefined | null) => toPersianDigits(n ?? 0);

export const formatNumber = (n: number | undefined | null) => (Number(n) || 0).toLocaleString('fa-IR');

export function formatDate(iso?: string | null, withTime = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fa-IR', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function formatBytes(bytes?: number | null): string {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${formatNumber(b)} بایت`;
  if (b < 1024 * 1024) return `${formatNumber(Math.round(b / 1024))} کیلوبایت`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت`;
  return `${(b / (1024 * 1024 * 1024)).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} گیگابایت`;
}

export function downloadBlob(content: BlobPart, type: string, fileName: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const STATUS_LABEL: Record<string, string> = {
  active: 'فعال',
  inactive: 'غیرفعال',
  archived: 'بایگانی',
};

export const StatusBadge: React.FC<{ status?: string }> = ({ status = 'active' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${
      status === 'active'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : status === 'inactive'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-stone-100 text-stone-600 border-stone-300'
    }`}
  >
    {STATUS_LABEL[status] || status}
  </span>
);
