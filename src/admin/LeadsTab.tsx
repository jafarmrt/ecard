import React, { useEffect, useState } from 'react';
import { Download, Search, Phone, Contact, Trash2, RefreshCw, MessageCircle, AlarmClock, ShieldCheck } from 'lucide-react';
import { CustomerLead, EmployeeProfile, LeadStatus } from '../types';
import { api } from '../services/api';
import { LEAD_TOPICS } from '../utils/leadTopics';
import { normalizeIranMobile, telHref, toPersianDigits, whatsappNumber } from '../utils/phone';
import { jalaliMonthKey, jalaliMonthLabel, tehranDayOf } from '../utils/jalali';
import { Button, Section, downloadBlob, formatDate, formatNumber, inputClass, smallSelect, useToast } from './ui';

const SOURCE_LABEL: Record<string, string> = { nfc: 'کارت NFC', qr: 'کد QR', link: 'لینک' };

const STATUS_LABEL: Record<LeadStatus, string> = { new: 'جدید', contacted: 'تماس گرفته شد', closed: 'بسته شد' };
const STATUS_STYLE: Record<LeadStatus, string> = {
  new: 'bg-red-50 text-[#9E111E] border-red-200',
  contacted: 'bg-amber-50 text-amber-900 border-amber-200',
  closed: 'bg-emerald-50 text-emerald-900 border-emerald-200',
};
const statusOf = (l: CustomerLead): LeadStatus => l.status || 'new';

/** A new request nobody has called back within 48 hours. */
const OVERDUE_MS = 48 * 60 * 60 * 1000;
export const isOverdue = (l: CustomerLead, now = Date.now()) => statusOf(l) === 'new' && now - Date.parse(l.createdAt) > OVERDUE_MS;

type StatusFilter = LeadStatus | 'overdue' | '';

/** Follow-up note, saved when the field loses focus or with the button. */
const FollowupNote: React.FC<{ lead: CustomerLead; onSave: (note: string) => Promise<boolean> }> = ({ lead, onSave }) => {
  const [value, setValue] = useState(lead.followupNote || '');
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== (lead.followupNote || '');
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    await onSave(value.trim());
    setSaving(false);
  };
  return (
    <div className="mt-1.5 flex gap-1.5 items-start">
      <textarea
        rows={1}
        maxLength={1000}
        aria-label={`یادداشت پیگیری ${lead.customerName}`}
        className={`${inputClass} min-h-9 py-1.5 text-[12.5px] resize-y`}
        placeholder="نتیجه تماس، مثلاً: پیش‌فاکتور فرستاده شد"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
      />
      {dirty && (
        <Button size="sm" tone="dark" onClick={() => void save()} disabled={saving}>
          ذخیره
        </Button>
      )}
    </div>
  );
};

