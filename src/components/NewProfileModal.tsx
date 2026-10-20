import React, { useState, useRef } from 'react';
import { 
  X, 
  UserPlus, 
  Save, 
  Building, 
  Phone, 
  Mail, 
  Globe, 
  MapPin, 
  Instagram, 
  Upload, 
  User, 
  Image as ImageIcon,
  Compass,
  Crosshair,
  RotateCcw,
  AlignRight,
  AlignLeft,
  FileText,
  Link as LinkIcon
} from 'lucide-react';
import { EmployeeProfile } from '../types';
import { DEFAULT_COORDINATES, buildMapUrls } from '../utils/location';
import { PdfUploader } from './PdfUploader';
import { optimizeImage } from '../utils/imageOptimizer';

interface NewProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProfile?: (newProfile: EmployeeProfile) => void;
  onSave?: (newProfile: EmployeeProfile) => void;
}

export const NewProfileModal: React.FC<NewProfileModalProps> = ({
  isOpen,
  onClose,
  onAddProfile,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [mobile, setMobile] = useState('0912');
  const [whatsapp, setWhatsapp] = useState('0912');
  const [landline, setLandline] = useState('021 2599 1425');
  const [instagram, setInstagram] = useState('royaco');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('www.royaco.com');
  const [catalogUrl, setCatalogUrl] = useState('کاتالوگ جامع محصولات رویا');
  const [catalogPdfUrl, setCatalogPdfUrl] = useState('/roya-catalog.pdf');
  const [layoutDirection, setLayoutDirection] = useState<'rtl' | 'ltr'>('rtl');
  const [address, setAddress] = useState(DEFAULT_COORDINATES.address);
  const [department, setDepartment] = useState('فروش');
  const [lat, setLat] = useState<number>(DEFAULT_COORDINATES.lat);
  const [lng, setLng] = useState<number>(DEFAULT_COORDINATES.lng);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleGetGps = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(7)));
        setLng(Number(pos.coords.longitude.toFixed(7)));
        setIsLocating(false);
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
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
        setAvatarUrl(optimized.dataUrl);
      } catch {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (result) {
            setAvatarUrl(result);
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
        setLogoUrl(optimized.dataUrl);
      } catch {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (result) {
            setLogoUrl(result);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = 'emp-' + Date.now();
    const cleanSlug = slug.trim() || (nameEn ? nameEn.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') : id);
    const mapUrls = buildMapUrls(lat, lng);
    const newProfile: EmployeeProfile = {
      id,
      slug: cleanSlug,
      name: name || 'کارمند جدید رویا',
      nameEn: nameEn || 'Sales Representative',
      title: title || 'کارشناس فروش',
      titleEn: 'Sales Specialist',
      company: 'شرکت رویا طرح داخلی',
      companyEn: 'ROYA Surface Center',
      slogan: 'Dream | Design | Deliver',
      avatarUrl: avatarUrl,
      logoUrl: logoUrl,
      mobile: mobile || '09120000000',
      whatsapp: whatsapp || mobile || '09120000000',
      landline: landline || '021 2599 1425',
      instagram: instagram || 'royaco',
      instagramUrl: `https://instagram.com/${(instagram || 'royaco').replace('@', '')}`,
      website: website || 'www.royaco.com',
      websiteUrl: 'https://www.royaco.com',
      catalogUrl: catalogUrl || 'کاتالوگ جامع محصولات رویا',
      catalogPdfUrl: catalogPdfUrl || '/roya-catalog.pdf',
      layoutDirection: layoutDirection,
      email: email || `${id}@royaco.com`,
      address: address || DEFAULT_COORDINATES.address,
      department: department,
      avatarGender: 'male',
      bio: 'کارشناس و مشاور فروش در شرکت رویا طرح داخلی',
      mapLocation: {
        lat,
        lng,
        title: DEFAULT_COORDINATES.title,
        ...mapUrls,
      },
    };

    const saveHandler = onAddProfile || onSave;
    if (typeof saveHandler === 'function') {
      saveHandler(newProfile);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 text-slate-100 w-full max-w-lg rounded-3xl shadow-2xl relative border border-slate-800 max-h-[90vh] overflow-y-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">صدور کارت ویزیت هوشمند کارمند جدید</h3>
              <p className="text-xs text-slate-400">برای کارشناسان و مشاوران فروش رویا طرح داخلی</p>
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
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs text-slate-300">
          
          {/* Logo and Avatar Upload Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Logo Upload Dropzone */}
            <div className="p-3 bg-slate-800/60 rounded-2xl border border-slate-700/80 flex items-center gap-3">
              <input 
                ref={logoFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoFile}
              />
              <div className="w-12 h-12 rounded-xl border border-slate-600 bg-white p-1 overflow-hidden shrink-0 flex items-center justify-center">
                {logoUrl ? (
                  <img src={logoUrl} alt="لوگو" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[8px] font-bold text-[#D0192A]">ROYA</span>
                )}
              </div>
              <div className="flex-1">
                <span className="font-bold text-white text-xs block">لوگوی بالای کارت</span>
                <button
                  type="button"
                  onClick={() => logoFileInputRef.current?.click()}
                  className="mt-1 py-1 px-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-[10.5px] flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>{logoUrl ? 'تغییر لوگو' : 'آپلود لوگو'}</span>
                </button>
              </div>
            </div>

            {/* Avatar Upload Dropzone */}
            <div className="p-3 bg-slate-800/60 rounded-2xl border border-slate-700/80 flex items-center gap-3">
              <input 
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFile}
              />
              <div className="w-12 h-12 rounded-xl border border-amber-500/30 bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="پیش‌نمایش" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-slate-500" />
                )}
              </div>
              <div className="flex-1">
                <span className="font-bold text-white text-xs block">تصویر پرسنلی</span>
                <button
                  type="button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  className="mt-1 py-1 px-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold text-[10.5px] flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>{avatarUrl ? 'تغییر عکس' : 'آپلود عکس'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Layout Direction */}
          <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700/80 flex items-center justify-between gap-2">
            <div>
              <span className="font-bold text-white text-xs block">جهت چیدمان محتوای کارت:</span>
              <span className="text-[10.5px] text-slate-400">راست‌چین (پیش‌فرض) یا چپ‌چین</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setLayoutDirection('rtl')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                  layoutDirection === 'rtl' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                <AlignRight className="w-3 h-3" />
                <span>راست‌چین</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutDirection('ltr')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                  layoutDirection === 'ltr' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                <AlignLeft className="w-3 h-3" />
                <span>چپ‌چین</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">نام و نام خانوادگی:</label>
              <input
                type="text"
                placeholder="مثال: مریم کاظمی"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-300">عنوان سمت شغلی:</label>
              <input
                type="text"
                placeholder="مثال: کارشناس فروش موکت‌های هتلی"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">نام انگلیسی (Full Name En):</label>
              <input
                type="text"
                dir="ltr"
                placeholder="e.g. Maryam Kazemi"
                value={nameEn}
                onChange={(e) => {
                  const val = e.target.value;
                  setNameEn(val);
                  if (!slug) {
                    const autoSlug = val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                    setSlug(autoSlug);
                  }
                }}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-300 flex items-center justify-between">
                <span>شناسه کوتاه در آدرس (Short Slug):</span>
                <span className="text-[10px] text-amber-400 font-normal">برای لینک و NFC</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  dir="ltr"
                  placeholder="e.g. kazemi"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                  className="w-full pl-3 pr-8 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-amber-300 font-mono text-xs"
                />
                <LinkIcon className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-mono" dir="ltr">
                {typeof window !== 'undefined' ? window.location.origin : 'https://card.royaco.com'}/{slug || 'name'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">شماره همراه:</label>
              <input
                type="text"
                dir="ltr"
                placeholder="0912..."
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-300">شماره واتساپ:</label>
              <input
                type="text"
                dir="ltr"
                placeholder="0912..."
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">آدرس وب‌سایت:</label>
              <input
                type="text"
                dir="ltr"
                placeholder="www.royaco.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-300">پست الکترونیک (ایمیل):</label>
              <input
                type="email"
                dir="ltr"
                placeholder="name@royaco.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">نام نمایشی کاتالوگ در کارت:</label>
              <input
                type="text"
                placeholder="کاتالوگ جامع محصولات رویا"
                value={catalogUrl}
                onChange={(e) => setCatalogUrl(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-300">لینک یا مسیر فایل PDF کاتالوگ:</label>
              <input
                type="text"
                dir="ltr"
                placeholder="/roya-catalog.pdf"
                value={catalogPdfUrl}
                onChange={(e) => setCatalogPdfUrl(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white font-mono"
              />
            </div>
          </div>

          {/* PDF Uploader inside New Profile Modal */}
          <div className="pt-1">
            <PdfUploader
              currentPdfUrl={catalogPdfUrl}
              onPdfUploaded={(uploadedUrl) => setCatalogPdfUrl(uploadedUrl)}
              label="آپلود فایل PDF کاتالوگ برای کارمند جدید"
              description="فایل کاتالوگ مورد نظر را آپلود نمایید تا به این کارمند تخصیص داده شود."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1 text-slate-300">تلفن ثابت رویا:</label>
              <input
                type="text"
                dir="ltr"
                value={landline}
                onChange={(e) => setLandline(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-300">شناسه اینستاگرام:</label>
              <input
                type="text"
                dir="ltr"
                placeholder="royaco"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-slate-300">آدرس دفتر / شوروم:</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white"
            />
          </div>

          {/* Location / GPS Coordinates in New Profile Form */}
          <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                موقعیت جغرافیایی جهت مسیریابی مشتریان
              </span>
              <button
                type="button"
                onClick={handleGetGps}
                disabled={isLocating}
                className="text-[10.5px] text-amber-300 hover:text-amber-200 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Crosshair className={`w-3 h-3 text-amber-400 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? 'دریافت GPS...' : 'دریافت GPS'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">عرض (Latitude):</label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value) || DEFAULT_COORDINATES.lat)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">طول (Longitude):</label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={lng}
                  onChange={(e) => setLng(parseFloat(e.target.value) || DEFAULT_COORDINATES.lng)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400">
              پیش‌فرض: مختصات دفتر مرکزی رویا (35.7757770, 51.4368051)
            </p>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 text-slate-400 hover:text-slate-200 font-medium"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="py-2.5 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/10 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4 text-slate-950" />
              <span>ایجاد کارت ویزیت هوشمند</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
