import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Phone, Globe, MapPin, UserX, WifiOff } from 'lucide-react';
import { EmployeeProfile } from '../types';
import { api, PublicCardResponse } from '../services/api';
import { DigitalCard } from '../components/DigitalCard';
import { RoyaLogo } from '../components/RoyaLogo';
import { NavigationModal } from '../components/NavigationModal';
import { ShareModal } from '../components/ShareModal';
import { telHref, toPersianDigits } from '../utils/phone';

/** Grey placeholder in the shape of the card, shown while it loads. */
export const CardSkeleton: React.FC = () => (
  <div
    className="w-full max-w-[430px] mx-auto bg-white rounded-3xl p-4 sm:p-7 card-shadow border border-stone-100/90"
    aria-busy="true"
    aria-label="در حال بارگذاری کارت"
  >
    <div className="flex flex-col items-center animate-pulse">
      <div className="h-16 w-[200px] rounded-xl bg-stone-100 mt-2 mb-5" />
      <div className="w-24 h-24 rounded-full bg-stone-200" />
      <div className="h-6 w-40 rounded-lg bg-stone-200 mt-4" />
      <div className="h-4 w-28 rounded-lg bg-stone-100 mt-3" />
    </div>
    <div className="mt-6 space-y-2.5 animate-pulse">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="h-[72px] rounded-2xl bg-stone-100" />
        <div className="h-[72px] rounded-2xl bg-stone-100" />
      </div>
      <div className="h-16 rounded-2xl bg-stone-100" />
      <div className="h-16 rounded-2xl bg-stone-100" />
      <div className="h-[72px] rounded-2xl bg-red-100/70" />
    </div>
  </div>
);

