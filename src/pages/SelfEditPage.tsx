import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Clock, ExternalLink, Loader2, Send, User } from 'lucide-react';
import { api, SelfEditCard } from '../services/api';
import { RoyaLogo } from '../components/RoyaLogo';
import { optimizeImage } from '../utils/imageOptimizer';
import { SELF_EDIT_LABEL, SELF_EDIT_ORDER } from '../utils/selfEdit';
import { Button, Field, inputClass, formatDate } from '../admin/ui';

/**
 * An employee's private page (/edit#<secret>) to change their photo, WhatsApp,
 * Instagram and email. Changes reach the card only after an admin approves them.
 */
function readToken(): string {
  return decodeURIComponent(window.location.hash.replace(/^#/, '')).trim();
}

interface FormValues {
  whatsapp: string;
  instagram: string;
  email: string;
}

function formFrom(card: SelfEditCard): FormValues {
  const waiting = card.pending?.changes || {};
  return {
    whatsapp: waiting.whatsapp ?? card.values.whatsapp ?? '',
    instagram: waiting.instagram ?? card.values.instagram ?? '',
    email: waiting.email ?? card.values.email ?? '',
  };
}

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-dvh bg-stone-100 flex justify-center p-3 sm:p-6">
    <main className="w-full max-w-md bg-white rounded-3xl border border-stone-200 shadow-xl p-5 sm:p-7 self-start">
      <div className="flex justify-center mb-4">
        <RoyaLogo size="sm" />
      </div>
      {children}
    </main>
  </div>
);

export default function SelfEditPage() {
  const [token] = useState(readToken);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'offline'>('loading');
  const [card, setCard] = useState<SelfEditCard | null>(null);
  const [form, setForm] = useState<FormValues>({ whatsapp: '', instagram: '', email: '' });
  const [photo, setPhoto] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = 'ویرایش کارت من | رویا';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }
    let alive = true;
    api.getSelfEdit(token).then((res) => {
      if (!alive) return;
      if (res.success && res.card) {
        setCard(res.card);
        setForm(formFrom(res.card));
        setState('ready');
      } else setState(res.status === 0 ? 'offline' : 'invalid');
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const set = (key: keyof FormValues, value: string) => {
    setSent(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('فقط عکس (JPG، PNG یا WebP) قابل قبول است.');
    setError(null);
    setSent(false);
    setPreparingPhoto(true);
    try {
      // Phone photos are large; a 1000px JPEG is plenty for the card and uploads fast on mobile data.
      setPhoto((await optimizeImage(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.85, format: 'image/jpeg' })).dataUrl);
    } catch {
      setError('این عکس باز نشد. لطفاً عکس دیگری انتخاب کنید.');
    } finally {
      setPreparingPhoto(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card) return;
    setSending(true);
    setError(null);
    const res = await api.submitSelfEdit(token, {
      ...form,
      ...(photo ? { photo } : {}),
      ...(!photo && card.pending?.changes.avatarUrl ? { keepPendingPhoto: true } : {}),
    });
    setSending(false);
    if (res.success && res.card) {
      setCard(res.card);
      setForm(formFrom(res.card));
      setPhoto(null);
      setSent(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else setError(res.error || 'ارسال انجام نشد.');
  };

  if (state === 'loading') {
    return (
      <Shell>
        <div className="flex justify-center py-10" aria-busy="true">
          <Loader2 className="w-6 h-6 text-[#D0192A] animate-spin" aria-label="در حال بارگذاری" />
        </div>
      </Shell>
    );
  }

  if (state !== 'ready' || !card) {
    return (
      <Shell>
        <h1 className="text-[17px] font-black text-stone-900 text-center">
          {state === 'offline' ? 'اتصال برقرار نشد' : 'این لینک معتبر نیست'}
        </h1>
        <p className="mt-3 text-[13.5px] text-stone-600 leading-relaxed text-center">
          {state === 'offline'
            ? 'برای ویرایش کارت به اینترنت نیاز است. اتصال را بررسی کنید و صفحه را دوباره باز کنید.'
            : 'لینک ویرایش ممکن است باطل شده یا ناقص کپی شده باشد. لطفاً از مدیر پنل کارت‌ها لینک تازه بگیرید.'}
        </p>
      </Shell>
    );
  }

  const pending = card.pending;
  const avatar = photo || pending?.changes.avatarUrl || card.values.avatarUrl;

  return (
    <Shell>
      <h1 className="text-[17px] font-black text-stone-900 text-center">ویرایش کارت {card.name}</h1>
      <p className="mt-2 text-[13px] text-stone-600 leading-relaxed text-center">
        عکس، واتساپ، اینستاگرام و ایمیل کارت خود را اینجا به‌روز کنید. تغییرات بعد از تأیید مدیر روی کارت دیده می‌شود.
      </p>

      {sent && (
        <div role="status" className="mt-4 flex gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-[13px] text-emerald-900 leading-relaxed">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>تغییرات شما ثبت شد و بعد از تأیید مدیر روی کارت نمایش داده می‌شود.</span>
        </div>
      )}
      {pending && !sent && (
        <div className="mt-4 flex gap-2 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-[13px] text-amber-900 leading-relaxed">
          <Clock className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            تغییر {SELF_EDIT_ORDER.filter((f) => f in pending.changes).map((f) => SELF_EDIT_LABEL[f]).join('، ')} که {formatDate(pending.createdAt)} فرستادید
            منتظر تأیید مدیر است. اگر دوباره بفرستید، جای قبلی را می‌گیرد.
          </span>
        </div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <div className="flex items-center gap-4">
          <span className="w-20 h-20 rounded-full bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
            {avatar ? (
              <img src={avatar} alt="عکس کارت" className="w-full h-full object-cover" />
            ) : (
              <User className="w-9 h-9 text-stone-400" aria-hidden="true" />
            )}
          </span>
          <div className="space-y-1">
            <label className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-[13.5px] font-bold text-stone-800 cursor-pointer focus-within:outline-2 focus-within:outline-[#D0192A]">
              {preparingPhoto ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Camera className="w-4 h-4" aria-hidden="true" />}
              {avatar ? 'تغییر عکس' : 'افزودن عکس'}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pickPhoto(e)} />
            </label>
            <p className="text-xs text-stone-500">عکس رو به دوربین، با زمینه ساده</p>
          </div>
        </div>

        <Field label="شماره واتساپ" htmlFor="se-whatsapp" hint="خالی بماند، دکمه واتساپ روی کارت نمایش داده نمی‌شود.">
          <input
            id="se-whatsapp"
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoComplete="tel"
            className={`${inputClass} tabular-nums`}
            placeholder="09121234567"
            value={form.whatsapp}
            onChange={(e) => set('whatsapp', e.target.value)}
          />
        </Field>

        <Field
          label="آیدی اینستاگرام"
          htmlFor="se-instagram"
          hint={card.companyInstagram ? `خالی بماند، صفحه شرکت (${card.companyInstagram}) نمایش داده می‌شود.` : undefined}
        >
          <input
            id="se-instagram"
            dir="ltr"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={inputClass}
            placeholder="@username"
            value={form.instagram}
            onChange={(e) => set('instagram', e.target.value)}
          />
        </Field>

        <Field label="ایمیل" htmlFor="se-email">
          <input
            id="se-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            className={inputClass}
            placeholder="name@royaco.com"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>

        {error && (
          <p role="alert" className="text-[13px] text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" tone="primary" className="w-full" disabled={sending || preparingPhoto}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
          ارسال برای تأیید
        </Button>
      </form>

      <p className="mt-5 text-xs text-stone-500 leading-relaxed text-center">
        نام، سمت و شماره موبایل را فقط مدیر پنل تغییر می‌دهد. این لینک مخصوص شماست؛ آن را برای دیگران نفرستید.
      </p>
      <p className="mt-3 text-center">
        <a
          href={`/${encodeURIComponent(card.slug)}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-stone-700 underline underline-offset-4"
        >
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
          دیدن کارت فعلی من
        </a>
      </p>
    </Shell>
  );
}
