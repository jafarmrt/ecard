import React, { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Link2, QrCode, ExternalLink, Archive, RotateCcw, Trash2, User, Eye } from 'lucide-react';
import { Branch, EmployeeProfile } from '../types';
import { api } from '../services/api';
import { copyToClipboard } from '../utils/clipboard';
import { getDirectCardUrl } from '../utils/url';
import { Button, Modal, StatusBadge, formatNumber, inputClass, useToast } from './ui';

type Filter = 'current' | 'active' | 'inactive' | 'archived';

export const StaffTab: React.FC<{
  profiles: EmployeeProfile[];
  branches: Branch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (profile: EmployeeProfile | null) => void;
  onOpenQr: (profile: EmployeeProfile) => void;
  onChanged: () => Promise<void> | void;
}> = ({ profiles, branches, selectedId, onSelect, onEdit, onOpenQr, onChanged }) => {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('current');
  const [archiveTarget, setArchiveTarget] = useState<EmployeeProfile | null>(null);
  const [successorId, setSuccessorId] = useState('');
  const [busy, setBusy] = useState(false);

  const counts = useMemo(
    () => ({
      current: profiles.filter((p) => p.status !== 'archived').length,
      active: profiles.filter((p) => (p.status || 'active') === 'active').length,
      inactive: profiles.filter((p) => p.status === 'inactive').length,
      archived: profiles.filter((p) => p.status === 'archived').length,
    }),
    [profiles]
  );

  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name || '';

  const visible = profiles.filter((p) => {
    const status = p.status || 'active';
    if (filter === 'current' && status === 'archived') return false;
    if (filter !== 'current' && status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [p.name, p.nameEn, p.title, p.mobile, p.department, p.slug, branchName(p.branchId)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const copyLink = async (p: EmployeeProfile) => {
    const url = getDirectCardUrl(p);
    toast((await copyToClipboard(url)) ? `لینک کارت ${p.name} کپی شد.` : url);
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setBusy(true);
    const res = await api.archiveProfile(archiveTarget.id, successorId || undefined);
    setBusy(false);
    if (res.success) {
      toast(
        successorId
          ? `کارت ${archiveTarget.name} بایگانی شد. لینک و QR آن از این به بعد کارت جایگزین را باز می‌کند.`
          : `کارت ${archiveTarget.name} بایگانی شد. لینک آن صفحه شرکت را نشان می‌دهد.`
      );
      setArchiveTarget(null);
      await onChanged();
    } else {
      toast(res.error || 'بایگانی انجام نشد.', 'error');
    }
  };

  const restore = async (p: EmployeeProfile) => {
    const res = await api.restoreProfile(p.id);
    if (res.success) {
      toast(`کارت ${p.name} دوباره فعال شد.`);
      await onChanged();
    } else toast(res.error || 'بازگردانی انجام نشد.', 'error');
  };

  const removeForever = async (p: EmployeeProfile) => {
    if (!window.confirm(`کارت ${p.name} برای همیشه حذف شود؟ آمار و لینک‌های قدیمی آن هم از بین می‌رود و قابل برگشت نیست.`)) return;
    const res = await api.deleteProfile(p.id);
    if (res.success) {
      toast(`کارت ${p.name} حذف شد.`);
      await onChanged();
    } else toast(res.error || 'حذف انجام نشد.', 'error');
  };

  const filters: { id: Filter; label: string }[] = [
    { id: 'current', label: 'همه' },
    { id: 'active', label: 'فعال' },
    { id: 'inactive', label: 'غیرفعال' },
    { id: 'archived', label: 'بایگانی' },
  ];

  const successors = profiles.filter((p) => p.id !== archiveTarget?.id && (p.status || 'active') === 'active');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-stone-400 absolute start-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            aria-label="جستجو در کارت‌ها"
            className={`${inputClass} ps-9`}
            placeholder="جستجوی نام، سمت، شماره یا شعبه"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button tone="primary" onClick={() => onEdit(null)}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          کارت جدید
        </Button>
      </div>

      <div role="tablist" aria-label="وضعیت کارت" className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-9 px-3 rounded-lg text-[12.5px] font-bold border cursor-pointer ${
              filter === f.id ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
            }`}
          >
            {f.label} ({formatNumber(counts[f.id])})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-8 text-center text-[13px] text-stone-500">
          {profiles.length === 0 ? 'هنوز کارتی ساخته نشده است.' : 'کارتی با این مشخصات پیدا نشد.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((p) => {
            const status = p.status || 'active';
            const selected = p.id === selectedId;
            const successor = p.redirectTo ? profiles.find((x) => x.id === p.redirectTo) : undefined;
            return (
              <li
                key={p.id}
                className={`bg-white border rounded-2xl p-3 sm:p-3.5 ${selected ? 'border-[#D0192A] ring-2 ring-red-100' : 'border-stone-200'}`}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-start cursor-pointer"
                    aria-label={`پیش‌نمایش کارت ${p.name}`}
                  >
                    <span className="w-12 h-12 rounded-full bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <User className="w-6 h-6 text-stone-400" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-black text-stone-900 truncate">{p.name}</span>
                        <StatusBadge status={status} />
                      </span>
                      <span className="block text-[12.5px] text-stone-600 truncate">
                        {[p.title, branchName(p.branchId)].filter(Boolean).join(' · ')}
                      </span>
                      <span className="block text-xs text-stone-500 truncate" dir="ltr" style={{ textAlign: 'start' }}>
                        /{p.slug || p.id}
                      </span>
                      {status === 'archived' && (
                        <span className="block text-xs text-stone-500">
                          {successor ? `لینک به کارت ${successor.name} می‌رود` : 'لینک صفحه شرکت را نشان می‌دهد'}
                        </span>
                      )}
                    </span>
                  </button>
                  <span className="hidden sm:flex flex-col items-center text-xs text-stone-500 shrink-0 px-2" title="بازدید">
                    <Eye className="w-4 h-4" aria-hidden="true" />
                    {formatNumber(p.analytics?.views)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {status !== 'archived' ? (
                    <>
                      <Button size="sm" onClick={() => onEdit(p)}>
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        ویرایش
                      </Button>
                      <Button size="sm" onClick={() => void copyLink(p)}>
                        <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                        کپی لینک
                      </Button>
                      <Button size="sm" onClick={() => onOpenQr(p)}>
                        <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                        QR و NFC
                      </Button>
                      <a
                        href={getDirectCardUrl(p)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-[12.5px] font-bold text-stone-800"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        باز کردن
                      </a>
                      <Button
                        size="sm"
                        tone="danger"
                        onClick={() => {
                          setSuccessorId('');
                          setArchiveTarget(p);
                        }}
                      >
                        <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                        بایگانی
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => void restore(p)}>
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        فعال کردن دوباره
                      </Button>
                      <Button size="sm" tone="danger" onClick={() => void removeForever(p)}>
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        حذف همیشگی
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title={`بایگانی کارت ${archiveTarget?.name || ''}`}
        footer={
          <>
            <Button onClick={() => setArchiveTarget(null)}>انصراف</Button>
            <Button tone="danger" onClick={() => void confirmArchive()} disabled={busy}>
              بایگانی کارت
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px] text-stone-700 leading-relaxed">
          <p>
            کارت بایگانی‌شده حذف نمی‌شود و آمار و درخواست‌های آن می‌ماند. کارت‌های NFC و QR چاپ‌شده هم از کار نمی‌افتند: یا کارت همکار جایگزین را باز می‌کنند،
            یا صفحه شرکت را با شماره تماس شرکت نشان می‌دهند.
          </p>
          <label htmlFor="archive-successor" className="block font-bold text-stone-800">
            مشتری‌هایی که این کارت را باز می‌کنند به کدام کارت بروند؟
          </label>
          <select id="archive-successor" className={inputClass} value={successorId} onChange={(e) => setSuccessorId(e.target.value)}>
            <option value="">هیچ‌کدام، صفحه شرکت نشان داده شود</option>
            {successors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.title ? ` (${p.title})` : ''}
              </option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  );
};
