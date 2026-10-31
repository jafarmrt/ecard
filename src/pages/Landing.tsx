import React, { useEffect, useState } from 'react';
import { Lock, LayoutDashboard } from 'lucide-react';
import { RoyaLogo } from '../components/RoyaLogo';
import { api } from '../services/api';

/** Public home page: visitors only see the brand; the staff list is in the admin panel. */
export const Landing: React.FC = () => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    document.title = 'کارت ویزیت دیجیتال رویا طرح داخلی';
    if (api.hasAdminHint()) void api.checkAdminAuth().then(setIsAdmin);
  }, []);

  return (
    <div className="min-h-dvh bg-stone-100 flex flex-col items-center justify-center p-4 text-stone-900">
      <main className="w-full max-w-[420px] bg-white rounded-3xl card-shadow border border-stone-200/80 p-8 flex flex-col items-center text-center">
        <RoyaLogo size="md" />
        <h1 className="text-[17px] font-black text-stone-900 mt-4 mb-2">کارت ویزیت دیجیتال رویا طرح داخلی</h1>
        <p className="text-[14px] text-stone-600 max-w-[300px] leading-relaxed mb-6">
          برای دیدن کارت هر کارشناس، کد QR یا کارت NFC او را اسکن کنید یا لینکی را که برایتان فرستاده باز کنید.
        </p>
        <a
          href="https://www.royaco.com"
          className="inline-flex items-center justify-center min-h-12 px-6 bg-[#D0192A] hover:bg-[#B51221] text-white text-[14px] font-bold rounded-2xl transition-colors shadow-sm"
        >
          ورود به وب‌سایت رویا
        </a>
        <a
          href="/admin"
          className="mt-6 inline-flex items-center gap-1.5 min-h-11 px-3 text-[13px] text-stone-600 hover:text-stone-900 underline underline-offset-4"
        >
          {isAdmin ? <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> : <Lock className="w-4 h-4" aria-hidden="true" />}
          {isAdmin ? 'رفتن به پنل مدیریت' : 'ورود مدیر سامانه'}
        </a>
      </main>
    </div>
  );
};
