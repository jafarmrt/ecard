import React, { useEffect, useState } from 'react';
import { Download, Upload, HardDrive, ShieldCheck, AlertTriangle, CheckCircle2, RefreshCw, KeyRound } from 'lucide-react';
import { AuditEntry, EmployeeProfile } from '../types';
import { api, RestorePreview, SystemHealth } from '../services/api';
import { Button, Field, Modal, Section, formatBytes, formatDate, formatNumber, inputClass, useToast } from './ui';

const ACTION_LABEL: Record<string, string> = {
  create: 'ساخت',
  update: 'ویرایش',
  archive: 'بایگانی',
  restore: 'بازگردانی',
  export: 'دانلود',
  upload: 'آپلود',
  delete: 'حذف',
  login: 'ورود',
  'login-failed': 'ورود ناموفق',
  logout: 'خروج',
  'change-password': 'تغییر رمز',
  snapshot: 'پشتیبان سرور',
  cleanup: 'پاکسازی فایل‌ها',
};

const ENTITY_LABEL: Record<string, string> = {
  profile: 'کارت',
  organization: 'شرکت',
  branch: 'شعبه',
  lead: 'درخواست',
  session: 'حساب مدیر',
  catalog: 'کاتالوگ',
  backup: 'پشتیبان',
  uploads: 'فایل‌ها',
};

const MIN_PASSWORD = 10;

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between gap-3 py-2 border-b border-stone-100 text-[13px]">
    <dt className="text-stone-600">{label}</dt>
    <dd className="font-bold text-stone-900 text-end">{children}</dd>
  </div>
);

