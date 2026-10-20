import React, { useRef, useState } from 'react';
import { Camera, Upload, Trash2, CheckCircle2, User, Image as ImageIcon, Sparkles, Building2, RotateCcw, FileText, FileDown, Loader2 } from 'lucide-react';
import { EmployeeProfile } from '../types';
import { api } from '../services/api';
import { downloadCatalogPdf } from '../utils/catalog';
import { optimizeImage } from '../utils/imageOptimizer';

interface ProfilePhotoUploaderProps {
  profile: EmployeeProfile;
  onUpdateAvatar: (avatarDataUrl: string) => void;
  onRemoveAvatar: () => void;
  onUpdateLogo?: (logoDataUrl: string | undefined) => void;
  onUpdateCatalogPdf?: (catalogPdfUrl: string) => void;
  onOpenEditModal: () => void;
}

export const ProfilePhotoUploader: React.FC<ProfilePhotoUploaderProps> = ({
  profile,
  onUpdateAvatar,
  onRemoveAvatar,
  onUpdateLogo,
  onUpdateCatalogPdf,
  onOpenEditModal,
}) => {
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  
  const [activeTab, setActiveTab] = useState<'logo' | 'avatar' | 'catalog'>('logo');
  const [isDragging, setIsDragging] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isPdfUploading, setIsPdfUploading] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const processFile = async (file: File, type: 'logo' | 'avatar') => {
    setErrorNotice(null);
    if (!file.type.startsWith('image/')) {
      setErrorNotice('لطفاً یک فایل تصویری معتبر (JPG، PNG، WEBP، SVG) انتخاب فرمایید.');
      return;
    }

    setIsOptimizing(true);
    try {
      // High-performance mobile optimization to WebP (400x400 max for avatar, 800x400 for logo)
      const optimized = await optimizeImage(file, {
        maxWidth: type === 'avatar' ? 400 : 800,
        maxHeight: type === 'avatar' ? 400 : 400,
        quality: 0.82,
        format: 'image/webp',
      });
      setIsOptimizing(false);

      if (type === 'logo' && onUpdateLogo) {
        onUpdateLogo(optimized.dataUrl);
        setSuccessNotice(`لوگوی با کیفیت WebP (${Math.round(optimized.sizeBytes / 1024)} KB) ذخیره شد`);
      } else {
        onUpdateAvatar(optimized.dataUrl);
        setSuccessNotice(`تصویر پرسنلی فشرده WebP (${Math.round(optimized.sizeBytes / 1024)} KB) ذخیره شد`);
      }
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch {
      setIsOptimizing(false);
      // Fallback to standard reader
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          if (type === 'logo' && onUpdateLogo) {
            onUpdateLogo(result);
          } else {
            onUpdateAvatar(result);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const processPdfFile = async (file: File) => {
    setErrorNotice(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorNotice('لطفاً یک فایل PDF معتبر انتخاب فرمایید.');
      return;
    }

    setIsPdfUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        if (base64Data) {
          const res = await api.uploadPdf(base64Data, file.name, false);
          setIsPdfUploading(false);
          if (res.success && res.url) {
            if (onUpdateCatalogPdf) {
              onUpdateCatalogPdf(res.url);
            }
            setSuccessNotice(`فایل PDF کاتالوگ (${file.name}) آپلود شد`);
            setTimeout(() => setSuccessNotice(null), 3000);
          } else {
            setErrorNotice('خطا در بارگذاری PDF: ' + (res.error || 'خطای ناشناخته'));
          }
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsPdfUploading(false);
      setErrorNotice('خطا در خواندن فایل PDF');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (activeTab === 'catalog') {
        processPdfFile(file);
      } else {
        processFile(file, activeTab);
      }
    }
  };

  return (
    <div className="w-full bg-slate-950/70 rounded-2xl p-3.5 border border-slate-800 mb-4 transition-all">
      {/* Selector Tabs: لوگوی بالای کارت / عکس پرسنلی / فایل PDF کاتالوگ */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-xl mb-3 border border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('logo')}
          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'logo'
              ? 'bg-red-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-3 h-3" />
          <span>لوگو</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('avatar')}
          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'avatar'
              ? 'bg-amber-500 text-slate-950 shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <User className="w-3 h-3" />
          <span>عکس</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'catalog'
              ? 'bg-slate-700 text-amber-300 shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3 h-3 text-amber-400" />
          <span>کاتالوگ</span>
        </button>
      </div>

      {activeTab === 'logo' && (
        /* LOGO UPLOAD TAB */
        <div 
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          className={`relative rounded-xl p-3 border-2 border-dashed transition-all flex flex-col items-center justify-center text-center ${
            isDragging 
              ? 'border-red-500 bg-red-500/10 scale-[1.01]' 
              : 'border-slate-700 bg-slate-900/80 hover:border-slate-600'
          }`}
        >
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processFile(file, 'logo');
            }}
          />

          {/* Logo Preview Box */}
          <div className="w-28 h-16 rounded-xl overflow-hidden border border-slate-700 bg-white p-2 shadow-md flex items-center justify-center relative group">
            {profile.logoUrl ? (
              <img
                src={profile.logoUrl}
                alt="لوگوی شرکت"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-black text-[#D0192A] tracking-wider">ROYA</span>
                <span className="text-[7.5px] font-medium text-stone-600">Surface Center</span>
              </div>
            )}

            {/* Hover overlay */}
            <button
              onClick={() => logoInputRef.current?.click()}
              title="کلیک برای تغییر لوگو"
              className="absolute inset-0 bg-stone-900/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[11px] font-bold transition-all cursor-pointer"
            >
              <span>تغییر لوگو</span>
            </button>
          </div>

          <div className="mt-2 text-center">
            <p className="text-xs font-bold text-white">لوگوی بالای کارت ویزیت</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {profile.logoUrl ? 'لوگوی دلخواه شما فعال است' : 'لوگوی استاندارد شرکت رویا فعال است'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-3 flex items-center gap-1.5 w-full">
            <button
              onClick={() => logoInputRef.current?.click()}
              className="flex-1 py-1.5 px-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer"
            >
              <Upload className="w-3 h-3 text-white" />
              <span>{profile.logoUrl ? 'تغییر لوگو' : 'آپلود لوگوی تصویری'}</span>
            </button>

            {profile.logoUrl && onUpdateLogo && (
              <button
                onClick={() => onUpdateLogo(undefined)}
                title="بازگشت به لوگوی اصلی رویا"
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded-lg text-xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'avatar' && (
        /* AVATAR UPLOAD TAB */
        <div 
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          className={`relative rounded-xl p-3 border-2 border-dashed transition-all flex flex-col items-center justify-center text-center ${
            isDragging 
              ? 'border-amber-400 bg-amber-500/10 scale-[1.01]' 
              : 'border-slate-700 bg-slate-900/80 hover:border-slate-600'
          }`}
        >
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processFile(file, 'avatar');
            }}
          />

          {/* Avatar Picture */}
          <div className="w-18 h-18 rounded-2xl overflow-hidden border-2 border-amber-500/40 bg-slate-800 shadow-md flex items-center justify-center relative group">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500 p-2">
                <User className="w-7 h-7 text-slate-400 stroke-[1.5]" />
                <span className="text-[9px] text-slate-400 mt-0.5">بدون تصویر</span>
              </div>
            )}

            <button
              onClick={() => avatarInputRef.current?.click()}
              title="تغییر یا آپلود تصویر"
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[10px] font-medium transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4 text-amber-400 mb-0.5" />
              <span>انتخاب عکس</span>
            </button>
          </div>

          <div className="mt-2 text-center">
            <p className="text-xs font-bold text-white">{profile.name}</p>
            <p className="text-[10px] text-slate-400 truncate max-w-[190px]">{profile.title}</p>
          </div>

          {/* Action Buttons */}
          <div className="mt-3 flex items-center gap-1.5 w-full">
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer"
            >
              <Upload className="w-3 h-3 text-slate-950" />
              <span>{profile.avatarUrl ? 'تغییر عکس' : 'آپلود عکس پرسنلی'}</span>
            </button>

            {profile.avatarUrl && (
              <button
                onClick={onRemoveAvatar}
                title="حذف عکس"
                className="p-1.5 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-lg text-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'catalog' && (
        /* PDF CATALOG UPLOAD TAB */
        <div 
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          className={`relative rounded-xl p-3 border-2 border-dashed transition-all flex flex-col items-center justify-center text-center ${
            isDragging 
              ? 'border-amber-400 bg-amber-500/10 scale-[1.01]' 
              : 'border-slate-700 bg-slate-900/80 hover:border-slate-600'
          }`}
        >
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processPdfFile(file);
            }}
          />

          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center text-amber-400 shadow-md">
            <FileText className="w-7 h-7 mb-1" />
            <span className="text-[9px] font-mono text-amber-300 font-bold">PDF</span>
          </div>

          <div className="mt-2 text-center">
            <p className="text-xs font-bold text-white">فایل کاتالوگ محصولات</p>
            <p className="text-[10px] text-slate-400 font-mono truncate max-w-[200px] mt-0.5">
              {profile.catalogPdfUrl || '/roya-catalog.pdf'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-3 flex items-center gap-1.5 w-full">
            <button
              onClick={() => pdfInputRef.current?.click()}
              disabled={isPdfUploading}
              className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {isPdfUploading ? (
                <Loader2 className="w-3 h-3 animate-spin text-slate-950" />
              ) : (
                <Upload className="w-3 h-3 text-slate-950" />
              )}
              <span>{isPdfUploading ? 'در حال آپلود...' : 'آپلود PDF جدید'}</span>
            </button>

            <button
              type="button"
              onClick={() => downloadCatalogPdf(profile)}
              title="تست دانلود فایل PDF کاتالوگ"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded-lg text-xs transition-colors cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Success & Error Notifications */}
      {successNotice && (
        <div className="mt-2 p-2 bg-emerald-950/80 border border-emerald-500/40 rounded-xl flex items-center justify-center gap-1.5 text-emerald-400 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {errorNotice && (
        <div className="mt-2 p-2 bg-rose-950/80 border border-rose-500/40 rounded-xl flex items-center justify-center gap-1.5 text-rose-300 text-xs font-medium animate-in fade-in">
          <span>{errorNotice}</span>
        </div>
      )}
    </div>
  );
};
