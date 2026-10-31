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
  FileDown,
  UserPlus,
  Share2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { EmployeeProfile } from '../types';
import { RoyaLogo } from './RoyaLogo';
import { LeadCaptureModal } from './LeadCaptureModal';
import { downloadVCard } from '../utils/vcard';
import { downloadCatalogPdf, resolveCatalogUrl } from '../utils/catalog';
import { api, AnalyticsEventName } from '../services/api';
import { getBaseOrigin } from '../utils/url';
import { telHref, whatsappNumber, toPersianDigits } from '../utils/phone';

interface DigitalCardProps {
  profile: EmployeeProfile;
  onOpenNavigation: () => void;
  onOpenShare: () => void;
  onOpenNfc: () => void;
  isStandalone?: boolean;
  isAdmin?: boolean;
}

/** Instagram handle shown on the card, derived from the URL when one is set so text and link always match. */
export function instagramDisplay(profile: EmployeeProfile): { handle: string; href: string } | null {
  const fromUrl = (profile.instagramUrl || '').match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1];
  const fromHandle = (profile.instagram || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/.*$/, '');
  const handle = fromUrl || fromHandle;
  if (!handle) return null;
  return { handle, href: `https://www.instagram.com/${handle}` };
}

function websiteDisplay(profile: EmployeeProfile): { label: string; href: string } | null {
  const raw = (profile.websiteUrl || profile.website || '').trim();
  if (!raw) return null;
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const label = (profile.website || raw).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return { label, href };
}

const tileBase =
  'bg-white rounded-2xl border border-stone-200/90 hover:border-red-300 hover:bg-stone-50/40 transition-all item-card-shadow group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D0192A]';

/** Half-width tile: icon + label on the first line, the value on its own full-width line so phone numbers are never cut off. */
const HalfTile: React.FC<{
  id: string;
  href: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  ltrValue?: boolean;
  external?: boolean;
  ariaLabel: string;
  onClick?: () => void;
}> = ({ id, href, label, value, icon, ltrValue = true, external, ariaLabel, onClick }) => (
  <a
    id={id}
    href={href}
    onClick={onClick}
    aria-label={ariaLabel}
    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    className={`${tileBase} flex flex-col gap-1.5 p-3 active:scale-[0.98] min-w-0`}
  >
    <span className="flex items-center gap-2 text-[#D0192A]">
      <span aria-hidden="true">{icon}</span>
      <span className="text-[12px] text-stone-500 font-medium">{label}</span>
    </span>
    <span
      className="text-[14px] text-stone-800 font-bold tabular-nums whitespace-nowrap overflow-hidden text-ellipsis"
      dir={ltrValue ? 'ltr' : undefined}
      style={{ textAlign: 'start' }}
    >
      <bdi>{value}</bdi>
    </span>
  </a>
);

