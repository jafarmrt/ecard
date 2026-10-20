import React from 'react';
import { 
  Users, 
  Radio, 
  Share2, 
  Edit3, 
  Smartphone, 
  Monitor, 
  Plus, 
  Sparkles,
  QrCode,
  MapPin,
  Server,
  ShieldCheck,
  LayoutDashboard,
  ExternalLink,
  Lock
} from 'lucide-react';
import { EmployeeProfile, ViewMode } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderControlsProps {
  profiles: EmployeeProfile[];
  currentProfile: EmployeeProfile;
  onSelectProfile: (profile: EmployeeProfile) => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onOpenEditModal: () => void;
  onOpenNfcModal: () => void;
  onOpenShareModal: () => void;
  onOpenNewProfileModal: () => void;
  onOpenLocationModal?: () => void;
  isAdmin?: boolean;
  onOpenAdminModal?: () => void;
  onOpenDeployModal?: () => void;
  onSwitchToStandalone?: () => void;
  adminWorkspaceActive?: boolean;
  onToggleAdminWorkspace?: (active: boolean) => void;
}

export const HeaderControls: React.FC<HeaderControlsProps> = ({
  profiles,
  currentProfile,
  onSelectProfile,
  viewMode,
  onChangeViewMode,
  onOpenEditModal,
  onOpenNfcModal,
  onOpenShareModal,
  onOpenNewProfileModal,
  onOpenLocationModal,
  isAdmin = false,
  onOpenAdminModal,
  onOpenDeployModal,
  onSwitchToStandalone,
  adminWorkspaceActive = false,
  onToggleAdminWorkspace,
}) => {
  return (
    <header className="w-full bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-3 sm:px-6 py-2.5 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Left: Brand info in header */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm font-bold text-white tracking-tight">
              سامانه کارت ویزیت هوشمند رویا
            </span>
            {isAdmin ? (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                پنل مدیریت
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full font-medium">
                <Sparkles className="w-3 h-3" />
                NFC & PWA
              </span>
            )}
          </div>

          {/* Mobile Admin & Actions */}
          <div className="flex items-center gap-1.5 md:hidden">
            <PWAInstallButton />
            {onOpenAdminModal && (
              <button
                onClick={onOpenAdminModal}
                className={`p-1.5 rounded-lg text-xs font-medium border ${
                  isAdmin 
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
                title={isAdmin ? 'تنظیمات و امنیت ادمین' : 'ورود به پنل مدیریت'}
              >
                {isAdmin ? 'مدیریت' : 'ورود'}
              </button>
            )}
            {isAdmin && (
              <button
                onClick={onOpenEditModal}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
                title="ویرایش مشخصات"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Middle: Profile Switcher Dropdown & Add */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-center">
          <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 p-1 rounded-xl text-xs">
            <Users className="w-3.5 h-3.5 text-amber-400 mr-1.5 shrink-0" />
            <select
              value={currentProfile.id}
              onChange={(e) => {
                const found = profiles.find((p) => p.id === e.target.value);
                if (found) onSelectProfile(found);
              }}
              className="bg-transparent font-medium text-slate-200 text-xs outline-hidden cursor-pointer py-1 pl-1 max-w-[200px] truncate"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">
                  {p.name} ({p.title.split(' ')[0]} {p.title.split(' ')[1] || ''})
                </option>
              ))}
            </select>
          </div>

          {isAdmin ? (
            <button
              onClick={onOpenNewProfileModal}
              className="p-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="افزودن کارمند جدید فروش"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline text-[11px] font-medium">کارمند جدید</span>
            </button>
          ) : (
            <button
              onClick={onOpenAdminModal}
              className="p-1.5 px-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-amber-400 border border-slate-700/80 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="افزودن کارمند (نیاز به ورود به پنل مدیریت دارد)"
            >
              <Lock className="w-3 h-3 text-amber-400/70" />
              <span className="hidden sm:inline text-[11px] font-medium">کارمند جدید</span>
            </button>
          )}
        </div>

        {/* Right: Quick Action Buttons & View Toggles */}
        <div className="hidden md:flex items-center gap-2">
          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Toggle between Admin Dashboard and Mobile Focus View if Admin */}
          {isAdmin && onToggleAdminWorkspace && (
            <div className="flex items-center bg-slate-800 border border-slate-700 p-1 rounded-xl text-xs">
              <button
                onClick={() => onToggleAdminWorkspace(true)}
                className={`p-1.5 px-2.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  adminWorkspaceActive
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="میز کار مدیریت و تنظیمات"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>میز مدیریت</span>
              </button>

              <button
                onClick={() => onToggleAdminWorkspace(false)}
                className={`p-1.5 px-2.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  !adminWorkspaceActive
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="پیش‌نمایش کارت و فریم موبایل"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>نمای کارت</span>
              </button>
            </div>
          )}

          {/* Server Deployment Files Modal Button */}
          {isAdmin && onOpenDeployModal && (
            <button
              onClick={onOpenDeployModal}
              className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="مشاهده کانفیگ Nginx، PM2، Docker و راهنمای سرور"
            >
              <Server className="w-3.5 h-3.5 text-sky-400" />
              <span>پکیج سرور</span>
            </button>
          )}

          {/* Admin Portal Toggle / Auth Button */}
          {onOpenAdminModal && (
            <button
              onClick={onOpenAdminModal}
              className={`py-1.5 px-2.5 border rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isAdmin 
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={isAdmin ? 'تنظیمات دیتابیس و امنیت ادمین' : 'ورود به پنل مدیریت سرور'}
            >
              <span className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-emerald-400' : 'bg-slate-400'}`} />
              <span>{isAdmin ? 'مدیریت سرور' : 'ورود ادمین'}</span>
            </button>
          )}

          {/* Direct Standalone / Customer Card Link */}
          {onSwitchToStandalone && (
            <button
              onClick={onSwitchToStandalone}
              className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="مشاهده کارت در صفحه اختصاصی مشتری"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              <span>نمای مشتری</span>
            </button>
          )}

          {/* NFC Programming */}
          <button
            onClick={onOpenNfcModal}
            className="py-1.5 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>NFC</span>
          </button>

          {/* Share & QR Code */}
          <button
            onClick={onOpenShareModal}
            className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>اشتراک و QR</span>
          </button>
        </div>
      </div>
    </header>
  );
};
