import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  UserCheck, 
  Save, 
  RotateCcw, 
  Building, 
  Phone, 
  Mail, 
  Globe, 
  MapPin, 
  Instagram, 
  Sparkles, 
  Camera, 
  Upload, 
  Trash2, 
  User, 
  Image as ImageIcon,
  Compass,
  Crosshair,
  ExternalLink,
  Check,
  AlertCircle,
  AlignRight,
  AlignLeft,
  FileText,
  FileDown,
  Link as LinkIcon
} from 'lucide-react';
import { EmployeeProfile } from '../types';
import { DEFAULT_COORDINATES, LOCATION_PRESETS, buildMapUrls, formatCoordinateDMS } from '../utils/location';
import { downloadCatalogPdf } from '../utils/catalog';
import { PdfUploader } from './PdfUploader';
import { optimizeImage } from '../utils/imageOptimizer';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: EmployeeProfile;
  onSave: (updatedProfile: EmployeeProfile) => void | boolean | undefined | Promise<boolean | void | undefined>;
  onResetToDefault: () => void;
  onDelete?: (id: string) => void;
  canDelete?: boolean;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSave,
  onResetToDefault,
  onDelete,
  canDelete = false,
}) => {
  const [formData, setFormData] = useState<EmployeeProfile>(() => ({
    ...profile,
    mapLocation: profile.mapLocation || {
      lat: DEFAULT_COORDINATES.lat,
      lng: DEFAULT_COORDINATES.lng,
      title: DEFAULT_COORDINATES.title,
      ...buildMapUrls(DEFAULT_COORDINATES.lat, DEFAULT_COORDINATES.lng),
    }
  }));

  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [geoMessage, setGeoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormData({
      ...profile,
      mapLocation: profile.mapLocation || {
        lat: DEFAULT_COORDINATES.lat,
        lng: DEFAULT_COORDINATES.lng,
        title: DEFAULT_COORDINATES.title,
        ...buildMapUrls(DEFAULT_COORDINATES.lat, DEFAULT_COORDINATES.lng),
      }
    });
    setGeoMessage(null);
  }, [profile, isOpen]);

  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const currentLat = formData.mapLocation?.lat ?? DEFAULT_COORDINATES.lat;
  const currentLng = formData.mapLocation?.lng ?? DEFAULT_COORDINATES.lng;

  const handleCoordinatesChange = (lat: number, lng: number) => {
    const urls = buildMapUrls(lat, lng);
    setFormData((prev) => ({
      ...prev,
      mapLocation: {
        lat,
        lng,
        title: prev.mapLocation?.title || DEFAULT_COORDINATES.title,
        ...urls,
      },
    }));
  };

  const handleGetGpsLocation = () => {
    if (!navigator.geolocation) {
      setGeoMessage({
        type: 'error',
        text: 'مرورگر شما از قابلیت موقعیت‌یابی GPS پشتیبانی نمی‌کند.',
      });
      return;
    }

    setIsLocating(true);
    setGeoMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(7));
        const lng = Number(pos.coords.longitude.toFixed(7));
        handleCoordinatesChange(lat, lng);
        setIsLocating(false);
        setGeoMessage({
          type: 'success',
          text: `موقعیت مکانی شما با GPS ثبت شد (${lat}, ${lng})`,
        });
      },
      (err) => {
        setIsLocating(false);
        let msg = 'امکان دریافت موقعیت وجود ندارد.';
        if (err.code === 1) msg = 'اجازه دسترسی به موقعیت مکانی (GPS) داده نشد.';
        else if (err.code === 2) msg = 'موقعیت مکانی در دسترس نیست.';
        else if (err.code === 3) msg = 'مهلت اتصال به GPS به پایان رسید.';
        setGeoMessage({ type: 'error', text: msg });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleResetToRoyaLocation = () => {
    handleCoordinatesChange(DEFAULT_COORDINATES.lat, DEFAULT_COORDINATES.lng);
    setFormData((prev) => ({
      ...prev,
      address: DEFAULT_COORDINATES.address,
      mapLocation: {
        lat: DEFAULT_COORDINATES.lat,
        lng: DEFAULT_COORDINATES.lng,
        title: DEFAULT_COORDINATES.title,
        ...buildMapUrls(DEFAULT_COORDINATES.lat, DEFAULT_COORDINATES.lng),
      }
    }));
    setGeoMessage({
      type: 'success',
      text: 'مختصات به لوکیشن پیش‌فرض دفتر مرکزی رویا (35.7757770, 51.4368051) بازنشانی شد.',
    });
  };

  const handleSelectPreset = (preset: typeof LOCATION_PRESETS[0]) => {
    handleCoordinatesChange(preset.lat, preset.lng);
    setFormData((prev) => ({
      ...prev,
      address: preset.address,
      mapLocation: {
        lat: preset.lat,
        lng: preset.lng,
        title: preset.name,
        ...buildMapUrls(preset.lat, preset.lng),
      }
    }));
    setGeoMessage({
      type: 'success',
      text: `موقعیت «${preset.name}» اعمال شد.`,
    });
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        return;
      }
      try {
        const optimized = await optimizeImage(file, {
          maxWidth: 400,
          maxHeight: 400,
          quality: 0.82,
          format: 'image/webp',
        });
        setFormData((prev) => ({ ...prev, avatarUrl: optimized.dataUrl }));
      } catch {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (result) {
            setFormData((prev) => ({ ...prev, avatarUrl: result }));
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        return;
      }
      try {
        const optimized = await optimizeImage(file, {
          maxWidth: 800,
          maxHeight: 400,
          quality: 0.85,
          format: 'image/webp',
        });
        setFormData((prev) => ({ ...prev, logoUrl: optimized.dataUrl }));
      } catch {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (result) {
            setFormData((prev) => ({ ...prev, logoUrl: result }));
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleChange = (field: keyof EmployeeProfile, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Keep the form open (with the admin's edits) when the server rejects the save.
      const result = await onSave(formData);
      if (result !== false) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 text-slate-100 w-full max-w-xl rounded-3xl shadow-2xl relative border border-slate-800 max-h-[90vh] overflow-y-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">ویرایش مشخصات و لوگوی کارت ویزیت</h3>
              <p className="text-xs text-slate-400">تغییر لوگوی تصویری، عکس پرسنلی و اطلاعات تماس</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs text-slate-300">
          
          {/* Visual Logo Upload Field */}
          <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-red-500/30 flex items-center gap-4">
            <input 
              ref={logoFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoFile}
            />
            <div className="w-20 h-14 rounded-xl border border-slate-700 bg-white p-1.5 overflow-hidden shrink-0 flex items-center justify-center shadow-xs">
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="لوگوی دلخواه" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] font-bold text-[#D0192A]">ROYA</span>
                  <span className="text-[7px] text-stone-500">Surface Center</span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                <p className="font-bold text-white text-xs">لوگوی تصویری شرکت / برند (بالای کارت)</p>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {formData.logoUrl ? 'لوگوی اختصاصی بارگذاری شده است.' : 'در حال حاضر لوگوی پیش‌فرض شرکت رویا طرح داخلی فعال است.'}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => logoFileInputRef.current?.click()}
                  className="py-1 px-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>{formData.logoUrl ? 'تغییر لوگو' : 'آپلود لوگوی دلخواه'}</span>
                </button>
                {formData.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, logoUrl: undefined }))}
                    className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded-lg text-[11px] transition-colors cursor-pointer"
                  >
                    بازگشت به لوگوی اصلی رویا
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Avatar Upload Field in Modal */}
          <div className="p-3.5 bg-slate-800/60 rounded-2xl border border-slate-700/80 flex items-center gap-4">
            <input 
              ref={avatarFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFile}
            />
            <div className="w-16 h-16 rounded-2xl border-2 border-amber-500/40 bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center">
              {formData.avatarUrl ? (
                <img src={formData.avatarUrl} alt={formData.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-slate-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-xs">تصویر پرسنلی کارشناس</p>
              <p className="text-[11px] text-slate-400 mt-0.5">این تصویر در دایره پروفایل کارت ویزیت نمایش داده می‌شود.</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  className="py-1 px-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>{formData.avatarUrl ? 'تغییر عکس' : 'آپلود عکس پرسنلی'}</span>
                </button>
                {formData.avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, avatarUrl: undefined }))}
                    className="py-1 px-2 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-lg text-[11px] transition-colors"
                  >
                    حذف عکس
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Layout Direction Selection (RTL vs LTR) */}
          <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <AlignRight className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-white text-xs">جهت و چیدمان محتوای صفحه کارت (راست‌چین / چپ‌چین):</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                در حالت چپ‌چین (LTR)، علامت فلش در سمت راست باکس‌ها و نوشته‌ها/آیکون‌ها در سمت چپ قرار می‌گیرند.
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => handleChange('layoutDirection', 'rtl')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  (formData.layoutDirection || 'rtl') === 'rtl'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <AlignRight className="w-3.5 h-3.5" />
                <span>راست‌چین (RTL)</span>
              </button>
              <button
                type="button"
                onClick={() => handleChange('layoutDirection', 'ltr')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  formData.layoutDirection === 'ltr'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <AlignLeft className="w-3.5 h-3.5" />
                <span>چپ‌چین (LTR)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">نام و نام خانوادگی:</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white transition-colors"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-300">عنوان سمت / شغل:</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">نام انگلیسی (Full Name En):</label>
              <input
                type="text"
                dir="ltr"
                value={formData.nameEn || ''}
                placeholder="e.g. Alireza Jafari"
                onChange={(e) => {
                  const val = e.target.value;
                  handleChange('nameEn', val);
                  if (!formData.slug) {
                    const autoSlug = val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                    handleChange('slug', autoSlug);
                  }
                }}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white transition-colors font-mono text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-300 flex items-center justify-between">
                <span>شناسه کوتاه / نام در آدرس (Short Slug):</span>
                <span className="text-[10px] text-amber-400 font-normal">برای QR و NFC تمیز</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  dir="ltr"
                  value={formData.slug || ''}
                  placeholder="e.g. jafari"
                  onChange={(e) => handleChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                  className="w-full pl-3 pr-8 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-amber-300 transition-colors font-mono text-xs"
                />
                <LinkIcon className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-mono" dir="ltr">
                {typeof window !== 'undefined' ? window.location.origin : 'https://card.royaco.com'}/{formData.slug || formData.id}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">شماره موبایل / تماس مستقیم:</label>
              <div className="relative">
                <input
                  type="text"
                  dir="ltr"
                  value={formData.mobile}
                  onChange={(e) => handleChange('mobile', e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white transition-colors font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-300">شماره واتساپ:</label>
              <input
                type="text"
                dir="ltr"
                value={formData.whatsapp}
                onChange={(e) => handleChange('whatsapp', e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white transition-colors font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">تلفن ثابت دفتر مرکزی رویا:</label>
              <input
                type="text"
                dir="ltr"
                value={formData.landline}
                onChange={(e) => handleChange('landline', e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-300">شناسه اینستاگرام:</label>
              <input
                type="text"
                dir="ltr"
                value={formData.instagram}
                onChange={(e) => handleChange('instagram', e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white transition-colors font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">آدرس وب‌سایت:</label>
              <input
                type="text"
                dir="ltr"
                value={formData.website}
                onChange={(e) => handleChange('website', e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-300">پست الکترونیک (ایمیل):</label>
              <input
                type="email"
                dir="ltr"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white transition-colors font-mono"
              />
            </div>
          </div>

          {/* Catalog & PDF Settings */}
          <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-400" />
                <span className="font-bold text-white text-xs">تنظیمات کاتالوگ محصولات و فایل PDF:</span>
              </div>
              <button
                type="button"
                onClick={() => downloadCatalogPdf(formData)}
                className="py-1 px-2.5 bg-slate-700 hover:bg-slate-600 text-amber-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="تست دانلود فایل PDF کاتالوگ"
              >
                <FileDown className="w-3.5 h-3.5 text-amber-400" />
                <span>تست دانلود PDF</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1 text-[11px] text-slate-400">متن نمایشی کاتالوگ در کارت:</label>
                <input
                  type="text"
                  value={formData.catalogUrl || ''}
                  placeholder="مثال: کاتالوگ جامع محصولات رویا"
                  onChange={(e) => handleChange('catalogUrl', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white text-xs"
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-[11px] text-slate-400">لینک یا مسیر فایل PDF کاتالوگ:</label>
                <input
                  type="text"
                  dir="ltr"
                  value={formData.catalogPdfUrl || ''}
                  placeholder="/roya-catalog.pdf یا فایل آپلود شده"
                  onChange={(e) => handleChange('catalogPdfUrl', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white text-xs font-mono"
                />
              </div>
            </div>

            {/* Direct PDF Upload component */}
            <div className="pt-1">
              <PdfUploader
                currentPdfUrl={formData.catalogPdfUrl || '/roya-catalog.pdf'}
                onPdfUploaded={(uploadedUrl) => {
                  handleChange('catalogPdfUrl', uploadedUrl);
                }}
                label="آپلود مستقیم فایل PDF جدید برای این کارت"
                description="فایل کاتالوگ PDF اختصاصی را آپلود کنید تا بلافاصله لینک کارت به‌روزرسانی شود."
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-slate-300">آدرس پستی شعبه / شوروم:</label>
            <textarea
              rows={2}
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white transition-colors leading-relaxed"
            />
          </div>

          {/* Location & GPS Coordinates Customization Card */}
          <div className="p-4 bg-slate-800/90 rounded-2xl border border-amber-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-white text-xs">تنظیمات موقعیت جغرافیایی و نقشه (مسیریابی)</span>
              </div>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20" dir="ltr">
                {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              مختصات ثبت شده برای مسیریابی مشتریان در اپلیکیشن‌های نشان، بلد، گوگل مپ و ویز استفاده می‌شود.
            </p>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleGetGpsLocation}
                disabled={isLocating}
                className="py-2 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-[11px] disabled:opacity-50"
              >
                <Crosshair className={`w-3.5 h-3.5 text-amber-400 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? 'در حال دریافت GPS...' : 'دریافت لوکیشن فعلی با GPS'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetToRoyaLocation}
                className="py-2 px-3 bg-slate-900 hover:bg-slate-950 border border-slate-700 text-slate-300 hover:text-white rounded-xl font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-[11px]"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>لوکیشن پیش‌فرض دفتر مرکزی رویا</span>
              </button>
            </div>

            {/* Geo Feedback */}
            {geoMessage && (
              <div className={`p-2.5 rounded-xl border flex items-center gap-2 text-[11px] animate-in fade-in ${
                geoMessage.type === 'success' 
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300' 
                  : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
              }`}>
                {geoMessage.type === 'success' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
                <span>{geoMessage.text}</span>
              </div>
            )}

            {/* Presets */}
            <div className="space-y-1">
              <span className="text-[10.5px] font-medium text-slate-400 block">انتخاب سریع از شعب و مراکز رویا:</span>
              <div className="grid grid-cols-1 gap-1">
                {LOCATION_PRESETS.map((preset) => {
                  const isMatch = Math.abs(currentLat - preset.lat) < 0.0001 && Math.abs(currentLng - preset.lng) < 0.0001;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`text-right p-2 rounded-xl border text-[11px] flex items-center justify-between transition-all ${
                        isMatch 
                          ? 'bg-amber-500/15 border-amber-500/40 text-white' 
                          : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <span className="font-medium truncate">{preset.name}</span>
                      <span className="text-[10px] font-mono text-slate-400 dir-ltr shrink-0 mr-2">
                        {preset.lat.toFixed(4)}, {preset.lng.toFixed(4)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Manual Lat / Lng Inputs */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-[10.5px] font-medium text-slate-400 mb-1">
                  عرض جغرافیایی (Lat):
                </label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={currentLat}
                  onChange={(e) => handleCoordinatesChange(parseFloat(e.target.value) || 0, currentLng)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-medium text-slate-400 mb-1">
                  طول جغرافیایی (Lng):
                </label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={currentLng}
                  onChange={(e) => handleCoordinatesChange(currentLat, parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResetToDefault}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl font-medium flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>بازنشانی پیش‌فرض</span>
              </button>

              {canDelete && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`آیا از حذف پروفایل "${profile.name}" از پایگاه داده اطمینان دارید؟`)) {
                      onDelete(profile.id);
                      onClose();
                    }
                  }}
                  className="py-2.5 px-3 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300 border border-rose-800/40 rounded-xl font-medium flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف کارمند</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 text-slate-400 hover:text-slate-200 font-medium text-xs"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="py-2.5 px-5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 rounded-xl font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/10 transition-colors cursor-pointer text-xs"
              >
                <Save className="w-4 h-4 text-slate-950" />
                <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
