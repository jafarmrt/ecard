import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  Lock, 
  KeyRound, 
  Eye, 
  EyeOff, 
  Check, 
  AlertCircle, 
  Download, 
  Upload, 
  Server, 
  Database,
  RefreshCw,
  LogOut
} from 'lucide-react';
import { api } from '../services/api';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onAuthSuccess: () => void;
  onLogout: () => void;
  onOpenDeployModal?: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
  onAuthSuccess,
  onLogout,
  onOpenDeployModal,
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'change-password' | 'backup'>(
    isAdmin ? 'change-password' : 'login'
  );

  // Login Form State
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Change Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await api.loginAdmin(password, remember);
      if (res.success) {
        setSuccessMsg('احراز هویت با موفقیت انجام شد.');
        setPassword('');
        setTimeout(() => {
          onAuthSuccess();
          onClose();
        }, 600);
      } else {
        setErrorMsg(res.error || 'رمز عبور نامعتبر است.');
      }
    } catch {
      setErrorMsg('خطا در اتصال به سرور');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword !== confirmPassword) {
      setErrorMsg('رمز عبور جدید و تکرار آن یکسان نیستند.');
      return;
    }

    if (newPassword.length < 4) {
      setErrorMsg('رمز عبور باید حداقل ۴ کاراکتر باشد.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.changeAdminPassword(oldPassword, newPassword);
      if (res.success) {
        setSuccessMsg(res.message || 'رمز عبور با موفقیت تغییر کرد.');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setErrorMsg(res.error || 'خطا در تغییر رمز عبور');
      }
    } catch {
      setErrorMsg('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  const handleExportBackup = async () => {
    const token = api.getAdminToken();
    try {
      const res = await fetch('/api/backup', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `roya-db-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setSuccessMsg('فایل پشتیبان با موفقیت دانلود شد.');
      } else {
        setErrorMsg('خطا در دریافت پشتیبان از سرور');
      }
    } catch {
      setErrorMsg('خطا در ارتباط با سرور');
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const res = await api.restoreBackup(json);
        if (res.success) {
          setSuccessMsg('پایگاه داده با موفقیت از فایل پشتیبان بازگردانی شد.');
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        } else {
          setErrorMsg(res.error || 'فایل پشتیبان نامعتبر است.');
        }
      } catch {
        setErrorMsg('خطا در پردازش فایل JSON پشتیبان');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 text-slate-100 w-full max-w-md rounded-3xl shadow-2xl relative border border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {isAdmin ? 'مدیریت و امنیت سامانه' : 'ورود به پنل مدیریت شرکت رویا'}
              </h3>
              <p className="text-xs text-slate-400">
                {isAdmin ? 'دسترسی ادمین تایید شده است' : 'احراز هویت جهت ویرایش و ثبت اطلاعات'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server & DB Status Bar */}
        <div className="px-5 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <Server className="w-3.5 h-3.5" />
            <span className="font-medium text-[11px]">پایگاه داده سرور شرکت فعال است</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400 text-[10.5px]">
            <Database className="w-3 h-3 text-amber-400" />
            <span>Self-Hosted JSON DB</span>
          </div>
        </div>

        {/* Tabs if Admin */}
        {isAdmin && (
          <div className="flex border-b border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setActiveTab('change-password'); setErrorMsg(null); setSuccessMsg(null); }}
              className={`flex-1 py-3 text-center transition-colors cursor-pointer ${
                activeTab === 'change-password'
                  ? 'border-b-2 border-amber-400 text-amber-400 bg-slate-800/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              تغییر رمز عبور
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('backup'); setErrorMsg(null); setSuccessMsg(null); }}
              className={`flex-1 py-3 text-center transition-colors cursor-pointer ${
                activeTab === 'backup'
                  ? 'border-b-2 border-amber-400 text-amber-400 bg-slate-800/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              پشتیبان‌گیری و بازیابی
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 space-y-4">
          
          {/* Notifications */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/60 border border-rose-700/60 text-rose-300 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tab 1: Login Form (When not logged in) */}
          {!isAdmin && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  رمز عبور مدیریت (Admin Password):
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
                    className="w-full pr-9 pl-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white font-mono text-sm tracking-widest placeholder:tracking-normal placeholder:font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  ورود ویژه مدیران سامانه جهت اعمال تغییرات در سرور و پایگاه داده
                </p>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-amber-400"
                  />
                  <span>مرا به خاطر بسپار</span>
                </label>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-xs transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <KeyRound className="w-4 h-4 text-slate-950" />
                  )}
                  <span>{loading ? 'در حال ورود...' : 'ورود به پنل مدیریت'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Tab 2: Change Password (When logged in) */}
          {isAdmin && activeTab === 'change-password' && (
            <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">رمز عبور فعلی:</label>
                <input
                  type="password"
                  dir="ltr"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">رمز عبور جدید:</label>
                <input
                  type="password"
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="حداقل ۴ کاراکتر"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">تکرار رمز عبور جدید:</label>
                <input
                  type="password"
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl focus:outline-hidden focus:border-amber-500 text-white font-mono text-sm"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                  className="py-2.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl font-medium text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج از ادمین</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4 text-slate-950" />
                  <span>{loading ? 'در حال ثبت...' : 'تغییر رمز عبور'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Tab 3: Backup & Restore */}
          {isAdmin && activeTab === 'backup' && (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-800/60 rounded-2xl border border-slate-700 space-y-2">
                <span className="font-bold text-white block">دانلود نسخه پشتیبان (Backup):</span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  ذخیره تمام اطلاعات کارمندان، مختصات و تنظیمات پایگاه داده در قالب یک فایل JSON.
                </p>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-amber-400" />
                  <span>دانلود فایل پشتیبان پایگاه داده</span>
                </button>
              </div>

              <div className="p-3.5 bg-slate-800/60 rounded-2xl border border-slate-700 space-y-2">
                <span className="font-bold text-white block">بازیابی پایگاه داده (Restore):</span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  بارگذاری فایل پشتیبان JSON قبلی بر روی سرور و بازگردانی اطلاعات.
                </p>
                <label className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer">
                  <Upload className="w-4 h-4 text-slate-300" />
                  <span>انتخاب فایل JSON پشتیبان...</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>

              {onOpenDeployModal && (
                <div className="p-3.5 bg-sky-950/30 rounded-2xl border border-sky-800/40 space-y-2">
                  <span className="font-bold text-sky-300 block">پیکربندی و فایل‌های استقرار سرور:</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    مشاهده تنظیمات Nginx، سرویس PM2، فایل Dockerfile و دستورات مدیریت سرور لینوکس.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDeployModal();
                    }}
                    className="w-full py-2.5 px-3 bg-sky-900/40 hover:bg-sky-800/50 text-sky-200 border border-sky-700/60 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Server className="w-4 h-4 text-sky-400" />
                    <span>مشاهده پکیج و تنظیمات سرور</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
