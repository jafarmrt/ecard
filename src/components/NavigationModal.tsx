import React from 'react';
import { X, Navigation, MapPin, Copy, Check, ExternalLink, Compass, Settings2 } from 'lucide-react';
import { EmployeeProfile } from '../types';
import { DEFAULT_COORDINATES, formatCoordinateDMS } from '../utils/location';
import { copyToClipboard } from '../utils/clipboard';

interface NavigationModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: EmployeeProfile;
  onOpenLocationSettings?: () => void;
}

export const NavigationModal: React.FC<NavigationModalProps> = ({ 
  isOpen, 
  onClose, 
  profile,
  onOpenLocationSettings 
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  // Exact coordinates: default 35.7757770, 51.4368051
  const lat = profile.mapLocation?.lat ?? DEFAULT_COORDINATES.lat;
  const lng = profile.mapLocation?.lng ?? DEFAULT_COORDINATES.lng;

  const handleCopyAddress = async () => {
    const ok = await copyToClipboard(profile.address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const mapApps = [
    {
      name: 'مسیریاب نشان (Neshan)',
      url: `https://nshn.ir/?lat=${lat}&lng=${lng}`,
      color: 'bg-blue-600 hover:bg-blue-700 text-white',
      badge: 'پیشنهادی در ایران',
    },
    {
      name: 'مسیریاب بلد (Balad)',
      url: `https://balad.ir/location?latitude=${lat}&longitude=${lng}`,
      color: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      badge: '',
    },
    {
      name: 'گوگل مپ (Google Maps)',
      url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      color: 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700',
      badge: 'بین‌المللی',
    },
    {
      name: 'مسیریاب ویز (Waze)',
      url: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
      color: 'bg-cyan-600 hover:bg-cyan-700 text-white',
      badge: '',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 text-slate-100 w-full max-w-md rounded-3xl shadow-2xl relative border border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">مسیریابی به شوروم و دفتر مرکزی</h3>
              <p className="text-xs text-slate-400">{profile.company}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Address Card */}
          <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80 text-sm text-slate-200">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="leading-relaxed text-xs sm:text-sm text-slate-300 block">{profile.address}</span>
                <div className="flex items-center gap-1.5 text-[11px] text-amber-400/90 font-mono" dir="ltr">
                  <Compass className="w-3 h-3 text-amber-400" />
                  <span>{formatCoordinateDMS(lat, lng)} ({lat.toFixed(6)}, {lng.toFixed(6)})</span>
                </div>
              </div>
            </div>
            
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleCopyAddress}
                className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">کپی شد</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    <span>کپی آدرس</span>
                  </>
                )}
              </button>

              {onOpenLocationSettings && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenLocationSettings();
                  }}
                  className="py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="تنظیم مختصات و لوکیشن سفارشی"
                >
                  <Settings2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>تغییر لوکیشن</span>
                </button>
              )}
            </div>
          </div>

          {/* App Links */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-400 px-1">انتخاب اپلیکیشن مسیریابی:</p>
            {mapApps.map((app) => (
              <a
                key={app.name}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full py-3 px-4 rounded-xl flex items-center justify-between font-medium text-sm transition-all active:scale-[0.99] ${app.color}`}
              >
                <div className="flex items-center gap-2">
                  <span>{app.name}</span>
                  {app.badge && (
                    <span className="text-[10px] py-0.5 px-2 bg-white/20 rounded-full font-normal">
                      {app.badge}
                    </span>
                  )}
                </div>
                <ExternalLink className="w-4 h-4 opacity-80" />
              </a>
            ))}
          </div>

          {/* Footer */}
          <div className="pt-2 text-center">
            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              بستن پنجره
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