const UnavailablePage: React.FC<{ result: Extract<PublicCardResponse, { kind: 'unavailable' }> }> = ({ result }) => {
  const c = result.company || {};
  const tel = telHref(c.landline);
  const site = c.websiteUrl || (c.website ? `https://${String(c.website).replace(/^https?:\/\//, '')}` : '');
  return (
    <main className="w-full max-w-[430px] bg-white rounded-3xl card-shadow border border-stone-100 p-6 sm:p-8 text-center">
      <div className="flex justify-center mb-4">
        <RoyaLogo size="sm" logoUrl={c.logoUrl} />
      </div>
      <h1 className="text-[18px] font-black text-stone-900">
        {result.state === 'inactive' ? 'این کارت موقتاً در دسترس نیست' : 'این کارت دیگر فعال نیست'}
      </h1>
      <p className="text-[13.5px] text-stone-600 mt-2 leading-relaxed">
        {result.name ? `کارت ${result.name} ` : 'این کارت '}
        {result.state === 'inactive' ? 'فعلاً غیرفعال است.' : 'بایگانی شده است.'} برای ارتباط با {c.company || 'شرکت'} از راه‌های زیر استفاده کنید.
      </p>
      <div className="mt-5 space-y-2.5 text-start">
        {tel && (
          <a href={`tel:${tel}`} className="flex items-center gap-3 p-3.5 rounded-2xl border border-stone-200 hover:border-red-300 min-h-14">
            <Phone className="w-5 h-5 text-[#D0192A]" aria-hidden="true" />
            <span className="text-[14px] font-bold text-stone-800" dir="ltr">
              {toPersianDigits(c.landline)}
            </span>
          </a>
        )}
        {site && (
          <a href={site} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3.5 rounded-2xl border border-stone-200 hover:border-red-300 min-h-14">
            <Globe className="w-5 h-5 text-[#D0192A]" aria-hidden="true" />
            <span className="text-[14px] font-bold text-stone-800" dir="ltr">
              {String(c.website || site).replace(/^https?:\/\//, '')}
            </span>
          </a>
        )}
        {c.address && (
          <a
            href={c.mapLocation?.googleMapsUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3.5 rounded-2xl border border-stone-200 hover:border-red-300 min-h-14"
          >
            <MapPin className="w-5 h-5 text-[#D0192A] shrink-0" aria-hidden="true" />
            <span className="text-[13px] text-stone-700 leading-relaxed">{toPersianDigits(c.address)}</span>
          </a>
        )}
      </div>
    </main>
  );
};

const NotFound: React.FC = () => (
  <main className="w-full max-w-[430px] bg-white rounded-3xl card-shadow border border-stone-100 p-8 text-center">
    <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
      <UserX className="w-7 h-7 text-stone-500" aria-hidden="true" />
    </div>
    <h1 className="text-[18px] font-black text-stone-900">کارت پیدا نشد</h1>
    <p className="text-[13.5px] text-stone-600 mt-2 leading-relaxed">آدرس این کارت درست نیست یا کارت حذف شده است.</p>
    <a href="/" className="inline-flex items-center justify-center mt-5 min-h-11 px-5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-[13.5px] font-bold">
      صفحه اصلی
    </a>
  </main>
);

export const PublicCardPage: React.FC<{ identifier: string }> = ({ identifier }) => {
  const [result, setResult] = useState<PublicCardResponse | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setResult(null);
    api.getPublicCard(identifier).then((r) => {
      if (!alive) return;
      setResult(r);
      // Old short links keep working; show the current one in the address bar (query string kept for tracking).
      if (r.kind === 'ok' && r.canonicalSlug && r.canonicalSlug.toLowerCase() !== identifier.toLowerCase()) {
        window.history.replaceState(window.history.state, '', `/${r.canonicalSlug}${window.location.search}${window.location.hash}`);
      }
    });
    // Only check the session when this device has logged in before, so visitors make no extra request.
    if (api.hasAdminHint()) {
      api.checkAdminAuth().then((ok) => alive && setIsAdmin(ok));
    }
    return () => {
      alive = false;
    };
  }, [identifier]);

  const profile: EmployeeProfile | null =
    result?.kind === 'ok' ? result.profile : result?.kind === 'offline' ? result.profile : null;

  useEffect(() => {
    if (profile) document.title = `${profile.name}${profile.title ? ` | ${profile.title}` : ''} - ${profile.company || 'رویا طرح داخلی'}`;
  }, [profile]);

  return (
    <div className="min-h-dvh bg-stone-100/90 text-stone-900 flex flex-col items-center justify-center p-3 sm:p-6 pb-24">
      {isAdmin && (
        <div className="w-full max-w-[430px] mb-3 p-2.5 bg-stone-900 text-stone-100 rounded-2xl flex items-center justify-between gap-2 text-[12.5px]">
          <span>شما وارد پنل هستید؛ بازدید شما شمرده نمی‌شود.</span>
          <a href="/admin" className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl bg-white text-stone-900 font-bold">
            <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
            پنل
          </a>
        </div>
      )}

      {result?.kind === 'ok' && result.replacedFrom && (
        <p role="status" className="w-full max-w-[430px] mb-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900 leading-relaxed">
          {result.replacedFrom.name} دیگر در این سمت نیست. از این به بعد {result.profile.name} پاسخگوی شماست.
        </p>
      )}
      {result?.kind === 'offline' && profile && (
        <p role="status" className="w-full max-w-[430px] mb-3 p-2.5 rounded-2xl bg-stone-200 text-[12.5px] text-stone-700 flex items-center gap-2">
          <WifiOff className="w-4 h-4" aria-hidden="true" />
          اینترنت در دسترس نیست؛ آخرین نسخه ذخیره‌شده کارت نشان داده می‌شود.
        </p>
      )}

      {!result ? (
        <CardSkeleton />
      ) : profile ? (
        <main className="w-full max-w-[430px]">
          <DigitalCard
            profile={profile}
            onOpenNavigation={() => setNavOpen(true)}
            onOpenShare={() => setShareOpen(true)}
            onOpenNfc={() => {}}
            isStandalone
            isAdmin={isAdmin}
          />
        </main>
      ) : result.kind === 'unavailable' ? (
        <UnavailablePage result={result} />
      ) : result.kind === 'offline' ? (
        <main className="w-full max-w-[430px] bg-white rounded-3xl card-shadow p-8 text-center">
          <WifiOff className="w-8 h-8 text-stone-500 mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-[17px] font-black">اتصال برقرار نشد</h1>
          <p className="text-[13.5px] text-stone-600 mt-2">اینترنت را بررسی کنید و دوباره امتحان کنید.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 min-h-11 px-5 rounded-xl bg-stone-900 text-white text-[13.5px] font-bold cursor-pointer"
          >
            تلاش دوباره
          </button>
        </main>
      ) : (
        <NotFound />
      )}

      {profile && (
        <>
          <NavigationModal isOpen={navOpen} onClose={() => setNavOpen(false)} profile={profile} />
          <ShareModal isOpen={shareOpen} onClose={() => setShareOpen(false)} profile={profile} />
        </>
      )}
    </div>
  );
};
