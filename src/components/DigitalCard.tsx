import React, { useState, useRef, useEffect } from 'react';
import { 
  Phone, 
  MessageCircle, 
  PhoneCall, 
  Instagram, 
  Globe, 
  BookOpen, 
  Mail, 
  MapPin, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Contact, 
  User, 
  Check,
  Sparkles,
  Camera,
  FileDown
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { EmployeeProfile } from '../types';
import { RoyaLogo } from './RoyaLogo';
import { downloadVCard } from '../utils/vcard';
import { downloadCatalogPdf } from '../utils/catalog';
import { api } from '../services/api';
import { optimizeImage } from '../utils/imageOptimizer';
import { getBaseOrigin } from '../utils/url';

interface DigitalCardProps {
  profile: EmployeeProfile;
  onOpenNavigation: () => void;
  onOpenShare: () => void;
  onOpenNfc: () => void;
  onUpdateAvatar?: (avatarDataUrl: string) => void;
  onUpdateLogo?: (logoDataUrl: string | undefined) => void;
  isStandalone?: boolean;
  isAdmin?: boolean;
}

export const DigitalCard: React.FC<DigitalCardProps> = ({
  profile,
  onOpenNavigation,
  onOpenShare,
  onOpenNfc,
  onUpdateAvatar,
  onUpdateLogo,
  isStandalone = false,
  isAdmin = false,
}) => {
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [catalogDownloading, setCatalogDownloading] = useState(false);
  const cardFileInputRef = useRef<HTMLInputElement>(null);
  const canEdit = isAdmin && !isStandalone;

  // Track initial page view / NFC tap / QR scan once per session
  useEffect(() => {
    if (!profile?.id) return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const src = urlParams.get('src') || urlParams.get('ref') || '';
      
      let eventType: 'view' | 'nfcTap' | 'qrScan' = 'view';
      if (src === 'nfc') {
        eventType = 'nfcTap';
      } else if (src === 'qr') {
        eventType = 'qrScan';
      }

      // Check if already counted in this session to prevent spam reloads
      const sessionKey = `roya_view_logged_${profile.id}_${eventType}`;
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, 'true');
        api.trackAnalyticsEvent(profile.id, eventType);
      }
    } catch {
      // ignore
    }
  }, [profile?.id]);

  const isLtr = profile.layoutDirection === 'ltr';

  const toEnglishDigits = (str: string) => {
    if (!str) return '';
    return str
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
  };

  // Clean and format phone numbers for direct one-tap dialing (tel: protocol)
  const telMobile = toEnglishDigits(profile.mobile).replace(/[^0-9+]/g, '');
  const telLandline = toEnglishDigits(profile.landline).replace(/[^0-9+]/g, '');

  // Format WhatsApp number with international country code (98)
  const rawWhatsappDigits = toEnglishDigits(profile.whatsapp).replace(/[^0-9]/g, '');
  const cleanWhatsapp = rawWhatsappDigits.startsWith('0')
    ? '98' + rawWhatsappDigits.substring(1)
    : rawWhatsappDigits.startsWith('98')
      ? rawWhatsappDigits
      : '98' + rawWhatsappDigits;

  // Format Instagram URL and handle
  const rawInstagram = (profile.instagram || 'royco').trim();
  const cleanInstagramHandle = rawInstagram
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/$/, '')
    .trim();
  const displayInstagramHandle = cleanInstagramHandle || 'Royco';
  const instagramHref = profile.instagramUrl && profile.instagramUrl.startsWith('http')
    ? profile.instagramUrl
    : `https://www.instagram.com/${displayInstagramHandle.toLowerCase() === 'royco' ? 'royaco' : displayInstagramHandle}`;

  // Format Website URL
  const displayWebsite = profile.website || 'www.royaco.com';
  const websiteHref = profile.websiteUrl && profile.websiteUrl.startsWith('http')
    ? profile.websiteUrl
    : profile.website?.startsWith('http')
      ? profile.website
      : `https://${displayWebsite}`;

  // Format Catalog Display Name
  const displayCatalog = profile.catalogUrl 
    ? profile.catalogUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : 'دانلود کاتالوگ PDF رویا';

  // Exact Standalone Card URL for QR Code (with ?src=qr)
  const identifier = (profile.slug || profile.id).trim();
  const origin = getBaseOrigin();
  const cardUrl = `${origin}/${identifier}?src=qr`;

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUpdateAvatar) {
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
        onUpdateAvatar(optimized.dataUrl);
      } catch {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (result) {
            onUpdateAvatar(result);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSaveContact = () => {
    api.trackAnalyticsEvent(profile.id, 'vcardDownload');
    try {
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.75 },
        colors: ['#D0192A', '#E53E3E', '#FF6B6B', '#10B981', '#3B82F6'],
      });
    } catch {
      // ignore
    }

    const ok = downloadVCard(profile);
    if (ok) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    }
  };

  const handleDownloadCatalog = (e: React.MouseEvent) => {
    e.preventDefault();
    api.trackAnalyticsEvent(profile.id, 'catalogDownload');
    setCatalogDownloading(true);
    try {
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.6 },
        colors: ['#D0192A', '#FFAA00', '#10B981'],
      });
    } catch {
      // ignore
    }

    downloadCatalogPdf(profile);
    setTimeout(() => {
      setCatalogDownloading(false);
    }, 2500);
  };

  const handleOpenRouting = () => {
    api.trackAnalyticsEvent(profile.id, 'mapClick');
    onOpenNavigation();
  };

  return (
    <div className="w-full max-w-[430px] mx-auto bg-white rounded-3xl p-5 sm:p-7 card-shadow border border-stone-100/90 select-none transition-all duration-300">
      {/* Hidden file input for quick direct avatar upload from card (Admin Only) */}
      {canEdit && (
        <input 
          ref={cardFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarFileChange}
        />
      )}

      {/* 1. Header & ROYA Surface Center Brand Logo */}
      <div className="pt-2 pb-5 flex flex-col items-center">
        <RoyaLogo 
          size="md" 
          logoUrl={profile.logoUrl}
          editable={canEdit}
          onLogoChange={onUpdateLogo}
        />
      </div>

      {/* 2. Profile Avatar Circle */}
      <div className="flex flex-col items-center justify-center">
        <div className="relative group">
          <div 
            onClick={() => {
              if (canEdit) cardFileInputRef.current?.click();
            }}
            className={`w-24 h-24 sm:w-26 sm:h-26 rounded-full border border-stone-200 flex items-center justify-center bg-white shadow-xs p-1 relative overflow-hidden transition-all ${
              canEdit ? 'cursor-pointer hover:border-[#D0192A]' : ''
            }`}
            title={canEdit ? 'کلیک برای تغییر تصویر پرسنلی' : profile.name}
          >
            {profile.avatarUrl ? (
              <img 
                src={profile.avatarUrl} 
                alt={profile.name} 
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-stone-50/50 flex items-center justify-center text-stone-400">
                <User className="w-13 h-13 stroke-[1.2] text-stone-400" />
              </div>
            )}

            {/* Hover overlay for editing avatar (Admin Only) */}
            {canEdit && (
              <div className="absolute inset-0 bg-stone-900/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[10px] font-medium transition-all">
                <Camera className="w-4 h-4 text-red-400 mb-0.5" />
                <span>تغییر عکس</span>
              </div>
            )}
          </div>

          {canEdit && (
            <button
              onClick={() => cardFileInputRef.current?.click()}
              title="آپلود تصویر پرسنلی"
              className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md border-2 border-white transition-transform active:scale-95 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
            </button>
          )}
        </div>

        {/* 3. Name, Red Underline Accent, & Job Title */}
        <h2 className="mt-3.5 text-2xl sm:text-[25px] font-black text-stone-800 tracking-tight text-center">
          {profile.name}
        </h2>
        
        {/* Distinct Red Accent Line below Name */}
        <div className="w-12 h-[2.5px] bg-[#D0192A] rounded-full mx-auto mt-2 mb-2.5" />

        <p className="text-xs sm:text-[13.5px] text-stone-500 font-medium text-center leading-normal">
          {profile.title}
        </p>
        <p className="text-xs sm:text-[13.5px] text-stone-500 font-medium text-center leading-normal mt-0.5">
          {profile.company || 'شرکت رویا طرح داخلی'}
        </p>
      </div>

      {/* 4. Action Tiles List (Supports RTL and LTR direction per user intent) */}
      <div className="mt-6 space-y-2.5">
        {/* Row 1: Split 2 columns (تماس + واتساپ) */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* تماس مستقیم */}
          <a
            id="btn-call-mobile"
            href={`tel:${telMobile}`}
            onClick={() => api.trackAnalyticsEvent(profile.id, 'call')}
            className={`flex items-center gap-3 p-3 bg-white rounded-2xl border border-stone-200/90 hover:border-red-300 hover:bg-stone-50/40 active:scale-[0.98] transition-all item-card-shadow group ${
              isLtr ? 'flex-row-reverse text-left' : 'text-right'
            }`}
            title={`تماس مستقیم با ${profile.mobile}`}
          >
            <div className="w-9 h-9 flex items-center justify-center text-[#D0192A] shrink-0">
              <Phone className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div className={`flex flex-col min-w-0 flex-1 ${isLtr ? 'text-left' : 'text-right'}`}>
              <span className="text-[11.5px] text-stone-500 font-medium leading-none mb-1">تماس</span>
              <span className="text-[12px] sm:text-[12.5px] text-stone-800 font-bold font-mono tracking-tight truncate" dir="ltr">
                {profile.mobile}
              </span>
            </div>
          </a>

          {/* واتساپ */}
          <a
            id="btn-whatsapp"
            href={`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent('سلام وقت بخیر، از طریق کارت ویزیت دیجیتال رویا با شما ارتباط می‌گیرم.')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => api.trackAnalyticsEvent(profile.id, 'whatsapp')}
            className={`flex items-center gap-3 p-3 bg-white rounded-2xl border border-stone-200/90 hover:border-red-300 hover:bg-stone-50/40 active:scale-[0.98] transition-all item-card-shadow group ${
              isLtr ? 'flex-row-reverse text-left' : 'text-right'
            }`}
            title={`ارسال پیام در واتساپ به ${profile.whatsapp}`}
          >
            <div className="w-9 h-9 flex items-center justify-center text-[#D0192A] shrink-0">
              <MessageCircle className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div className={`flex flex-col min-w-0 flex-1 ${isLtr ? 'text-left' : 'text-right'}`}>
              <span className="text-[11.5px] text-stone-500 font-medium leading-none mb-1">واتساپ</span>
              <span className="text-[12px] sm:text-[12.5px] text-stone-800 font-bold font-mono tracking-tight truncate" dir="ltr">
                {profile.whatsapp}
              </span>
            </div>
          </a>
        </div>

        {/* Row 2: Split 2 columns (تلفن ثابت + اینستاگرام) */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* تلفن ثابت */}
          <a
            id="btn-call-landline"
            href={`tel:${telLandline}`}
            onClick={() => api.trackAnalyticsEvent(profile.id, 'call')}
            className={`flex items-center gap-3 p-3 bg-white rounded-2xl border border-stone-200/90 hover:border-red-300 hover:bg-stone-50/40 active:scale-[0.98] transition-all item-card-shadow group ${
              isLtr ? 'flex-row-reverse text-left' : 'text-right'
            }`}
            title={`تماس با تلفن ثابت ${profile.landline}`}
          >
            <div className="w-9 h-9 flex items-center justify-center text-[#D0192A] shrink-0">
              <PhoneCall className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div className={`flex flex-col min-w-0 flex-1 ${isLtr ? 'text-left' : 'text-right'}`}>
              <span className="text-[11.5px] text-stone-500 font-medium leading-none mb-1">تلفن ثابت</span>
              <span className="text-[12px] sm:text-[12.5px] text-stone-800 font-bold font-mono tracking-tight truncate" dir="ltr">
                {profile.landline}
              </span>
            </div>
          </a>

          {/* اینستاگرام */}
          <a
            id="btn-instagram"
            href={instagramHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-3 p-3 bg-white rounded-2xl border border-stone-200/90 hover:border-red-300 hover:bg-stone-50/40 active:scale-[0.98] transition-all item-card-shadow group ${
              isLtr ? 'flex-row-reverse text-left' : 'text-right'
            }`}
            title={`مشاهده صفحه اینستاگرام @${displayInstagramHandle}`}
          >
            <div className="w-9 h-9 flex items-center justify-center text-[#D0192A] shrink-0">
              <Instagram className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div className={`flex flex-col min-w-0 flex-1 ${isLtr ? 'text-left' : 'text-right'}`}>
              <span className="text-[11.5px] text-stone-500 font-medium leading-none mb-1">اینستاگرام</span>
              <span className="text-[12px] sm:text-[12.5px] text-stone-800 font-bold tracking-tight truncate" dir="ltr">
                {displayInstagramHandle}
              </span>
            </div>
          </a>
        </div>

        {/* Row 3: Full Width (وب سایت) */}
        <a
          id="btn-website"
          href={websiteHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-full flex items-center justify-between p-3.5 sm:p-4 bg-white rounded-2xl border border-stone-200/90 hover:border-red-300 hover:bg-stone-50/40 active:scale-[0.99] transition-all item-card-shadow group ${
            isLtr ? 'flex-row-reverse' : ''
          }`}
          title="مشاهده وب‌سایت رسمی رویا طرح داخلی"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 flex items-center justify-center text-[#D0192A] shrink-0">
              <Globe className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div className={`flex flex-col overflow-hidden ${isLtr ? 'text-left' : 'text-right'}`}>
              <span className="text-[11.5px] text-stone-500 font-medium leading-none mb-1">وب سایت</span>
              <span className="text-[13px] text-stone-800 font-medium font-mono tracking-tight truncate" dir="ltr">
                {displayWebsite}
              </span>
            </div>
          </div>
          {isLtr ? (
            <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-[#D0192A] group-hover:translate-x-0.5 transition-all shrink-0" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-stone-400 group-hover:text-[#D0192A] group-hover:-translate-x-0.5 transition-all shrink-0" />
          )}
        </a>

        {/* Row 4: Full Width (کاتالوگ محصولات - دانلود مستقیم فایل PDF) */}
        <button
          id="btn-catalog"
          type="button"
          onClick={handleDownloadCatalog}
          className={`w-full flex items-center justify-between p-3.5 sm:p-4 bg-white rounded-2xl border border-stone-200/90 hover:border-red-300 hover:bg-stone-50/40 active:scale-[0.99] transition-all item-card-shadow group cursor-pointer ${
            isLtr ? 'flex-row-reverse' : ''
          }`}
          title="دانلود مستقیم فایل PDF کاتالوگ محصولات رویا طرح داخلی"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 flex items-center justify-center text-[#D0192A] shrink-0">
              <BookOpen className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div className={`flex flex-col overflow-hidden ${isLtr ? 'text-left' : 'text-right'}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-stone-500 font-medium leading-none mb-1">کاتالوگ محصولات</span>
                <span className="text-[9.5px] bg-red-50 text-[#D0192A] px-1.5 py-0.2 rounded font-bold border border-red-100 mb-1">
                  PDF
                </span>
              </div>
              <span className="text-[13px] text-stone-800 font-medium tracking-tight truncate flex items-center gap-1">
                {catalogDownloading ? (
                  <span className="text-emerald-600 font-bold animate-pulse">در حال دانلود کاتالوگ...</span>
                ) : (
                  <span>{displayCatalog}</span>
                )}
              </span>
            </div>
          </div>
          {isLtr ? (
            <div className="flex items-center gap-1">
              <FileDown className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#D0192A] transition-colors" />
              <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-[#D0192A] group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <FileDown className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#D0192A] transition-colors" />
              <ChevronLeft className="w-4 h-4 text-stone-400 group-hover:text-[#D0192A] group-hover:-translate-x-0.5 transition-all shrink-0" />
            </div>
          )}
        </button>

        {/* Row 5: Full Width (ایمیل) */}
        <a
          id="btn-email"
          href={`mailto:${profile.email}`}
          className={`w-full flex items-center justify-between p-3.5 sm:p-4 bg-white rounded-2xl border border-stone-200/90 hover:border-red-300 hover:bg-stone-50/40 active:scale-[0.99] transition-all item-card-shadow group ${
            isLtr ? 'flex-row-reverse' : ''
          }`}
          title={`ارسال ایمیل به ${profile.email}`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 flex items-center justify-center text-[#D0192A] shrink-0">
              <Mail className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div className={`flex flex-col overflow-hidden ${isLtr ? 'text-left' : 'text-right'}`}>
              <span className="text-[11.5px] text-stone-500 font-medium leading-none mb-1">ایمیل</span>
              <span className="text-[13px] text-stone-800 font-medium font-mono tracking-tight truncate" dir="ltr">
                {profile.email}
              </span>
            </div>
          </div>
          {isLtr ? (
            <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-[#D0192A] group-hover:translate-x-0.5 transition-all shrink-0" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-stone-400 group-hover:text-[#D0192A] group-hover:-translate-x-0.5 transition-all shrink-0" />
          )}
        </a>

        {/* Row 6: Full Width (آدرس و مسیریابی) */}
        <button
          id="btn-address-routing"
          type="button"
          onClick={handleOpenRouting}
          className={`w-full flex items-center justify-between p-3.5 sm:p-4 bg-white rounded-2xl border border-stone-200/90 hover:border-red-300 hover:bg-stone-50/40 active:scale-[0.99] transition-all item-card-shadow group cursor-pointer ${
            isLtr ? 'flex-row-reverse text-left' : 'text-right'
          }`}
          title="مشاهده آدرس و مسیریابی با نشان، بلد، گوگل مپ و ویز"
        >
          <div className="flex items-start gap-3 overflow-hidden">
            <div className="w-9 h-9 flex items-center justify-center text-[#D0192A] shrink-0 mt-0.5">
              <MapPin className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div className={`flex flex-col overflow-hidden ${isLtr ? 'text-left' : 'text-right'}`}>
              <span className="text-[11.5px] text-stone-500 font-medium leading-none mb-1">آدرس و مسیریابی</span>
              <span className="text-[12px] sm:text-[12.5px] text-stone-600 font-normal leading-relaxed">
                {profile.address}
              </span>
            </div>
          </div>
          {isLtr ? (
            <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-[#D0192A] group-hover:translate-x-0.5 transition-all shrink-0 self-center" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-stone-400 group-hover:text-[#D0192A] group-hover:-translate-x-0.5 transition-all shrink-0 self-center" />
          )}
        </button>

        {/* 5. Prominent Red CTA Button: ذخیره در مخاطبین */}
        <div className="pt-2">
          <button
            id="btn-save-contact"
            type="button"
            onClick={handleSaveContact}
            className={`w-full py-3.5 sm:py-4 px-4 sm:px-5 bg-[#D0192A] hover:bg-[#B51221] active:scale-[0.98] text-white rounded-2xl flex items-center justify-between shadow-lg shadow-red-500/20 transition-all duration-200 cursor-pointer ${
              isLtr ? 'flex-row-reverse' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                <Contact className="w-5 h-5 text-white" />
              </div>
              <div className={`flex flex-col ${isLtr ? 'text-left' : 'text-right'}`}>
                <span className="text-base sm:text-[17px] font-bold tracking-tight">
                  {savedSuccess ? 'اطلاعات در حال دانلود...' : 'ذخیره در مخاطبین'}
                </span>
                <span className="text-[11px] sm:text-[12px] text-white/90 font-light mt-0.5">
                  {savedSuccess ? 'فایل .vcf مخاطب دریافت شد' : 'افزودن اطلاعات به مخاطبین شما'}
                </span>
              </div>
            </div>

            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
              {savedSuccess ? (
                <Check className="w-5 h-5 text-white animate-bounce" />
              ) : (
                <Download className="w-5 h-5 text-white stroke-[2.2]" />
              )}
            </div>
          </button>

          {/* Success Toast */}
          {savedSuccess && (
            <div className="mt-2.5 p-2.5 bg-emerald-50 text-emerald-800 text-xs rounded-xl flex items-center justify-center gap-2 border border-emerald-200 animate-in fade-in">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>فایل مخاطب آماده شد. با باز کردن آن، اطلاعات فوراً در دفترچه تلفن گوشی ثبت می‌شود.</span>
            </div>
          )}
        </div>

        {/* 6. Divider "اسکن کنید" */}
        <div className="pt-6 pb-3 flex items-center justify-center gap-3">
          <div className="flex-1 h-[1px] bg-stone-200" />
          <span className="text-xs text-stone-400 font-normal px-2">اسکن کنید</span>
          <div className="flex-1 h-[1px] bg-stone-200" />
        </div>

        {/* 7. QR Code Container */}
        <div className="flex flex-col items-center justify-center pb-2">
          <div 
            onClick={onOpenShare}
            className="p-3 bg-white rounded-2xl border border-stone-200/90 shadow-xs hover:border-red-300 hover:shadow-md cursor-pointer transition-all duration-200"
            title="کلیک برای بزرگنمایی یا اشتراک‌گذاری کیوآرکد"
          >
            <QRCodeSVG
              value={cardUrl}
              size={140}
              level="M"
              fgColor="#1C1917"
              bgColor="#FFFFFF"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