export const SystemTab: React.FC<{ profiles: EmployeeProfile[]; onRestored: () => Promise<void> | void }> = ({ profiles, onRestored }) => {
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.name || id;
  const toast = useToast();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ data: unknown; preview: RestorePreview; fileName: string } | null>(null);
  const [pw, setPw] = useState({ old: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const [h, a] = await Promise.all([api.getSystemHealth(), api.getAuditLog(50)]);
    if (h.success && h.health) setHealth(h.health);
    if (a.success) setAudit(a.entries || []);
  };

  useEffect(() => {
    void load();
  }, []);

  const snapshot = async () => {
    setBusy(true);
    const res = await api.createServerBackup();
    setBusy(false);
    toast(res.success ? res.message || 'نسخه پشتیبان روی سرور ساخته شد.' : res.error || 'ساخت پشتیبان انجام نشد.', res.success ? 'ok' : 'error');
    void load();
  };

  const download = async () => {
    const res = await api.downloadBackup();
    if (!res.success) toast(res.error || 'دانلود انجام نشد.', 'error');
  };

  const pickRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return toast('این فایل پشتیبان معتبر نیست (JSON نیست).', 'error');
    }
    const res = await api.previewRestore(data);
    if (!res.success || !res.preview) return toast(res.error || 'بررسی فایل انجام نشد.', 'error');
    if (!res.preview.valid) return toast(res.preview.error || 'این فایل پشتیبان معتبر نیست.', 'error');
    setPending({ data, preview: res.preview, fileName: file.name });
  };

  const confirmRestore = async () => {
    if (!pending) return;
    setBusy(true);
    const res = await api.restoreBackup(pending.data);
    setBusy(false);
    if (res.success) {
      toast(`اطلاعات بازیابی شد. نسخه قبلی هم با نام ${res.safetyCopy || 'pre-restore'} روی سرور نگه داشته شد.`);
      setPending(null);
      await onRestored();
      void load();
    } else toast(res.error || 'بازیابی انجام نشد.', 'error');
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next.length < MIN_PASSWORD) return setPwMsg({ ok: false, text: `رمز جدید باید دست‌کم ${formatNumber(MIN_PASSWORD)} حرف باشد.` });
    if (pw.next !== pw.confirm) return setPwMsg({ ok: false, text: 'رمز جدید و تکرار آن یکی نیستند.' });
    const res = await api.changeAdminPassword(pw.old, pw.next);
    if (res.success) {
      setPw({ old: '', next: '', confirm: '' });
      setPwMsg({ ok: true, text: 'رمز عوض شد. دستگاه‌های دیگر باید دوباره وارد شوند.' });
      void load();
    } else setPwMsg({ ok: false, text: res.error || 'تغییر رمز انجام نشد.' });
  };

  const warnings: string[] = [];
  if (health) {
    if (!health.passwordCustomized) warnings.push('رمز مدیر هنوز رمز پیش‌فرض است. همین حالا از بخش پایین عوضش کنید.');
    if (!health.lastBackupAt) warnings.push('هنوز هیچ نسخه پشتیبانی روی سرور ساخته نشده است.');
    else if (Date.now() - new Date(health.lastBackupAt).getTime() > 2 * 86400000) warnings.push('آخرین پشتیبان سرور بیش از دو روز پیش است.');
    if (health.disk && health.disk.total > 0 && health.disk.free / health.disk.total < 0.1) warnings.push('فضای دیسک سرور رو به اتمام است.');
  }

  return (
    <div className="space-y-4">
      <Section
        title="وضعیت سیستم"
        actions={
          <Button size="sm" onClick={() => void load()} aria-label="به‌روزرسانی وضعیت">
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        }
      >
        {warnings.length > 0 ? (
          <ul className="mb-3 space-y-1.5">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                {w}
              </li>
            ))}
          </ul>
        ) : (
          health && (
            <p className="mb-3 flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[12.5px] text-emerald-900">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              همه چیز مرتب است.
            </p>
          )
        )}
        {health ? (
          <dl>
            <Row label="نسخه برنامه">{health.version}</Row>
            <Row label="کارت‌ها">
              {formatNumber(health.profiles)} کارت
              {health.archivedProfiles > 0 && ` (${formatNumber(health.archivedProfiles)} بایگانی)`}
            </Row>
            <Row label="شعبه‌ها">{formatNumber(health.branches)}</Row>
            <Row label="درخواست‌های تماس">{formatNumber(health.leads)}</Row>
            <Row label="حجم پایگاه داده">{formatBytes(health.databaseBytes)}</Row>
            <Row label="حجم عکس‌ها و فایل‌ها">{formatBytes(health.uploadsBytes)}</Row>
            {health.disk && <Row label="فضای آزاد دیسک">{`${formatBytes(health.disk.free)} از ${formatBytes(health.disk.total)}`}</Row>}
            <Row label="آخرین پشتیبان سرور">{formatDate(health.lastBackupAt)}</Row>
            <Row label="روشن از">{formatDate(new Date(Date.now() - health.uptimeSeconds * 1000).toISOString())}</Row>
          </dl>
        ) : (
          <div className="h-40 rounded-xl bg-stone-100 animate-pulse" aria-busy="true" />
        )}
      </Section>

      <Section
        title="پشتیبان‌گیری"
        description="سرور هر روز خودکار یک نسخه پشتیبان می‌سازد و ۱۴ نسخه آخر را نگه می‌دارد. برای امنیت بیشتر، هفته‌ای یک بار فایل پشتیبان را دانلود کنید و جای دیگری نگه دارید."
      >
        <div className="flex flex-wrap gap-2">
          <Button tone="dark" onClick={() => void snapshot()} disabled={busy}>
            <HardDrive className="w-4 h-4" aria-hidden="true" />
            ساخت پشتیبان روی سرور
          </Button>
          <Button onClick={() => void download()}>
            <Download className="w-4 h-4" aria-hidden="true" />
            دانلود فایل پشتیبان
          </Button>
          <label className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl border border-red-300 bg-white hover:bg-red-50 text-[13.5px] font-bold text-red-700 cursor-pointer">
            <Upload className="w-4 h-4" aria-hidden="true" />
            بازیابی از فایل
            <input type="file" accept="application/json,.json" className="sr-only" onChange={pickRestoreFile} />
          </label>
        </div>
        {health && health.backups.length > 0 && (
          <details className="mt-3 text-[12.5px] text-stone-700">
            <summary className="cursor-pointer font-bold">نسخه‌های روی سرور ({formatNumber(health.backups.length)})</summary>
            <ul className="mt-2 space-y-1" dir="ltr">
              {health.backups.map((b) => (
                <li key={b.name} className="flex justify-between gap-3">
                  <span className="truncate">{b.name}</span>
                  <span dir="rtl">{formatBytes(b.size)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section title="رمز مدیر" description={`رمز باید دست‌کم ${formatNumber(MIN_PASSWORD)} حرف باشد. بعد از تغییر رمز، همه دستگاه‌های دیگر از پنل خارج می‌شوند.`}>
        <form onSubmit={changePassword} className="grid sm:grid-cols-3 gap-3 items-end">
          <Field label="رمز فعلی" htmlFor="pw-old">
            <input id="pw-old" type="password" autoComplete="current-password" className={inputClass} value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} />
          </Field>
          <Field label="رمز جدید" htmlFor="pw-new">
            <input id="pw-new" type="password" autoComplete="new-password" className={inputClass} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Field label="تکرار رمز جدید" htmlFor="pw-confirm">
            <input id="pw-confirm" type="password" autoComplete="new-password" className={inputClass} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
          <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2">
            <p role="status" className={`text-[12.5px] ${pwMsg?.ok ? 'text-emerald-800' : 'text-red-700'}`}>
              {pwMsg?.text}
            </p>
            <Button type="submit" tone="dark">
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              تغییر رمز
            </Button>
          </div>
        </form>
      </Section>

      <Section title="تاریخچه تغییرات" description="چه کسی، چه زمانی و چه چیزی را عوض کرده است (۵۰ مورد آخر).">
        {audit.length === 0 ? (
          <p className="text-[13px] text-stone-500">هنوز تغییری ثبت نشده است.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {audit.map((a) => (
              <li key={a.id} className="py-2 text-[12.5px] flex flex-wrap justify-between gap-x-3">
                <span className="text-stone-800">
                  <span className={`font-bold ${a.action === 'login-failed' ? 'text-red-700' : ''}`}>{ACTION_LABEL[a.action] || a.action}</span>{' '}
                  {ENTITY_LABEL[a.entity] || a.entity}
                  {a.summary && <span className="text-stone-600">: {a.summary}</span>}
                </span>
                <span className="text-stone-500">{formatDate(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="بازیابی از فایل پشتیبان"
        footer={
          <>
            <Button onClick={() => setPending(null)}>انصراف</Button>
            <Button tone="danger" onClick={() => void confirmRestore()} disabled={busy}>
              جایگزین کردن اطلاعات
            </Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-3 text-[13px] text-stone-700 leading-relaxed">
            <p>
              فایل <b dir="ltr">{pending.fileName}</b> جای همه کارت‌ها، شعبه‌ها و درخواست‌های فعلی را می‌گیرد. قبل از این کار، یک نسخه از اطلاعات فعلی خودکار روی سرور
              ذخیره می‌شود تا در صورت اشتباه برگردد.
            </p>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-stone-500">
                  <th className="text-start font-medium" />
                  <th className="text-start font-medium">الان</th>
                  <th className="text-start font-medium">بعد از بازیابی</th>
                </tr>
              </thead>
              <tbody className="font-bold">
                {(['profiles', 'branches', 'leads'] as const).map((k) => (
                  <tr key={k}>
                    <td className="py-1 font-medium">{k === 'profiles' ? 'کارت' : k === 'branches' ? 'شعبه' : 'درخواست'}</td>
                    <td>{formatNumber(pending.preview.current[k])}</td>
                    <td>{formatNumber(pending.preview.incoming[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pending.preview.removed.length > 0 && (
              <p className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800">
                این کارت‌ها در فایل نیستند و حذف می‌شوند: {pending.preview.removed.map(nameOf).join('، ')}
              </p>
            )}
            {pending.preview.added.length > 0 && <p>{formatNumber(pending.preview.added.length)} کارت تازه اضافه می‌شود.</p>}
            <p className="flex items-center gap-1.5 text-stone-500">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              رمز مدیر با بازیابی عوض نمی‌شود.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};
