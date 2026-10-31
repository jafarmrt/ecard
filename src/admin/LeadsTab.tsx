import React, { useEffect, useState } from 'react';
import { Download, Search, Phone, Contact, Trash2, RefreshCw, MessageCircle } from 'lucide-react';
import { CustomerLead } from '../types';
import { api } from '../services/api';
import { LEAD_TOPICS } from '../utils/leadTopics';
import { telHref, toPersianDigits, whatsappNumber } from '../utils/phone';
import { Button, Section, downloadBlob, formatDate, formatNumber, inputClass, smallSelect, useToast } from './ui';

const SOURCE_LABEL: Record<string, string> = { nfc: 'کارت NFC', qr: 'کد QR', link: 'لینک' };

/** Leads come from a public form: neutralise values a spreadsheet would run as formulas. */
export function csvCell(value?: string): string {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

function vcardEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

export const LeadsTab: React.FC = () => {
  const toast = useToast();
  const [leads, setLeads] = useState<CustomerLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');

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

  const visible = leads.filter((l) => {
    if (topic && l.topic !== topic) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [l.customerName, l.customerMobile, l.customerCompany, l.note, l.profileName, l.topic]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const exportCsv = () => {
    if (visible.length === 0) return toast('درخواستی برای خروجی وجود ندارد.', 'error');
    const header = ['نام مشتری', 'موبایل', 'شرکت', 'موضوع', 'یادداشت', 'کارشناس', 'از طریق', 'تاریخ ثبت', 'رضایت تماس'];
    const rows = visible.map((l) => [
      l.customerName,
      l.customerMobile,
      l.customerCompany || '',
      l.topic || '',
      l.note || '',
      l.profileName,
      SOURCE_LABEL[l.source || ''] || l.source || '',
      formatDate(l.createdAt),
      l.consentAt ? formatDate(l.consentAt) : '',
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    downloadBlob(csv, 'text/csv;charset=utf-8', `roya-leads-${new Date().toISOString().slice(0, 10)}.csv`);
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
      description="مشتری‌هایی که از فرم «ارسال شماره برای کارشناس» روی کارت‌ها شماره گذاشته‌اند."
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
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            aria-label="جستجو در درخواست‌ها"
            className={`${inputClass} pr-9`}
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
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[14px] font-black text-stone-900">
                    {l.customerName}
                    {l.customerCompany && <span className="font-medium text-stone-600"> · {l.customerCompany}</span>}
                  </p>
                  <p className="text-[13px] text-stone-800 font-bold" dir="ltr" style={{ textAlign: 'start' }}>
                    {toPersianDigits(l.customerMobile)}
                  </p>
                  <p className="text-[12px] text-stone-600">
                    {l.topic && <span className="inline-block px-2 py-0.5 me-1.5 rounded-md bg-red-50 text-[#9E111E] font-bold">{l.topic}</span>}
                    برای {l.profileName}
                    {l.source && ` · از ${SOURCE_LABEL[l.source] || l.source}`} · {formatDate(l.createdAt)}
                  </p>
                  {l.note && <p className="text-[12.5px] text-stone-700 bg-stone-50 rounded-lg px-2.5 py-1.5 mt-1">{l.note}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
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
    </Section>
  );
};
