import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Navigation, 
  Compass, 
  Crosshair, 
  RotateCcw, 
  Save, 
  Check, 
  ExternalLink, 
  AlertCircle,
  Building,
  Layers
} from 'lucide-react';
import { EmployeeProfile } from '../types';
import { DEFAULT_COORDINATES, LOCATION_PRESETS, buildMapUrls, formatCoordinateDMS } from '../utils/location';

interface LocationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: EmployeeProfile;
  onSaveLocation: (updatedLocation: EmployeeProfile['mapLocation'], newAddress?: string) => void;
}

export const LocationSettingsModal: React.FC<LocationSettingsModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSaveLocation,
}) => {
  const initialLat = profile.mapLocation?.lat ?? DEFAULT_COORDINATES.lat;
  const initialLng = profile.mapLocation?.lng ?? DEFAULT_COORDINATES.lng;
  const initialTitle = profile.mapLocation?.title ?? DEFAULT_COORDINATES.title;

  const [lat, setLat] = useState<number>(initialLat);
  const [lng, setLng] = useState<number>(initialLng);
  const [title, setTitle] = useState<string>(initialTitle);
  const [address, setAddress] = useState<string>(profile.address || DEFAULT_COORDINATES.address);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [geoMessage, setGeoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  // Handle GPS detection
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
        const currentLat = Number(pos.coords.latitude.toFixed(7));
        const currentLng = Number(pos.coords.longitude.toFixed(7));
        setLat(currentLat);
        setLng(currentLng);
        setIsLocating(false);
        setGeoMessage({
          type: 'success',
          text: `موقعیت GPS با دقت بالا ثبت شد (${currentLat}, ${currentLng})`,
        });
      },
      (err) => {
        setIsLocating(false);
        let msg = 'دسترسی به لوکیشن داده نشد.';
        if (err.code === 1) msg = 'اجازه دسترسی به لوکیشن توسط کاربر رد شد.';
        else if (err.code === 2) msg = 'سیگنال موقعیت مکانی در دسترس نیست.';
        else if (err.code === 3) msg = 'زمان پاسخ‌دهی GPS به پایان رسید.';
        setGeoMessage({ type: 'error', text: msg });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleResetToRoyaDefault = () => {
    setLat(DEFAULT_COORDINATES.lat);
    setLng(DEFAULT_COORDINATES.lng);
    setTitle(DEFAULT_COORDINATES.title);
    setAddress(DEFAULT_COORDINATES.address);
    setGeoMessage({
      type: 'success',
      text: 'مختصات به لوکیشن رسمی دفتر مرکزی رویا (35.7757770, 51.4368051) بازنشانی شد.',
    });
  };

  const handleSelectPreset = (preset: typeof LOCATION_PRESETS[0]) => {
    setLat(preset.lat);
    setLng(preset.lng);
    setTitle(preset.name);
    setAddress(preset.address);
    setGeoMessage({
      type: 'success',
      text: `موقعیت «${preset.name}» اعمال شد.`,
    });
  };

  const mapUrls = buildMapUrls(lat, lng);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const urls = buildMapUrls(lat, lng);
    onSaveLocation(
      {
        lat,
        lng,
        title: title || DEFAULT_COORDINATES.title,
        ...urls,
      },
      address
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 text-slate-100 w-full max-w-lg rounded-3xl shadow-2xl relative border border-slate-800 max-h-[92vh] overflow-y-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">تنظیمات موقعیت مکانی و مسیریابی</h3>
              <p className="text-xs text-slate-400">تنظیم مختصات جغرافیایی (عرض و طول جغرافیایی)</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs text-slate-300">
          
          {/* Quick Actions Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleGetGpsLocation}
              disabled={isLocating}
              className="py-2.5 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Crosshair className={`w-4 h-4 text-amber-400 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'در حال دریافت موقعیت GPS...' : 'دریافت لوکیشن من با GPS'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetToRoyaDefault}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>لوکیشن پیش‌فرض دفتر رویا</span>
            </button>
          </div>

          {/* Feedback Message */}
          {geoMessage && (
            <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs animate-in fade-in ${
              geoMessage.type === 'success' 
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300' 
                : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
            }`}>
              {geoMessage.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{geoMessage.text}</span>
            </div>
          )}

          {/* Preset Locations */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-300">مکان‌های آماده و شعب رویا:</label>
            <div className="grid grid-cols-1 gap-1.5">
              {LOCATION_PRESETS.map((preset) => {
                const isActive = Math.abs(lat - preset.lat) < 0.0001 && Math.abs(lng - preset.lng) < 0.0001;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`w-full text-right p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                      isActive 
                        ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-xs' 
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Building className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="font-medium text-xs">{preset.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 dir-ltr">
                      {preset.lat.toFixed(4)}, {preset.lng.toFixed(4)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coordinate Inputs */}
          <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/90 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/80">
              <span className="font-bold text-white text-xs flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                مختصات دقیق جغرافیایی (Latitude & Longitude)
              </span>
              <span className="text-[10.5px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20" dir="ltr">
                {formatCoordinateDMS(lat, lng)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  عرض جغرافیایی (Latitude):
                </label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  طول جغرافیایی (Longitude):
                </label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={lng}
                  onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                عنوان لوکیشن (مثال: شرکت رویا طرح داخلی - برج نگین قلهک):
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                متن کامل آدرس پستی:
              </label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white text-xs leading-relaxed"
              />
            </div>
          </div>

          {/* Test Live Links */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 block px-1">
              تست فوری موقعیت انتخاب شده در اپلیکیشن‌های نقشه:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <a
                href={mapUrls.neshanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-center text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
              >
                <span>نشان</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <a
                href={mapUrls.baladUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-center text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
              >
                <span>بلد</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <a
                href={mapUrls.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-center text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
              >
                <span>گوگل مپ</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <a
                href={mapUrls.wazeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-xl text-center text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
              >
                <span>ویز</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Footer Actions */}
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
              <span>ذخیره و اعمال لوکیشن</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
