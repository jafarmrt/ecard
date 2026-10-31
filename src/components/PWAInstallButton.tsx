import React, { useState } from 'react';
import { Download, Smartphone, X, Share, PlusSquare } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const closeIOSGuide = React.useCallback(() => setShowIOSGuide(false), []);
  useEscapeKey(showIOSGuide, closeIOSGuide);

  // If already running inside standalone installed PWA, do not show
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        id="pwa-install-btn"
        className={className || `flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/10 transition-all cursor-pointer`}
      >
        <Download className="w-3.5 h-3.5 text-slate-950" />
        <span>نصب اپلیکیشن رویا</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          id="pwa-ios-install-btn"
          className={className || `flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 font-medium text-xs transition-all cursor-pointer`}
        >
          <Smartphone className="w-3.5 h-3.5 text-amber-400" />
          <span>نصب در آیفون / iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">نصب کارت هوشمند روی آیفون</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="بستن"
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3.5 text-xs text-slate-300">
                <div className="flex items-start gap-3 p-3 bg-slate-800/60 rounded-2xl border border-slate-700/60">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    ۱
                  </div>
                  <div>
                    در مرورگر <span className="text-white font-semibold">Safari</span> روی دکمه <span className="inline-flex items-center gap-1 text-amber-300 font-semibold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700"><Share className="w-3 h-3" /> Share</span> در نوار پایین ضربه بزنید.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-800/60 rounded-2xl border border-slate-700/60">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    ۲
                  </div>
                  <div>
                    در منوی باز شده به پایین اسکرول کرده و گزینه <span className="inline-flex items-center gap-1 text-amber-300 font-semibold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700"><PlusSquare className="w-3 h-3" /> Add to Home Screen</span> را انتخاب کنید.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-800/60 rounded-2xl border border-slate-700/60">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    ۳
                  </div>
                  <div>
                    روی <span className="text-white font-semibold">Add</span> در گوشه بالا ضربه بزنید. آیکون کارت ویزیت رویا روی صفحه اصلی گوشی اضافه می‌شود.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
