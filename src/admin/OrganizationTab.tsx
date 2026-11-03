import React, { useEffect, useState } from 'react';
import { Loader2, Upload, RotateCcw, ImagePlus, X } from 'lucide-react';
import { optimizeImage } from '../utils/imageOptimizer';
import { EmployeeProfile, Organization } from '../types';
import { api } from '../services/api';
import { RoyaLogo } from '../components/RoyaLogo';
import { PdfUploader } from '../components/PdfUploader';
import { Button, Field, Section, inputClass, useToast } from './ui';

const EMPTY: Organization = {
  company: '',
  companyEn: '',
  slogan: '',
  logoUrl: '',
  website: '',
  websiteUrl: '',
  instagram: '',
  instagramUrl: '',
  catalogUrl: '',
  catalogPdfUrl: '',
  layoutDirection: 'rtl',
  gallery: [],
};

const MAX_GALLERY = 12;

export const OrganizationTab: React.FC<{
  organization: Organization | null;
  profiles: EmployeeProfile[];
  onSaved: (org: Organization, profiles?: EmployeeProfile[]) => void;
}> = ({ organization, profiles, onSaved }) => {
  const toast = useToast();
  const [form, setForm] = useState<Organization>(organization || EMPTY);
  const [clearOverrides, setClearOverrides] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  useEffect(() => {
    if (organization) setForm({ ...EMPTY, ...organization });
  }, [organization]);

  const set = <K extends keyof Organization>(key: K, value: Organization[K]) => setForm((f) => ({ ...f, [key]: value }));

  const overriddenCount = profiles.filter((p) =>
    (p.overrides || []).some((f) => ['company', 'website', 'instagram', 'logoUrl', 'catalogUrl', 'catalogPdfUrl', 'slogan'].includes(f))
  ).length;

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    const res = await api.uploadImage(file, 'logo', 'company');
    setUploadingLogo(false);
    if (res.success && res.url) set('logoUrl', res.url);
    else toast(res.error || 'آپلود لوگو انجام نشد.', 'error');
  };

  const addGalleryPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from<File>(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    const room = MAX_GALLERY - (form.gallery?.length || 0);
    if (!files.length) return;
    if (room <= 0) return toast(`حداکثر ${MAX_GALLERY} عکس.`, 'error');
    setUploadingGallery(true);
    const added: string[] = [];
    for (const file of files.slice(0, room)) {
      try {
        // Phone photos are large; 1600px is plenty for the card and keeps uploads fast.
        const body = file.size > 1.5 * 1024 * 1024 ? (await optimizeImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.85, format: 'image/jpeg' })).dataUrl : file;
        const res = await api.uploadImage(body, 'gallery', 'gallery');
        if (res.success && res.url) added.push(res.url);
        else toast(res.error || 'آپلود یکی از عکس‌ها انجام نشد.', 'error');
      } catch {
        toast('یکی از عکس‌ها باز نشد.', 'error');
      }
    }
    setUploadingGallery(false);
    if (added.length) {
      setForm((f) => ({ ...f, gallery: [...(f.gallery || []), ...added] }));
      toast('عکس‌ها اضافه شد. برای نمایش روی کارت‌ها «ذخیره» را بزنید.');
    }
  };

  const save = async () => {
    setSaving(true);
    const website = form.website.trim();
    const instagram = form.instagram.trim().replace(/^@/, '');
    const res = await api.updateOrganization(
      {
        ...form,
        website,
        websiteUrl: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : '',
        instagram,
        instagramUrl: instagram ? `https://www.instagram.com/${instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '')}` : '',
      },
      clearOverrides
    );
    setSaving(false);
    if (res.success && res.organization) {
      toast(res.message || 'اطلاعات شرکت ذخیره شد و روی همه کارت‌ها اعمال شد.');
      setClearOverrides(false);
      onSaved(res.organization, res.profiles);
    } else toast(res.error || 'ذخیره انجام نشد.', 'error');
  };

  return (
    <Section
      title="اطلاعات شرکت"
      description="این اطلاعات یک بار اینجا ثبت می‌شود و روی همه کارت‌ها نشان داده می‌شود. با تغییر آن، همه کارت‌ها همان لحظه به‌روز می‌شوند."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-[180px] bg-white border border-stone-200 rounded-xl p-2">
            <RoyaLogo size="sm" logoUrl={form.logoUrl || undefined} />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-[13.5px] font-bold text-stone-800 cursor-pointer">
              {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Upload className="w-4 h-4" aria-hidden="true" />}
              آپلود لوگو
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadLogo} />
            </label>
            {form.logoUrl && (
              <Button onClick={() => set('logoUrl', '')}>
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                لوگوی پیش‌فرض رویا
              </Button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="نام شرکت" htmlFor="org-company">
            <input id="org-company" className={inputClass} value={form.company} onChange={(e) => set('company', e.target.value)} />
          </Field>
          <Field label="نام شرکت به انگلیسی" htmlFor="org-company-en">
            <input id="org-company-en" dir="ltr" className={inputClass} value={form.companyEn} onChange={(e) => set('companyEn', e.target.value)} />
          </Field>
          <Field label="وب‌سایت" htmlFor="org-website">
            <input id="org-website" dir="ltr" className={inputClass} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="www.royaco.com" />
          </Field>
          <Field label="اینستاگرام" htmlFor="org-instagram">
            <input id="org-instagram" dir="ltr" className={inputClass} value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="royaco" />
          </Field>
          <Field label="شعار" htmlFor="org-slogan">
            <input id="org-slogan" className={inputClass} value={form.slogan} onChange={(e) => set('slogan', e.target.value)} />
          </Field>
          <Field label="جهت کارت" htmlFor="org-dir">
            <select id="org-dir" className={inputClass} value={form.layoutDirection} onChange={(e) => set('layoutDirection', e.target.value as 'rtl' | 'ltr')}>
              <option value="rtl">راست به چپ (فارسی)</option>
              <option value="ltr">چپ به راست</option>
            </select>
          </Field>
          <Field label="عنوان یا لینک کاتالوگ" htmlFor="org-catalog" hint="اگر فایل PDF زیر آپلود شده باشد، دکمه کاتالوگ همان فایل را دانلود می‌کند. این لینک فقط وقتی باز می‌شود که PDF نباشد." className="sm:col-span-2">
            <input id="org-catalog" className={inputClass} value={form.catalogUrl || ''} onChange={(e) => set('catalogUrl', e.target.value)} />
          </Field>
        </div>

        <div>
          <h3 className="text-[13px] font-bold text-stone-800">نمونه‌کارها</h3>
          <p className="text-[12px] text-stone-500 mt-0.5 mb-2 leading-relaxed">
            عکس پروژه‌های انجام‌شده (حداکثر {MAX_GALLERY} عکس). پایین همه کارت‌ها به صورت یک ردیف قابل ورق زدن نشان داده می‌شود.
          </p>
          <ul className="flex flex-wrap gap-2">
            {(form.gallery || []).map((url) => (
              <li key={url} className="relative w-24 h-24 rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                <button
                  type="button"
                  onClick={() => set('gallery', (form.gallery || []).filter((u) => u !== url))}
                  aria-label="حذف این عکس"
                  className="absolute top-1 end-1 w-7 h-7 rounded-full bg-stone-900/70 hover:bg-stone-900 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            ))}
            {(form.gallery?.length || 0) < MAX_GALLERY && (
              <li>
                <label className="w-24 h-24 rounded-xl border-2 border-dashed border-stone-300 hover:border-[#D0192A] text-stone-500 hover:text-[#D0192A] flex flex-col items-center justify-center gap-1 text-xs font-bold cursor-pointer focus-within:outline-2 focus-within:outline-[#D0192A]">
                  {uploadingGallery ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <ImagePlus className="w-5 h-5" aria-hidden="true" />}
                  افزودن عکس
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void addGalleryPhotos(e)} disabled={uploadingGallery} />
                </label>
              </li>
            )}
          </ul>
        </div>

        <PdfUploader
          compact
          allowSetAsDefault
          currentPdfUrl={form.catalogPdfUrl || '/roya-catalog.pdf'}
          onPdfUploaded={(url) => {
            set('catalogPdfUrl', url);
            toast('فایل کاتالوگ آپلود شد. برای اعمال روی کارت‌ها «ذخیره» را بزنید.');
          }}
        />

        {overriddenCount > 0 && (
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900 cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#D0192A]" checked={clearOverrides} onChange={(e) => setClearOverrides(e.target.checked)} />
            <span>
              {overriddenCount} کارت برای این موارد مقدار اختصاصی دارد و با این تغییر عوض نمی‌شود. اگر می‌خواهید همه کارت‌ها دقیقاً اطلاعات شرکت را نشان دهند، این
              گزینه را بزنید.
            </span>
          </label>
        )}

        <div className="flex justify-end">
          <Button tone="primary" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            ذخیره اطلاعات شرکت
          </Button>
        </div>
      </div>
    </Section>
  );
};
