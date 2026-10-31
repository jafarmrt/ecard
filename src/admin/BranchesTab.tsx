import React, { useState } from 'react';
import { Plus, Pencil, Trash2, MapPin, LocateFixed, Star, ExternalLink } from 'lucide-react';
import { Branch, EmployeeProfile } from '../types';
import { api } from '../services/api';
import { LOCATION_PRESETS, buildMapUrls } from '../utils/location';
import { toEnglishDigits, toPersianDigits } from '../utils/phone';
import { Button, Field, Modal, Section, formatNumber, inputClass, useToast } from './ui';

interface BranchForm {
  id?: string;
  name: string;
  address: string;
  postalCode: string;
  landline: string;
  lat: string;
  lng: string;
  isDefault: boolean;
}

const toForm = (b?: Branch): BranchForm => ({
  id: b?.id,
  name: b?.name || '',
  address: b?.address || '',
  postalCode: b?.postalCode || '',
  landline: b?.landline || '',
  lat: b?.mapLocation?.lat != null ? String(b.mapLocation.lat) : '',
  lng: b?.mapLocation?.lng != null ? String(b.mapLocation.lng) : '',
  isDefault: !!b?.isDefault,
});

export const BranchesTab: React.FC<{
  branches: Branch[];
  profiles: EmployeeProfile[];
  onChanged: (branches?: Branch[], profiles?: EmployeeProfile[]) => void;
}> = ({ branches, profiles, onChanged }) => {
  const toast = useToast();
  const [editing, setEditing] = useState<BranchForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cardsIn = (id: string) => profiles.filter((p) => p.branchId === id && p.status !== 'archived').length;

  const set = <K extends keyof BranchForm>(key: K, value: BranchForm[K]) => setEditing((f) => (f ? { ...f, [key]: value } : f));

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('مرورگر شما موقعیت مکانی را پشتیبانی نمی‌کند.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set('lat', pos.coords.latitude.toFixed(7));
        set('lng', pos.coords.longitude.toFixed(7));
      },
      () => setError('دسترسی به موقعیت مکانی داده نشد.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const save = async () => {
    if (!editing) return;
    setError(null);
    const lat = Number(toEnglishDigits(editing.lat));
    const lng = Number(toEnglishDigits(editing.lng));
    if (!editing.name.trim()) return setError('نام شعبه را وارد کنید.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (!lat && !lng)) {
      return setError('مختصات نقشه معتبر نیست. می‌توانید از گوگل‌مپ کپی کنید، مثلاً 35.7757770 و 51.4368051');
    }
    setSaving(true);
    const res = await api.saveBranch(
      {
        id: editing.id,
        name: editing.name.trim(),
        address: editing.address.trim(),
        postalCode: toEnglishDigits(editing.postalCode).trim(),
        landline: editing.landline.trim(),
        isDefault: editing.isDefault,
        mapLocation: { lat, lng, title: editing.name.trim(), ...buildMapUrls(lat, lng) },
      },
      editing.id ? 'update' : 'create'
    );
    setSaving(false);
    if (res.success) {
      toast(editing.id ? 'شعبه به‌روز شد. کارت‌های این شعبه هم به‌روز شدند.' : 'شعبه جدید اضافه شد.');
      setEditing(null);
      onChanged(res.branches, res.profiles);
    } else setError(res.error || 'ذخیره انجام نشد.');
  };

  const remove = async (b: Branch) => {
    const n = cardsIn(b.id);
    if (!window.confirm(`شعبه «${b.name}» حذف شود؟${n ? ` ${n} کارت این شعبه به شعبه اصلی منتقل می‌شود.` : ''}`)) return;
    const res = await api.deleteBranch(b.id);
    if (res.success) {
      toast('شعبه حذف شد.');
      onChanged(res.branches, res.profiles);
    } else toast(res.error || 'حذف انجام نشد.', 'error');
  };

  return (
    <Section
      title="شعبه‌ها و شوروم‌ها"
      description="آدرس، تلفن ثابت و نقشه هر کارت از شعبه‌اش گرفته می‌شود. اگر آدرس شعبه عوض شود، فقط همین‌جا اصلاحش کنید."
      actions={
        <Button tone="primary" size="sm" onClick={() => setEditing(toForm())}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          شعبه جدید
        </Button>
      }
    >
      <ul className="grid sm:grid-cols-2 gap-3">
        {branches.map((b) => (
          <li key={b.id} className="border border-stone-200 rounded-2xl p-4 bg-stone-50/50">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14px] font-black text-stone-900 flex items-center gap-1.5">
                  {b.name}
                  {b.isDefault && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-1.5">
                      <Star className="w-3 h-3" aria-hidden="true" />
                      اصلی
                    </span>
                  )}
                </p>
                <p className="text-[12.5px] text-stone-600 mt-1 leading-relaxed">{toPersianDigits(b.address) || 'بدون آدرس'}</p>
                {b.landline && (
                  <p className="text-[12.5px] text-stone-700 mt-0.5" dir="ltr" style={{ textAlign: 'start' }}>
                    {toPersianDigits(b.landline)}
                  </p>
                )}
                <p className="text-[11.5px] text-stone-500 mt-1">{formatNumber(cardsIn(b.id))} کارت</p>
              </div>
              <MapPin className="w-5 h-5 text-[#D0192A] shrink-0" aria-hidden="true" />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <Button size="sm" onClick={() => setEditing(toForm(b))}>
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                ویرایش
              </Button>
              {b.mapLocation?.googleMapsUrl && (
                <a
                  href={b.mapLocation.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-[12.5px] font-bold text-stone-800"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  نقشه
                </a>
              )}
              {branches.length > 1 && (
                <Button size="sm" tone="danger" onClick={() => void remove(b)} aria-label={`حذف شعبه ${b.name}`}>
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `ویرایش ${editing.name}` : 'شعبه جدید'}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>انصراف</Button>
            <Button tone="primary" onClick={() => void save()} disabled={saving}>
              ذخیره شعبه
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            {error && (
              <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[13px]">
                {error}
              </div>
            )}
            <Field label="نام شعبه" htmlFor="br-name" required>
              <input id="br-name" className={inputClass} value={editing.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="آدرس" htmlFor="br-address">
              <textarea id="br-address" rows={2} className={inputClass} value={editing.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="تلفن ثابت" htmlFor="br-landline">
                <input id="br-landline" dir="ltr" className={inputClass} value={editing.landline} onChange={(e) => set('landline', e.target.value)} />
              </Field>
              <Field label="کد پستی" htmlFor="br-postal">
                <input id="br-postal" dir="ltr" className={inputClass} value={editing.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
              </Field>
              <Field label="عرض جغرافیایی (lat)" htmlFor="br-lat">
                <input id="br-lat" dir="ltr" inputMode="decimal" className={inputClass} value={editing.lat} onChange={(e) => set('lat', e.target.value)} />
              </Field>
              <Field label="طول جغرافیایی (lng)" htmlFor="br-lng">
                <input id="br-lng" dir="ltr" inputMode="decimal" className={inputClass} value={editing.lng} onChange={(e) => set('lng', e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={useMyLocation}>
                <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
                موقعیت فعلی من
              </Button>
              {LOCATION_PRESETS.map((p) => (
                <Button
                  key={p.name}
                  size="sm"
                  tone="subtle"
                  onClick={() =>
                    setEditing((f) => (f ? { ...f, lat: String(p.lat), lng: String(p.lng), address: f.address || p.address } : f))
                  }
                >
                  {p.name}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[13px] text-stone-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[#D0192A]" checked={editing.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
              شعبه اصلی (کارت‌های جدید به‌طور پیش‌فرض در این شعبه هستند)
            </label>
          </div>
        )}
      </Modal>
    </Section>
  );
};