/** Full-width tile with a chevron. */
const WideTile: React.FC<{
  id: string;
  label: string;
  icon: React.ReactNode;
  isLtr: boolean;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  ariaLabel: string;
  href?: string;
  external?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}> = ({ id, label, icon, isLtr, children, trailing, ariaLabel, href, external, onClick }) => {
  const Chevron = isLtr ? ChevronRight : ChevronLeft;
  const content = (
    <>
      <span className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 flex items-center justify-center text-[#D0192A] shrink-0" aria-hidden="true">
          {icon}
        </span>
        <span className="flex flex-col min-w-0" style={{ textAlign: 'start' }}>
          <span className="text-[12px] text-stone-500 font-medium leading-none mb-1">{label}</span>
          {children}
        </span>
      </span>
      <span className="flex items-center gap-1 shrink-0" aria-hidden="true">
        {trailing}
        <Chevron className="w-4 h-4 text-stone-400 group-hover:text-[#D0192A] transition-colors" />
      </span>
    </>
  );
  const className = `${tileBase} w-full flex items-center justify-between gap-2 p-3.5 sm:p-4 active:scale-[0.99] cursor-pointer`;
  if (href) {
    return (
      <a
        id={id}
        href={href}
        onClick={onClick}
        aria-label={ariaLabel}
        className={className}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {content}
      </a>
    );
  }
  return (
    <button id={id} type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
      {content}
    </button>
  );
};

export const DigitalCard: React.FC<DigitalCardProps> = ({
  profile,
  onOpenNavigation,
  onOpenShare,
  isStandalone = false,
  isAdmin = false,
}) => {
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [catalogDownloading, setCatalogDownloading] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  // Where the visitor came from (?src=nfc|qr|link, ?c=campaign); read once before the URL is cleaned.
  const visitRef = useRef<{ source: string; campaign: string } | null>(null);
  if (visitRef.current === null) {
    let source = 'link';
    let campaign = '';
    try {
      const params = new URLSearchParams(window.location.search);
      const src = (params.get('src') || params.get('ref') || '').toLowerCase();
      if (src === 'nfc' || src === 'qr') source = src;
      campaign = (params.get('c') || params.get('campaign') || '').slice(0, 60);
    } catch {
      // ignore
    }
    visitRef.current = { source, campaign };
  }

  // Only real visitors are counted: not the admin panel preview and not a logged-in admin.
  const shouldTrack = isStandalone && !isAdmin;

  const track = (event: AnalyticsEventName) => {
    if (shouldTrack) void api.trackAnalyticsEvent(profile.id, event, visitRef.current ?? undefined);
  };

  // Count the visit once per browser session, then drop ?src / ?c so a re-shared link is not counted as a QR/NFC scan.
  useEffect(() => {
    if (!profile?.id || !isStandalone) return;
    try {
      if (!isAdmin) {
        const sessionKey = `roya_view_logged_${profile.id}`;
        if (!sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, '1');
          void api.trackAnalyticsEvent(profile.id, 'view', visitRef.current ?? undefined);
        }
      }
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of ['src', 'ref', 'c', 'campaign']) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch {
      // ignore (private mode, old browsers)
    }
  }, [profile?.id, isStandalone, isAdmin]);

  // Sticky action bar: shown on the public card page once the main "save contact" button scrolls out of view.
  useEffect(() => {
    if (!isStandalone || !saveButtonRef.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(saveButtonRef.current);
    return () => observer.disconnect();
  }, [isStandalone]);

  const isLtr = profile.layoutDirection === 'ltr';
  const telMobile = telHref(profile.mobile);
  const telLandline = telHref(profile.landline);
  const waNumber = whatsappNumber(profile.whatsapp);
  const instagram = instagramDisplay(profile);
  const website = websiteDisplay(profile);
  const catalogHref = resolveCatalogUrl(profile);
  const catalogLabel =
    profile.catalogUrl && !/^\/|\.pdf$/i.test(profile.catalogUrl)
      ? profile.catalogUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
      : 'دانلود کاتالوگ محصولات';

  const identifier = (profile.slug || profile.id).trim();
  const cardUrl = `${getBaseOrigin()}/${identifier}?src=qr`;

  const handleSaveContact = async () => {
    track('vcardDownload');
    const ok = await downloadVCard(profile);
    if (ok) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 6000);
    }
  };

  const handleDownloadCatalog = (e: React.MouseEvent) => {
    e.preventDefault();
    track('catalogDownload');
    setCatalogDownloading(true);
    downloadCatalogPdf(profile);
    setTimeout(() => setCatalogDownloading(false), 2500);
  };

  const handleOpenRouting = () => {
    track('mapClick');
    onOpenNavigation();
  };

  const hasRow1 = !!telMobile || !!waNumber;
  const hasRow2 = !!telLandline || !!instagram;
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <>
    <div
      className="w-full max-w-[430px] mx-auto bg-white rounded-3xl p-4 sm:p-7 card-shadow border border-stone-100/90 transition-all duration-300"
      dir={isLtr ? 'ltr' : 'rtl'}
    >
      {/* 1. Brand logo */}
      <div className="pt-2 pb-5 flex flex-col items-center">
        <RoyaLogo size="md" logoUrl={profile.logoUrl} />
      </div>

      {/* 2. Avatar */}
      <div className="flex flex-col items-center justify-center">
        <div className="w-24 h-24 sm:w-26 sm:h-26 rounded-full border border-stone-200 flex items-center justify-center bg-white shadow-xs p-1 overflow-hidden">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={`تصویر ${profile.name}`}
              width={104}
              height={104}
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
              decoding="async"
              fetchPriority="high"
            />
          ) : (
            <div className="w-full h-full rounded-full bg-stone-50/50 flex items-center justify-center text-stone-400">
              <User className="w-13 h-13 stroke-[1.2] text-stone-400" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* 3. Name and title */}
        <h1 className="mt-3.5 text-2xl sm:text-[25px] font-black text-stone-800 text-center">{profile.name}</h1>
        <div className="w-12 h-[2.5px] bg-[#D0192A] rounded-full mx-auto mt-2 mb-2.5" aria-hidden="true" />
        {profile.title && (
          <p className="text-[13.5px] text-stone-600 font-medium text-center leading-normal">{profile.title}</p>
        )}
        {profile.company && (
          <p className="text-[13.5px] text-stone-600 font-medium text-center leading-normal mt-0.5">{profile.company}</p>
        )}
      </div>

      {/* 4. Contact tiles (empty fields are hidden) */}
      <div className="mt-6 space-y-2.5">
        {hasRow1 && (
          <div className={`grid gap-2.5 ${telMobile && waNumber ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {telMobile && (
              <HalfTile
                id="btn-call-mobile"
                href={`tel:${telMobile}`}
                label="تماس"
                value={toPersianDigits(profile.mobile)}
                icon={<Phone className="w-5 h-5 stroke-[1.8]" />}
                ariaLabel={`تماس با موبایل ${profile.mobile}`}
                onClick={() => track('call')}
              />
            )}
            {waNumber && (
              <HalfTile
                id="btn-whatsapp"
                href={`https://wa.me/${waNumber}?text=${encodeURIComponent('سلام وقت بخیر، از طریق کارت ویزیت دیجیتال با شما ارتباط می‌گیرم.')}`}
                label="واتساپ"
                value={toPersianDigits(profile.whatsapp)}
                icon={<MessageCircle className="w-5 h-5 stroke-[1.8]" />}
                ariaLabel={`پیام در واتساپ به ${profile.whatsapp}`}
                external
                onClick={() => track('whatsapp')}
              />
            )}
          </div>
        )}

        {hasRow2 && (
          <div className={`grid gap-2.5 ${telLandline && instagram ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {telLandline && (
              <HalfTile
                id="btn-call-landline"
                href={`tel:${telLandline}`}
                label="تلفن ثابت"
                value={toPersianDigits(profile.landline)}
                icon={<PhoneCall className="w-5 h-5 stroke-[1.8]" />}
                ariaLabel={`تماس با تلفن ثابت ${profile.landline}`}
                onClick={() => track('call')}
              />
            )}
            {instagram && (
              <HalfTile
                id="btn-instagram"
                href={instagram.href}
                label="اینستاگرام"
                value={instagram.handle}
                icon={<Instagram className="w-5 h-5 stroke-[1.8]" />}
                ariaLabel={`صفحه اینستاگرام ${instagram.handle}`}
                external
                onClick={() => track('instagram')}
              />
            )}
          </div>
        )}

        {website && (
          <WideTile
            id="btn-website"
            label="وب سایت"
            icon={<Globe className="w-5 h-5 stroke-[1.8]" />}
            isLtr={isLtr}
            href={website.href}
            external
            ariaLabel={`وب‌سایت ${website.label}`}
            onClick={() => track('website')}
          >
            <span className="text-[13.5px] text-stone-800 font-medium truncate" dir="ltr">
              {website.label}
            </span>
          </WideTile>
        )}

        {catalogHref && (
          <WideTile
            id="btn-catalog"
            label="کاتالوگ محصولات"
            icon={<BookOpen className="w-5 h-5 stroke-[1.8]" />}
            isLtr={isLtr}
            onClick={handleDownloadCatalog}
            ariaLabel="دانلود کاتالوگ محصولات (PDF)"
            trailing={<FileDown className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#D0192A] transition-colors" />}
          >
            <span className="text-[13.5px] text-stone-800 font-medium truncate">
              {catalogDownloading ? (
                <span className="text-emerald-700 font-bold">در حال دانلود کاتالوگ...</span>
              ) : (
                <>
                  {catalogLabel} <span className="text-xs bg-red-50 text-[#D0192A] px-1.5 rounded font-bold border border-red-100">PDF</span>
                </>
              )}
            </span>
          </WideTile>
        )}

        {profile.email && (
          <WideTile
            id="btn-email"
            label="ایمیل"
            icon={<Mail className="w-5 h-5 stroke-[1.8]" />}
            isLtr={isLtr}
            href={`mailto:${profile.email}`}
            ariaLabel={`ارسال ایمیل به ${profile.email}`}
            onClick={() => track('email')}
          >
            <span className="text-[13.5px] text-stone-800 font-medium truncate" dir="ltr">
              {profile.email}
            </span>
          </WideTile>
        )}

        {profile.address && (
          <WideTile
            id="btn-address-routing"
            label="آدرس و مسیریابی"
            icon={<MapPin className="w-5 h-5 stroke-[1.8]" />}
            isLtr={isLtr}
            onClick={handleOpenRouting}
            ariaLabel={`آدرس و مسیریابی: ${profile.address}`}
          >
            <span className="text-[13px] text-stone-600 font-normal leading-relaxed">{toPersianDigits(profile.address)}</span>
          </WideTile>
        )}

        {/* 5. Primary actions */}
        <div className="pt-2">
          <button
            id="btn-save-contact"
            ref={saveButtonRef}
            type="button"
            onClick={handleSaveContact}
            className="w-full py-3.5 sm:py-4 px-4 sm:px-5 bg-[#D0192A] hover:bg-[#B51221] active:scale-[0.98] text-white rounded-2xl flex items-center justify-between gap-3 shadow-lg shadow-red-500/20 transition-all duration-200 cursor-pointer"
          >
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0" aria-hidden="true">
                <Contact className="w-5 h-5 text-white" />
              </span>
              <span className="flex flex-col" style={{ textAlign: 'start' }}>
                <span className="text-base sm:text-[17px] font-bold">ذخیره در مخاطبین</span>
                <span className="text-[12px] text-white/90 font-light mt-0.5">افزودن اطلاعات به مخاطبین گوشی شما</span>
              </span>
            </span>
            <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0" aria-hidden="true">
              {savedSuccess ? <Check className="w-5 h-5 text-white" /> : <Download className="w-5 h-5 text-white stroke-[2.2]" />}
            </span>
          </button>

          <div aria-live="polite">
            {savedSuccess && (
              <p className="mt-2.5 p-3 bg-emerald-50 text-emerald-900 text-xs leading-relaxed rounded-xl border border-emerald-200">
                {isIOS
                  ? 'فایل مخاطب دانلود شد. آن را باز کنید و «افزودن به مخاطبین» را بزنید. اگر از داخل اینستاگرام یا تلگرام آمده‌اید، اول صفحه را در Safari باز کنید.'
                  : 'فایل مخاطب دانلود شد. آن را از اعلان دانلود باز کنید تا در دفترچه تلفن ذخیره شود. اگر از داخل اینستاگرام یا تلگرام آمده‌اید، اول صفحه را در Chrome باز کنید.'}
              </p>
            )}
          </div>

          <button
            id="btn-exchange-contact"
            type="button"
            onClick={() => setIsLeadModalOpen(true)}
            className="mt-2.5 w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 active:scale-[0.99] text-white rounded-2xl flex items-center justify-between gap-3 shadow-sm transition-all duration-200 cursor-pointer"
          >
            <span className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0" aria-hidden="true">
                <UserPlus className="w-4 h-4 text-amber-400" />
              </span>
              <span className="flex flex-col" style={{ textAlign: 'start' }}>
                <span className="text-[13.5px] font-bold">ارسال شماره شما برای کارشناس</span>
                <span className="text-xs text-stone-300 font-normal">تبادل کارت ویزیت و ثبت درخواست تماس</span>
              </span>
            </span>
            {isLtr ? (
              <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* 6. QR for passing the card on */}
        <div className="pt-5 pb-3 flex items-center justify-center gap-3" aria-hidden="true">
          <div className="flex-1 h-[1px] bg-stone-200" />
          <span className="text-xs text-stone-500 font-normal px-2">اسکن یا اشتراک‌گذاری</span>
          <div className="flex-1 h-[1px] bg-stone-200" />
        </div>

        <div className="flex flex-col items-center justify-center pb-1">
          <button
            type="button"
            onClick={onOpenShare}
            aria-label="بزرگنمایی کد QR و اشتراک‌گذاری کارت"
            className="p-3 bg-white rounded-2xl border border-stone-200/90 shadow-xs hover:border-red-300 hover:shadow-md cursor-pointer transition-all duration-200"
          >
            <QRCodeSVG
              value={cardUrl}
              size={144}
              level="H"
              fgColor="#1C1917"
              bgColor="#FFFFFF"
              imageSettings={{ src: '/favicon.png', height: 28, width: 28, excavate: true }}
            />
          </button>
          <button
            type="button"
            onClick={onOpenShare}
            className="mt-2.5 py-2 px-4 rounded-full bg-stone-100 hover:bg-stone-200/80 text-stone-700 hover:text-stone-900 text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-[#D0192A]" aria-hidden="true" />
            <span>اشتراک‌گذاری لینک کارت و بارکد</span>
          </button>
        </div>
      </div>

    </div>
    {isStandalone && (
      <div
        className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ${showStickyBar ? 'translate-y-0' : 'translate-y-full'}`}
        aria-hidden={!showStickyBar}
      >
        <div
          className="max-w-[430px] mx-auto px-3 pt-2 bg-white/95 backdrop-blur border-t border-stone-200 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] flex gap-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
          dir={isLtr ? 'ltr' : 'rtl'}
        >
          <button
            type="button"
            onClick={handleSaveContact}
            tabIndex={showStickyBar ? 0 : -1}
            className="flex-1 min-h-12 rounded-xl bg-[#D0192A] hover:bg-[#B51221] text-white text-[13.5px] font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            {savedSuccess ? <Check className="w-4 h-4" aria-hidden="true" /> : <Contact className="w-4 h-4" aria-hidden="true" />}
            ذخیره مخاطب
          </button>
          {telMobile && (
            <a
              href={`tel:${telMobile}`}
              onClick={() => track('call')}
              tabIndex={showStickyBar ? 0 : -1}
              aria-label={`تماس با ${profile.name}`}
              className="min-h-12 min-w-12 px-3 rounded-xl border border-stone-200 text-[#D0192A] flex items-center justify-center gap-1.5 text-[13px] font-bold"
            >
              <Phone className="w-5 h-5" aria-hidden="true" />
              <span>تماس</span>
            </a>
          )}
          {waNumber && (
            <a
              href={`https://wa.me/${waNumber}?text=${encodeURIComponent('سلام وقت بخیر، از طریق کارت ویزیت دیجیتال با شما ارتباط می‌گیرم.')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('whatsapp')}
              tabIndex={showStickyBar ? 0 : -1}
              aria-label={`پیام در واتساپ به ${profile.name}`}
              className="min-h-12 min-w-12 px-3 rounded-xl border border-stone-200 text-emerald-700 flex items-center justify-center gap-1.5 text-[13px] font-bold"
            >
              <MessageCircle className="w-5 h-5" aria-hidden="true" />
              <span>واتساپ</span>
            </a>
          )}
        </div>
      </div>
    )}
    <LeadCaptureModal
      isOpen={isLeadModalOpen}
      onClose={() => setIsLeadModalOpen(false)}
      profile={profile}
      source={visitRef.current?.source}
    />
    </>
  );
};
