import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Trash2, ChevronDown, Loader2 } from 'lucide-react';
import { Branch, EmployeeProfile, Organization } from '../types';
import { api } from '../services/api';
import { normalizeIranMobile } from '../utils/phone';
import { optimizeImage } from '../utils/imageOptimizer';
import { getBaseOrigin } from '../utils/url';
import { Button, Field, Modal, inputClass, useToast } from './ui';

/** Fields a card normally takes from the company or its branch; filled in only when this card differs. */
const OVERRIDE_FIELDS = ['landline', 'address', 'postalCode', 'website', 'instagram', 'email'] as const;
type OverrideField = (typeof OVERRIDE_FIELDS)[number];

const OVERRIDE_LABELS: Record<OverrideField, string> = {
  landline: 'تلفن ثابت',
  address: 'آدرس',
  postalCode: 'کد پستی',
  website: 'وب‌سایت',
  instagram: 'اینستاگرام',
  email: 'ایمیل',
};

interface FormState {
  name: string;
  nameEn: string;
  title: string;
  titleEn: string;
  department: string;
  mobile: string;
  whatsapp: string;
  whatsappSame: boolean;
  slug: string;
  status: 'active' | 'inactive';
  branchId: string;
  avatarUrl: string;
  overrides: Record<OverrideField, string>;
}

const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function initialState(profile: EmployeeProfile | null, branches: Branch[]): FormState {
  const overridden = new Set(profile?.overrides || []);
  const overrides = Object.fromEntries(
    OVERRIDE_FIELDS.map((f) => {
      // Email is per person, so it is always the card's own value.
      if (f === 'email') return [f, profile?.email || ''];
      return [f, overridden.has(f) ? String((profile as any)?.[f] || '') : ''];
    })
  ) as Record<OverrideField, string>;
  const defaultBranch = branches.find((b) => b.isDefault) || branches[0];
  return {
    name: profile?.name || '',
    nameEn: profile?.nameEn || '',
    title: profile?.title || '',
    titleEn: profile?.titleEn || '',
    department: profile?.department || '',
    mobile: profile?.mobile || '',
    whatsapp: profile?.whatsapp || '',
    whatsappSame: !profile || !profile.whatsapp || profile.whatsapp === profile.mobile,
    slug: profile?.slug || '',
    status: profile?.status === 'inactive' ? 'inactive' : 'active',
    branchId: profile?.branchId || defaultBranch?.id || '',
    avatarUrl: profile?.avatarUrl || '',
    overrides,
  };
}