/** Leads come from a public form: neutralise values a spreadsheet would run as formulas. */
export function csvCell(value?: string): string {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

function vcardEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

export const LeadsTab: React.FC<{ profiles: EmployeeProfile[]; onNewCountChange?: (n: number) => void }> = ({
  profiles,
  onNewCountChange,
}) => {
  const toast = useToast();
  const [leads, setLeads] = useState<CustomerLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [owner, setOwner] = useState('');
  // '' all, 'd7' last 7 days, 'm1405-08' a Jalali month
  const [period, setPeriod] = useState('');

  const counts = {
    all: leads.length,
    new: leads.filter((l) => statusOf(l) === 'new').length,
    contacted: leads.filter((l) => statusOf(l) === 'contacted').length,
    closed: leads.filter((l) => statusOf(l) === 'closed').length,
    overdue: leads.filter((l) => isOverdue(l)).length,
  };

  // Jalali months that have requests, newest first, for the period filter and export.
  const months = [...new Map<string, string>(leads.map((l) => [jalaliMonthKey(l.createdAt), jalaliMonthLabel(tehranDayOf(l.createdAt))])).entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12);
  const periodName =
    period.startsWith('d') ? `${toPersianDigits(period.slice(1))} روز اخیر` : period.startsWith('m') ? months.find(([k]) => `m${k}` === period)?.[1] || '' : '';

  useEffect(() => {
    if (!loading) onNewCountChange?.(counts.new);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts.new, loading]);

  const owners = [...new Map(leads.map((l) => [l.profileId, l.profileName])).entries()]
    .map(([id, name]) => ({ id, name: profiles.find((p) => p.id === id)?.name || name || 'نامشخص' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));

  const update = async (l: CustomerLead, changes: { status?: LeadStatus; followupNote?: string }) => {
    const res = await api.updateLead(l.id, changes);
    if (res.success && res.lead) {
      setLeads((prev) => prev.map((x) => (x.id === l.id ? res.lead! : x)));
      if (changes.followupNote !== undefined) toast('یادداشت ذخیره شد.');
      return true;
    }
    toast(res.error || 'ذخیره انجام نشد.', 'error');
    return false;
  };

  const load = async () => {
    setLoading(true);
    const res = await api.getLeads();
    setLoading(false);
    if (res.success) setLeads(res.leads || []);
    else toast(res.error || 'دریافت درخواست‌ها انجام نشد.', 'error');
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const since = period.startsWith('d') ? Date.now() - Number(period.slice(1)) * 86400000 : 0;
  const visible = leads.filter((l) => {
    if (topic && l.topic !== topic) return false;
    if (status === 'overdue' ? !isOverdue(l) : status && statusOf(l) !== status) return false;
    if (owner && l.profileId !== owner) return false;
    if (since && Date.parse(l.createdAt) < since) return false;
    if (period.startsWith('m') && `m${jalaliMonthKey(l.createdAt)}` !== period) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [l.customerName, l.customerMobile, l.customerCompany, l.note, l.profileName, l.topic, l.followupNote]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const exportCsv = () => {
    if (visible.length === 0) return toast('درخواستی برای خروجی وجود ندارد.', 'error');
    const header = ['نام مشتری', 'موبایل', 'شرکت', 'موضوع', 'یادداشت', 'کارشناس', 'از طریق', 'کمپین', 'تاریخ ثبت', 'رضایت تماس', 'وضعیت', 'نتیجه پیگیری'];
    const rows = visible.map((l) => [
      l.customerName,
      l.customerMobile,
      l.customerCompany || '',
      l.topic || '',
      l.note || '',
      l.profileName,
      SOURCE_LABEL[l.source || ''] || l.source || '',
      l.campaign || '',
      formatDate(l.createdAt),
      l.consentAt ? formatDate(l.consentAt) : '',
      STATUS_LABEL[statusOf(l)],
      l.followupNote || '',
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const suffix = period.startsWith('m') ? period.slice(1) : period ? `last-${period.slice(1)}-days` : new Date().toISOString().slice(0, 10);
    downloadBlob(csv, 'text/csv;charset=utf-8', `roya-leads-${suffix}.csv`);
    toast(`${formatNumber(visible.length)} درخواست${periodName ? ` (${periodName})` : ''} در فایل اکسل ذخیره شد.`);
  };

  const downloadVcf = (l: CustomerLead) => {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN;CHARSET=UTF-8:${vcardEscape(l.customerName)}`,
      `N;CHARSET=UTF-8:${vcardEscape(l.customerName)};;;;`,
      l.customerCompany ? `ORG;CHARSET=UTF-8:${vcardEscape(l.customerCompany)}` : '',
      `TEL;TYPE=CELL:${telHref(l.customerMobile)}`,
      `NOTE;CHARSET=UTF-8:${vcardEscape(
        [`از کارت ${l.profileName}`, l.topic, l.note].filter(Boolean).join(' - ')
      )}`,
      'END:VCARD',
    ].filter(Boolean);
    downloadBlob(lines.join('\r\n'), 'text/vcard;charset=utf-8', `lead-${l.customerName.replace(/\s+/g, '_')}.vcf`);
  };

  const forgetCustomer = async () => {
    const input = window.prompt('شماره موبایل مشتری که خواسته اطلاعاتش حذف شود:');
    if (!input) return;
    const mobile = normalizeIranMobile(input);
    if (!mobile) return toast('شماره موبایل معتبر نیست. نمونه صحیح: 09121234567', 'error');
    const found = leads.filter((l) => l.customerMobile === mobile).length;
    if (!window.confirm(`${formatNumber(found)} درخواست از شماره ${toPersianDigits(mobile)} برای همیشه حذف شود؟`)) return;
    const res = await api.purgeLeads({ mobile });
    if (res.success) {
      toast(`${formatNumber(res.removed)} درخواست حذف شد.`);
      await load();
    } else toast(res.error || 'حذف انجام نشد.', 'error');
  };

  const purgeOldClosed = async () => {
    if (!window.confirm('درخواست‌های «بسته شد» که بیش از یک سال از آخرین تغییرشان گذشته برای همیشه حذف شوند؟')) return;
    const res = await api.purgeLeads({ closedOlderThanDays: 365 });
    if (res.success) {
      toast(`${formatNumber(res.removed)} درخواست قدیمی حذف شد.`);
      await load();
    } else toast(res.error || 'حذف انجام نشد.', 'error');
  };

  const remove = async (l: CustomerLead) => {
    if (!window.confirm(`درخواست ${l.customerName} حذف شود؟`)) return;
    const res = await api.deleteLead(l.id);
    if (res.success) {
      setLeads((prev) => prev.filter((x) => x.id !== l.id));
      toast('درخواست حذف شد.');
    } else toast(res.error || 'حذف انجام نشد.', 'error');
  };

  return (
    <Section
      title={`درخواست‌های تماس (${formatNumber(leads.length)})`}
      description="مشتری‌هایی که از فرم «ارسال شماره برای کارشناس» روی کارت‌ها شماره گذاشته‌اند. بعد از تماس، وضعیت را عوض کنید و نتیجه را یادداشت کنید."
      actions={
        <>
          <Button size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            به‌روزرسانی
          </Button>
          <Button size="sm" tone="dark" onClick={exportCsv}>
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            خروجی اکسل
          </Button>
        </>
      }
    >
      {counts.overdue > 0 && status !== 'overdue' && (
        <button
          type="button"
          onClick={() => setStatus('overdue')}
          className="w-full mb-3 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-start text-[13px] font-bold text-[#9E111E] cursor-pointer hover:bg-red-100"
        >
          <AlarmClock className="w-4 h-4 shrink-0" aria-hidden="true" />
          {formatNumber(counts.overdue)} درخواست بیش از ۴۸ ساعت است که بی‌پاسخ مانده. نمایش بده
        </button>
      )}
      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="وضعیت پیگیری">
        {([
          ['', 'همه', counts.all],
          ['new', 'جدید', counts.new],
          ['overdue', 'بی‌پاسخ بیش از ۴۸ ساعت', counts.overdue],
          ['contacted', 'تماس گرفته شد', counts.contacted],
          ['closed', 'بسته شد', counts.closed],
        ] as [StatusFilter, string, number][]).map(([id, label, n]) => (
          <button
            key={id || 'all'}
            type="button"
            role="tab"
            aria-selected={status === id}
            onClick={() => setStatus(id)}
            className={`min-h-9 px-3 rounded-xl border text-[12.5px] font-bold cursor-pointer ${
              status === id ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
            }`}
          >
            {label} ({formatNumber(n)})
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-stone-400 absolute start-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            aria-label="جستجو در درخواست‌ها"
            className={`${inputClass} ps-9`}
            placeholder="نام، شماره، شرکت یا کارشناس"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select aria-label="موضوع" className={`${smallSelect} min-h-11`} value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">همه موضوع‌ها</option>
          {LEAD_TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="کارشناس" className={`${smallSelect} min-h-11`} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">همه کارشناس‌ها</option>
          {owners.map((o) => (
            <option key={o.id || 'none'} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select aria-label="بازه زمانی" className={`${smallSelect} min-h-11`} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="">همه زمان‌ها</option>
          <option value="d7">۷ روز اخیر</option>
          <option value="d30">۳۰ روز اخیر</option>
          <option value="d90">۹۰ روز اخیر</option>
          {months.map(([key, label]) => (
            <option key={key} value={`m${key}`}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading && leads.length === 0 ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-stone-100 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-center text-[13px] text-stone-500 py-8">درخواستی پیدا نشد.</p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {visible.map((l) => {
            const wa = whatsappNumber(l.customerMobile);
            return (
              <li key={l.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 basis-[280px] space-y-0.5">
                  <p className="text-[14px] font-black text-stone-900">
                    <span className={`inline-block align-middle me-1.5 px-2 py-0.5 rounded-md border text-[11.5px] font-bold ${STATUS_STYLE[statusOf(l)]}`}>
                      {STATUS_LABEL[statusOf(l)]}
                    </span>
                    {isOverdue(l) && (
                      <span className="inline-flex items-center gap-1 align-middle me-1.5 px-2 py-0.5 rounded-md bg-[#D0192A] text-white text-[11.5px] font-bold">
                        <AlarmClock className="w-3 h-3" aria-hidden="true" />
                        بیش از ۴۸ ساعت بی‌پاسخ
                      </span>
                    )}
                    {l.customerName}
                    {l.customerCompany && <span className="font-medium text-stone-600"> · {l.customerCompany}</span>}
                  </p>
                  <p className="text-[13px] text-stone-800 font-bold" dir="ltr" style={{ textAlign: 'start' }}>
                    {toPersianDigits(l.customerMobile)}
                  </p>
                  <p className="text-[12px] text-stone-600">
                    {l.topic && <span className="inline-block px-2 py-0.5 me-1.5 rounded-md bg-red-50 text-[#9E111E] font-bold">{l.topic}</span>}
                    برای {l.profileName}
                    {l.source && ` · از ${SOURCE_LABEL[l.source] || l.source}`}
                    {l.campaign && (
                      <>
                        {' · کمپین '}
                        <span dir="ltr">{l.campaign}</span>
                      </>
                    )}{' '}
                    · {formatDate(l.createdAt)}
                  </p>
                  {l.note && <p className="text-[12.5px] text-stone-700 bg-stone-50 rounded-lg px-2.5 py-1.5 mt-1 whitespace-pre-line">{l.note}</p>}
                  <FollowupNote key={l.id} lead={l} onSave={(followupNote) => update(l, { followupNote })} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <select
                    aria-label={`وضعیت درخواست ${l.customerName}`}
                    className={`${smallSelect} min-h-9`}
                    value={statusOf(l)}
                    onChange={(e) => void update(l, { status: e.target.value as LeadStatus })}
                  >
                    {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {STATUS_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <a
                    href={`tel:${telHref(l.customerMobile)}`}
                    className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl bg-[#D0192A] hover:bg-[#B51221] text-white text-[12.5px] font-bold"
                  >
                    <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                    تماس
                  </a>
                  {wa && (
                    <a
                      href={`https://wa.me/${wa}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-[12.5px] font-bold text-emerald-800"
                    >
                      <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      واتساپ
                    </a>
                  )}
                  <Button size="sm" onClick={() => downloadVcf(l)} aria-label={`ذخیره مخاطب ${l.customerName}`}>
                    <Contact className="w-3.5 h-3.5" aria-hidden="true" />
                    مخاطب
                  </Button>
                  <Button size="sm" tone="danger" onClick={() => void remove(l)} aria-label={`حذف درخواست ${l.customerName}`}>
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details className="mt-5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
        <summary className="flex items-center gap-2 min-h-9 text-[13px] font-bold text-stone-800 cursor-pointer">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          حریم خصوصی مشتری‌ها
        </summary>
        <div className="space-y-2 pb-2 text-[12.5px] text-stone-600 leading-relaxed">
          <p>اگر مشتری خواست شماره‌اش پاک شود، همه درخواست‌های آن شماره را یک‌جا حذف کنید. درخواست‌های بسته‌شده قدیمی را هم بهتر است بعد از یک سال پاک کنید.</p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => void forgetCustomer()}>
              حذف به درخواست مشتری
            </Button>
            <Button size="sm" onClick={() => void purgeOldClosed()}>
              پاک کردن درخواست‌های بسته‌شده قدیمی‌تر از یک سال
            </Button>
          </div>
        </div>
      </details>
    </Section>
  );
};
