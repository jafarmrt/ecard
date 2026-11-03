import React, { useState } from 'react';
import { Check, Copy, KeyRound, MessageCircle, User, X } from 'lucide-react';
import { EditLinkInfo, EditRequest, EmployeeProfile, SelfEditField } from '../types';
import { api } from '../services/api';
import { copyToClipboard } from '../utils/clipboard';
import { whatsappNumber } from '../utils/phone';
import { SELF_EDIT_LABEL, SELF_EDIT_ORDER } from '../utils/selfEdit';
import { Button, Modal, formatDate, inputClass, useToast } from './ui';

const Value: React.FC<{ field: SelfEditField; value?: string; empty: string }> = ({ field, value, empty }) => {
  if (field === 'avatarUrl') {
    return value ? (
      <img src={value} alt="" className="w-14 h-14 rounded-full object-cover border border-stone-200" />
    ) : (
      <span className="w-14 h-14 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center">
        <User className="w-6 h-6 text-stone-400" aria-hidden="true" />
      </span>
    );
  }
  return value ? (
    <span dir="ltr" className="break-all">
      {value}
    </span>
  ) : (
    <span className="text-stone-400">{empty}</span>
  );
};

/** Changes employees sent from their private link, waiting for an admin to approve or reject. */
export const EditRequestsPanel: React.FC<{
  requests: EditRequest[];
  onDecided: () => Promise<void> | void;
}> = ({ requests, onDecided }) => {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = requests.filter((r) => r.status === 'pending');
  if (pending.length === 0) return null;

  const decide = async (r: EditRequest, approve: boolean) => {
    setBusyId(r.id);
    const res = await api.decideEditRequest(r.id, approve);
    setBusyId(null);
    if (res.success) {
      toast(approve ? `تغییرات کارت ${r.profileName} اعمال شد.` : `درخواست تغییر ${r.profileName} رد شد.`);
      await onDecided();
    } else toast(res.error || 'انجام نشد.', 'error');
  };

  return (
    <section aria-labelledby="edit-requests-title" className="bg-amber-50 border border-amber-200 rounded-2xl p-3 sm:p-4 space-y-3">
      <h2 id="edit-requests-title" className="text-[14px] font-black text-amber-950">
        تغییراتی که همکاران فرستاده‌اند ({pending.length.toLocaleString('fa-IR')})
      </h2>
      <p className="text-[12.5px] text-amber-900 leading-relaxed">تا وقتی تأیید نکنید، کارت مشتری‌ها همان اطلاعات قبلی را نشان می‌دهد.</p>
      <ul className="space-y-2">
        {pending.map((r) => {
          const fields = SELF_EDIT_ORDER.filter((f) => f in r.changes);
          return (
            <li key={r.id} className="bg-white border border-amber-200 rounded-xl p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13.5px] font-black text-stone-900">{r.profileName || r.profileId}</span>
                <span className="text-xs text-stone-500">{formatDate(r.createdAt)}</span>
              </div>
              <table className="w-full mt-2 text-[12.5px]">
                <thead>
                  <tr className="text-stone-500 text-start">
                    <th scope="col" className="font-medium text-start py-1 w-20"></th>
                    <th scope="col" className="font-medium text-start py-1">الان روی کارت</th>
                    <th scope="col" className="font-medium text-start py-1">پیشنهاد جدید</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f} className="border-t border-stone-100 align-middle">
                      <th scope="row" className="font-bold text-stone-700 text-start py-1.5">
                        {SELF_EDIT_LABEL[f]}
                      </th>
                      <td className="py-1.5 pe-2 text-stone-600">
                        <Value field={f} value={r.current[f]} empty={f === 'instagram' ? 'صفحه شرکت' : 'خالی'} />
                      </td>
                      <td className="py-1.5 text-stone-900 font-medium">
                        <Value field={f} value={r.changes[f]} empty={f === 'instagram' ? 'صفحه شرکت' : 'حذف شود'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Button size="sm" tone="primary" disabled={busyId === r.id} onClick={() => void decide(r, true)}>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  تأیید و اعمال روی کارت
                </Button>
                <Button size="sm" tone="danger" disabled={busyId === r.id} onClick={() => void decide(r, false)}>
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  رد
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Create, resend or revoke the private link an employee uses to edit their card. */
export const EditLinkModal: React.FC<{
  profile: EmployeeProfile | null;
  link?: EditLinkInfo;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}> = ({ profile, link, onClose, onChanged }) => {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setUrl(null);
    onClose();
  };

  if (!profile) return null;

  const create = async () => {
    if (link && !window.confirm('با ساخت لینک تازه، لینکی که قبلاً فرستاده‌اید دیگر کار نمی‌کند. ادامه می‌دهید؟')) return;
    setBusy(true);
    const res = await api.createEditLink(profile.id);
    setBusy(false);
    if (res.success && res.url) {
      setUrl(res.url);
      await onChanged();
    } else toast(res.error || 'ساخت لینک انجام نشد.', 'error');
  };

  const revoke = async () => {
    if (!window.confirm(`لینک ویرایش ${profile.name} باطل شود؟`)) return;
    setBusy(true);
    const res = await api.revokeEditLink(profile.id);
    setBusy(false);
    if (res.success) {
      toast('لینک باطل شد.');
      setUrl(null);
      await onChanged();
    } else toast(res.error || 'انجام نشد.', 'error');
  };

  const copy = async () => {
    if (url) toast((await copyToClipboard(url)) ? 'لینک کپی شد.' : url);
  };

  const phone = whatsappNumber(profile.whatsapp || profile.mobile);
  const message = url
    ? `سلام ${profile.name}، با این لینک می‌توانید عکس، واتساپ، اینستاگرام و ایمیل کارت ویزیت دیجیتال خود را به‌روز کنید. تغییرات بعد از تأیید روی کارت می‌آید. این لینک مخصوص شماست:\n${url}`
    : '';

  return (
    <Modal open onClose={close} title={`لینک ویرایش برای ${profile.name}`}>
      <div className="space-y-3 text-[13px] text-stone-700 leading-relaxed">
        <p>
          همکار با این لینک فقط <b>عکس، واتساپ، اینستاگرام و ایمیل</b> کارت خودش را می‌تواند عوض کند. هر تغییر اول اینجا برای تأیید شما می‌آید و بعد روی
          کارت نمایش داده می‌شود.
        </p>

        {url ? (
          <div className="space-y-2">
            <p className="font-bold text-stone-900">لینک ساخته شد. همین حالا آن را برای {profile.name} بفرستید؛ این لینک دوباره نمایش داده نمی‌شود.</p>
            <input readOnly dir="ltr" className={`${inputClass} text-[12.5px]`} value={url} onFocus={(e) => e.target.select()} aria-label="لینک ویرایش" />
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => void copy()}>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                کپی لینک
              </Button>
              {phone && (
                <a
                  href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-[12.5px] font-bold text-stone-800"
                >
                  <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  ارسال در واتساپ
                </a>
              )}
            </div>
          </div>
        ) : link ? (
          <p className="rounded-xl bg-stone-100 p-3">
            لینک فعالی دارد (ساخته‌شده {formatDate(link.createdAt, false)}
            {link.lastUsedAt ? `، آخرین استفاده ${formatDate(link.lastUsedAt)}` : '، هنوز باز نشده'}). اگر لینک را گم کرده، لینک تازه بسازید.
          </p>
        ) : (
          <p className="rounded-xl bg-stone-100 p-3">هنوز لینکی برای این همکار ساخته نشده است.</p>
        )}

        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button tone={url ? 'ghost' : 'primary'} size="sm" disabled={busy} onClick={() => void create()}>
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
            {link || url ? 'ساخت لینک تازه' : 'ساخت لینک'}
          </Button>
          {(link || url) && (
            <Button tone="danger" size="sm" disabled={busy} onClick={() => void revoke()}>
              باطل کردن لینک
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