export const ProfileFormModal: React.FC<{
  open: boolean;
  profile: EmployeeProfile | null; // null = new card
  organization: Organization | null;
  branches: Branch[];
  onClose: () => void;
  onSaved: (profile: EmployeeProfile) => void;
}> = ({ open, profile, organization, branches, onClose, onSaved }) => {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => initialState(profile, branches));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOverrides, setShowOverrides] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = initialState(profile, branches);
    setForm(next);
    setError(null);
    setSlugTouched(!!profile?.slug);
    setShowOverrides(OVERRIDE_FIELDS.some((f) => f !== 'email' && next.overrides[f]));
  }, [open, profile, branches]);

  const branch = useMemo(() => branches.find((b) => b.id === form.branchId), [branches, form.branchId]);

  /** What a blank override field falls back to. */
  const inherited: Record<OverrideField, string> = {
    landline: branch?.landline || '',
    address: branch?.address || '',
    postalCode: branch?.postalCode || '',
    website: organization?.website || '',
    instagram: organization?.instagram || '',
    email: '',
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setOverride = (key: OverrideField, value: string) =>
    setForm((f) => ({ ...f, overrides: { ...f.overrides, [key]: value } }));

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('فقط فایل تصویری (JPG، PNG یا WebP) قابل قبول است.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      // Shrink large phone photos before upload; the server re-encodes to WebP anyway.
      let body: Blob | string = file;
      if (file.size > 1.5 * 1024 * 1024) {
        body = (await optimizeImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.85, format: 'image/jpeg' })).dataUrl;
      }
      const res = await api.uploadImage(body, 'avatar', form.slug || profile?.id || 'staff');
      if (res.success && res.url) set('avatarUrl', res.url);
      else setError(res.error || 'آپلود تصویر انجام نشد.');
    } catch {
      setError('آپلود تصویر انجام نشد.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (form.name.trim().length < 2) return setError('نام کارمند را وارد کنید.');
    let mobile = form.mobile.trim();
    if (mobile) {
      const normalized = normalizeIranMobile(mobile);
      if (!normalized) return setError('شماره موبایل معتبر نیست. نمونه: 09121234567');
      mobile = normalized;
    }
    let whatsapp = form.whatsappSame ? mobile : form.whatsapp.trim();
    if (whatsapp && !form.whatsappSame) {
      whatsapp = normalizeIranMobile(whatsapp) || whatsapp;
    }
    const email = form.overrides.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('ایمیل معتبر نیست.');

    const slug = slugify(form.slug || (profile ? '' : form.nameEn));
    const base: Partial<EmployeeProfile> = profile
      ? { ...profile }
      : { id: `emp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
    // Drop read-only and inherited values; the server fills them in from the company and branch.
    for (const key of ['analytics', 'overrides', 'previousSlugs', 'createdAt', 'updatedAt', 'archivedAt'] as const) {
      delete (base as any)[key];
    }
    if (!profile?.overrides?.includes('mapLocation') || profile?.branchId !== form.branchId) delete (base as any).mapLocation;
    const next = {
      ...base,
      name: form.name.trim(),
      nameEn: form.nameEn.trim(),
      title: form.title.trim(),
      titleEn: form.titleEn.trim(),
      department: form.department.trim(),
      mobile,
      whatsapp,
      email,
      slug: slug || undefined,
      status: form.status,
      branchId: form.branchId || undefined,
      avatarUrl: form.avatarUrl || undefined,
      landline: form.overrides.landline.trim(),
      address: form.overrides.address.trim(),
      postalCode: form.overrides.postalCode.trim(),
      website: form.overrides.website.trim(),
      websiteUrl: '', // derived from the website text on the server
      instagram: form.overrides.instagram.trim(),
      instagramUrl: form.overrides.instagram.trim()
        ? `https://www.instagram.com/${form.overrides.instagram.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '')}`
        : '',
    } as EmployeeProfile;

    setSaving(true);
    try {
      const res = profile ? await api.updateProfile(next) : await api.createProfile(next);
      if (res.success && res.profile) {
        toast(profile ? 'تغییرات کارت ذخیره شد.' : 'کارت جدید ساخته شد.');
        onSaved(res.profile);
      } else {
        setError(res.error || 'ذخیره انجام نشد.');
      }
    } finally {
      setSaving(false);
    }
  };

  const origin = getBaseOrigin().replace(/^https?:\/\//, '');
  const slugPreview = slugify(form.slug || (!slugTouched ? form.nameEn : '')) || profile?.id || '…';

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={profile ? `ویرایش کارت ${profile.name}` : 'کارت جدید'}
      footer={
        <>
          <Button onClick={onClose}>انصراف</Button>
          <Button tone="primary" onClick={() => void handleSubmit()} disabled={saving || uploading}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {profile ? 'ذخیره تغییرات' : 'ساخت کارت'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && (
          <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[13px]">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full border border-stone-300 bg-white overflow-hidden flex items-center justify-center shrink-0">
            {form.avatarUrl ? (
              <img src={form.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-7 h-7 text-stone-400" aria-hidden="true" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-[13.5px] font-bold text-stone-800 cursor-pointer">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Camera className="w-4 h-4" aria-hidden="true" />}
              {form.avatarUrl ? 'تغییر عکس' : 'افزودن عکس'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleAvatar} disabled={uploading} />
            </label>
            {form.avatarUrl && (
              <Button tone="danger" onClick={() => set('avatarUrl', '')}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                حذف عکس
              </Button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="نام و نام خانوادگی" htmlFor="pf-name" required>
            <input id="pf-name" className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
          </Field>
          <Field label="نام به انگلیسی" htmlFor="pf-name-en" hint="برای فایل مخاطب و آدرس کارت استفاده می‌شود.">
            <input
              id="pf-name-en"
              dir="ltr"
              className={inputClass}
              value={form.nameEn}
              onChange={(e) => set('nameEn', e.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label="سمت" htmlFor="pf-title">
            <input id="pf-title" className={inputClass} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={80} />
          </Field>
          <Field label="سمت به انگلیسی" htmlFor="pf-title-en">
            <input id="pf-title-en" dir="ltr" className={inputClass} value={form.titleEn} onChange={(e) => set('titleEn', e.target.value)} maxLength={80} />
          </Field>
          <Field label="واحد" htmlFor="pf-dept">
            <input id="pf-dept" className={inputClass} value={form.department} onChange={(e) => set('department', e.target.value)} maxLength={60} />
          </Field>
          <Field label="ایمیل" htmlFor="pf-email">
            <input
              id="pf-email"
              type="email"
              dir="ltr"
              className={inputClass}
              value={form.overrides.email}
              onChange={(e) => setOverride('email', e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="موبایل" htmlFor="pf-mobile">
            <input
              id="pf-mobile"
              type="tel"
              dir="ltr"
              inputMode="tel"
              className={inputClass}
              value={form.mobile}
              onChange={(e) => set('mobile', e.target.value)}
              placeholder="09121234567"
              maxLength={20}
            />
          </Field>
          <Field label="واتساپ" htmlFor="pf-whatsapp">
            <label className="flex items-center gap-2 text-[12.5px] text-stone-700 mb-1.5 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[#D0192A]" checked={form.whatsappSame} onChange={(e) => set('whatsappSame', e.target.checked)} />
              همان شماره موبایل
            </label>
            {!form.whatsappSame && (
              <input
                id="pf-whatsapp"
                type="tel"
                dir="ltr"
                inputMode="tel"
                className={inputClass}
                value={form.whatsapp}
                onChange={(e) => set('whatsapp', e.target.value)}
                maxLength={20}
              />
            )}
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="شعبه" htmlFor="pf-branch" hint={branch ? `آدرس و تلفن ثابت از «${branch.name}» گرفته می‌شود.` : undefined}>
            <select id="pf-branch" className={inputClass} value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="وضعیت" htmlFor="pf-status" hint="کارت غیرفعال به مشتری نشان داده نمی‌شود و صفحه شرکت باز می‌شود.">
            <select id="pf-status" className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value as FormState['status'])}>
              <option value="active">فعال</option>
              <option value="inactive">غیرفعال (موقت)</option>
            </select>
          </Field>
          <Field
            label="آدرس کوتاه کارت"
            htmlFor="pf-slug"
            className="sm:col-span-2"
            hint={
              <>
                <span dir="ltr">
                  {origin}/{slugPreview}
                </span>
                {profile?.slug && form.slug && slugify(form.slug) !== profile.slug && (
                  <span className="block text-amber-700">آدرس قبلی هم همچنان کار می‌کند و به همین کارت می‌رسد.</span>
                )}
              </>
            }
          >
            <input
              id="pf-slug"
              dir="ltr"
              className={inputClass}
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set('slug', e.target.value);
              }}
              placeholder={slugify(form.nameEn) || 'ali-rezaei'}
              maxLength={60}
            />
          </Field>
        </div>

        <div className="border border-stone-200 rounded-2xl bg-white">
          <button
            type="button"
            onClick={() => setShowOverrides((v) => !v)}
            aria-expanded={showOverrides}
            className="w-full flex items-center justify-between gap-2 px-4 min-h-12 text-[13.5px] font-bold text-stone-800 cursor-pointer"
          >
            <span>اطلاعاتی که از شرکت و شعبه گرفته می‌شود</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showOverrides ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {showOverrides && (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-[12px] text-stone-500 leading-relaxed">
                این موارد را فقط وقتی پر کنید که این کارت با بقیه فرق دارد. خالی بماند، مقدار شرکت یا شعبه نشان داده می‌شود و با تغییر آن‌ها به‌روز می‌شود.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {OVERRIDE_FIELDS.filter((f) => f !== 'email').map((f) => (
                  <Field key={f} label={OVERRIDE_LABELS[f]} htmlFor={`pf-o-${f}`} className={f === 'address' ? 'sm:col-span-2' : ''}>
                    <input
                      id={`pf-o-${f}`}
                      dir={f === 'address' ? undefined : 'ltr'}
                      className={inputClass}
                      value={form.overrides[f]}
                      onChange={(e) => setOverride(f, e.target.value)}
                      placeholder={inherited[f] ? `از ${f === 'website' || f === 'instagram' ? 'شرکت' : 'شعبه'}: ${inherited[f]}` : ''}
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
};
