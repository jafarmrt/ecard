import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Building2, 
  MapPin, 
  ShieldCheck, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  ExternalLink, 
  Copy, 
  QrCode, 
  Radio, 
  Download, 
  Upload, 
  KeyRound, 
  Server, 
  Database, 
  Sparkles, 
  Check, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Globe, 
  BookOpen, 
  Instagram, 
  Mail, 
  Phone, 
  PhoneCall, 
  Navigation, 
  LogOut,
  ChevronLeft,
  Camera,
  Layers,
  ArrowUpRight,
  AlignRight,
  AlignLeft,
  FileText,
  FileDown,
  BarChart3,
  TrendingUp,
  MessageCircle,
  Activity,
  Link as LinkIcon,
  RefreshCw,
  UserPlus,
  Contact
} from 'lucide-react';
import { EmployeeProfile, CustomerLead } from '../types';
import { api } from '../services/api';
import { copyToClipboard } from '../utils/clipboard';
import { getDirectCardUrl } from '../utils/url';
import { downloadCatalogPdf } from '../utils/catalog';
import { PdfUploader } from './PdfUploader';

interface AdminDashboardProps {
  profiles: EmployeeProfile[];
  currentProfile: EmployeeProfile;
  onSelectProfile: (profile: EmployeeProfile) => void;
  onOpenEditModal: () => void;
  onOpenNewProfileModal: () => void;
  onOpenLocationModal: () => void;
  onOpenShareModal: () => void;
  onOpenNfcModal: () => void;
  onOpenDeployModal: () => void;
  onUpdateProfile: (profile: EmployeeProfile) => Promise<void>;
  onReplaceAllProfiles?: (profiles: EmployeeProfile[]) => void;
  onDeleteProfile: (id: string) => Promise<void>;
  onResetToDefault: () => Promise<void>;
  onLogout: () => void;
  showToast: (msg: string) => void;
  onSwitchToVisitorView: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  profiles,
  currentProfile,
  onSelectProfile,
  onOpenEditModal,
  onOpenNewProfileModal,
  onOpenLocationModal,
  onOpenShareModal,
  onOpenNfcModal,
  onOpenDeployModal,
  onUpdateProfile,
  onReplaceAllProfiles,
  onDeleteProfile,
  onResetToDefault,
  onLogout,
  showToast,
  onSwitchToVisitorView,
}) => {
  const [activeTab, setActiveTab] = useState<'staff' | 'leads' | 'analytics' | 'brand' | 'location' | 'server'>('staff');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [leads, setLeads] = useState<CustomerLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [analyticsData, setAnalyticsData] = useState<{
    totalViews: number;
    totalNfcTaps: number;
    totalQrScans: number;
    totalCalls: number;
    totalWhatsapps: number;
    totalCatalogDownloads: number;
    totalVcardDownloads: number;
    totalMapClicks: number;
    totalLeads?: number;
    totalInteractions?: number;
    totalProfiles?: number;
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Security Form State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Brand Form State (based on current profile or global defaults)
  const [brandCompany, setBrandCompany] = useState(currentProfile.company || 'شرکت رویا طرح داخلی');
  const [brandWebsite, setBrandWebsite] = useState(currentProfile.website || 'www.royaco.com');
  const [brandCatalog, setBrandCatalog] = useState(currentProfile.catalogUrl || 'کاتالوگ جامع محصولات رویا');
  const [brandCatalogPdfUrl, setBrandCatalogPdfUrl] = useState(currentProfile.catalogPdfUrl || '/roya-catalog.pdf');
  const [brandLayoutDirection, setBrandLayoutDirection] = useState<'rtl' | 'ltr'>(currentProfile.layoutDirection || 'rtl');
  const [brandInstagram, setBrandInstagram] = useState(currentProfile.instagram || 'royaco');
  const [brandSaving, setBrandSaving] = useState(false);

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const data = await api.getAnalyticsSummary();
      if (data && data.success && data.summary) {
        setAnalyticsData(data.summary);
      }
    } catch {
      // fallback to summing profile props
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const fetchLeads = async () => {
    setLeadsLoading(true);
    try {
      const res = await api.getLeads();
      if (res.success && Array.isArray(res.leads)) {
        setLeads(res.leads);
      }
    } catch {
      // ignore
    } finally {
      setLeadsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalytics();
    } else if (activeTab === 'leads') {
      fetchLeads();
    }
  }, [activeTab]);

  const filteredLeads = leads.filter((l) => {
    const q = leadSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      l.customerName.toLowerCase().includes(q) ||
      l.customerMobile.includes(q) ||
      (l.customerCompany && l.customerCompany.toLowerCase().includes(q)) ||
      (l.note && l.note.toLowerCase().includes(q)) ||
      (l.profileName && l.profileName.toLowerCase().includes(q))
    );
  });

  const handleDeleteLead = async (id: string) => {
    const res = await api.deleteLead(id);
    if (res.success) {
      setLeads((prev) => prev.filter((l) => l.id !== id));
      showToast('رکورد مشتری با موفقیت حذف شد.');
    } else {
      showToast(res.error || 'خطا در حذف رکورد مشتری');
    }
  };

  const handleExportLeadsCsv = () => {
    if (leads.length === 0) {
      showToast('هنوز سرنخی برای خروجی اکسل ثبت نشده است.');
      return;
    }

    const headers = ['نام مشتری', 'شماره موبایل', 'شرکت / مجموعه', 'کارشناس مربوطه', 'موضوع و یادداشت', 'تاریخ ثبت'];
    const escapeCsv = (val?: string) => {
      const str = String(val || '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredLeads.map((l) => [
      escapeCsv(l.customerName),
      escapeCsv(l.customerMobile),
      escapeCsv(l.customerCompany || '-'),
      escapeCsv(l.profileName),
      escapeCsv(l.note || '-'),
      escapeCsv(new Date(l.createdAt).toLocaleString('fa-IR')),
    ]);

    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roya-customer-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast('فایل اکسل (CSV) سرنخ‌های فروش با موفقیت دانلود شد.');
  };

  const handleDownloadCustomerVcf = (lead: CustomerLead) => {
    const vcfLines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN;CHARSET=UTF-8:${lead.customerName}`,
      `N;CHARSET=UTF-8:${lead.customerName};;;;`,
      lead.customerCompany ? `ORG;CHARSET=UTF-8:${lead.customerCompany}` : '',
      `TEL;TYPE=CELL,VOICE,PREF:${lead.customerMobile}`,
      `NOTE;CHARSET=UTF-8:ثبت شده از طریق کارت ویزیت دیجیتال ${lead.profileName}${lead.note ? ` - یادداشت: ${lead.note}` : ''}`,
      'END:VCARD',
    ]
      .filter(Boolean)
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + vcfLines], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Customer_${lead.customerName.replace(/\s+/g, '_')}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`فایل مخاطب ${lead.customerName} دانلود شد.`);
  };

  // Filter profiles based on search
  const filteredProfiles = profiles.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q) ||
      p.mobile.includes(q) ||
      (p.department && p.department.toLowerCase().includes(q))
    );
  });

  const handleCopyLink = async (profile: EmployeeProfile) => {
    const url = getDirectCardUrl(profile);
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedId(profile.id);
      showToast(`لینک مستقیم کارت ${profile.name} کپی شد.`);
      setTimeout(() => setCopiedId(null), 2500);
    } else {
      showToast(`لینک مستقیم: ${url}`);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'رمز عبور جدید و تکرار آن یکسان نیستند.' });
      return;
    }
    if (newPassword.length < 4) {
      setPasswordMsg({ type: 'error', text: 'رمز عبور باید حداقل ۴ کاراکتر باشد.' });
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await api.changeAdminPassword(oldPassword, newPassword);
      if (res.success) {
        setPasswordMsg({ type: 'success', text: res.message || 'رمز عبور با موفقیت تغییر یافت.' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordMsg({ type: 'error', text: res.error || 'خطا در تغییر رمز عبور' });
      }
    } catch {
      setPasswordMsg({ type: 'error', text: 'خطا در اتصال به سرور' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSaveBrandToAll = async () => {
    setBrandSaving(true);
    try {
      const res = await api.updateBrandForAll({
        company: brandCompany,
        website: brandWebsite,
        websiteUrl: brandWebsite.startsWith('http') ? brandWebsite : `https://${brandWebsite}`,
        catalogUrl: brandCatalog,
        catalogPdfUrl: brandCatalogPdfUrl,
        layoutDirection: brandLayoutDirection,
        instagram: brandInstagram,
        instagramUrl: `https://instagram.com/${brandInstagram.replace(/^@/, '')}`,
      });

      if (res.success && res.profiles) {
        if (onReplaceAllProfiles) {
          onReplaceAllProfiles(res.profiles);
        }
        showToast(res.message || 'اطلاعات برند، کاتالوگ PDF و جهت چیدمان با موفقیت برای تمام پرسنل اعمال شد.');
      } else {
        showToast(res.error || 'خطا در به‌روزرسانی اطلاعات برند');
      }
    } catch {
      showToast('خطا در به‌روزرسانی اطلاعات برند');
    } finally {
      setBrandSaving(false);
    }
  };

  const handleBackupDownload = async () => {
    showToast('در حال آماده‌سازی و دانلود فایل پشتیبان...');
    const res = await api.downloadBackup();
    if (res.success) {
      showToast('فایل پشتیبان database.json با موفقیت دانلود شد.');
    } else {
      showToast(res.error || 'خطا در دانلود فایل پشتیبان دیتابیس');
    }
  };

  const handleBackupRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const res = await api.restoreBackup(json);
        if (res.success) {
          if (res.profiles && onReplaceAllProfiles) {
            onReplaceAllProfiles(res.profiles);
          }
          showToast('پشتیبان پایگاه داده با موفقیت بازگردانی شد.');
        } else {
          showToast(res.error || 'فایل پشتیبان نامعتبر است.');
        }
      } catch {
        showToast('خطا در خواندن فایل JSON پشتیبان');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in duration-300">
      {/* Top Banner / Dashboard Header */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
                میز مدیریت هوشمند رویا
              </h1>
              <span className="text-[11px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold">
                ادمین فعال
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              مدیریت یکپارچه کارت‌های ویزیت NFC، وب‌سایت، کاتالوگ و مسیریابی شعب
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onSwitchToVisitorView}
            className="py-2 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
            title="مشاهده ظاهر کارت در صفحه اختصاصی مشتری"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            <span>مشاهده نمای مشتری</span>
          </button>

          <button
            onClick={onLogout}
            className="py-2 px-3 bg-red-600/15 hover:bg-red-600/25 text-red-400 hover:text-red-300 border border-red-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            title="خروج امن از پنل مدیریت"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 px-5 sm:px-6 pt-4 border-b border-slate-800 bg-slate-900/50 overflow-x-auto">
        <button
          onClick={() => setActiveTab('staff')}
          className={`flex items-center gap-2 pb-3.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'staff'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>پرسنل و کارت‌ها ({profiles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('leads')}
          className={`flex items-center gap-2 pb-3.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'leads'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>مشتریان و سرنخ‌ها</span>
          {leads.length > 0 && (
            <span className="text-[10px] bg-emerald-500 text-slate-950 font-black px-1.5 py-0.5 rounded-full">
              {leads.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 pb-3.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'analytics'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>آمار و تعاملات هوشمند</span>
        </button>

        <button
          onClick={() => setActiveTab('brand')}
          className={`flex items-center gap-2 pb-3.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'brand'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>اطلاعات برند و سازمان</span>
        </button>

        <button
          onClick={() => setActiveTab('location')}
          className={`flex items-center gap-2 pb-3.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'location'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>موقعیت مکانی و مسیریابی شعب</span>
        </button>

        <button
          onClick={() => setActiveTab('server')}
          className={`flex items-center gap-2 pb-3.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'server'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>امنیت، دیتابیس و سرور</span>
        </button>
      </div>

      {/* Tab Contents Area */}
      <div className="p-5 sm:p-6 flex-1 overflow-y-auto">
        
        {/* TAB 1: STAFF & DIGITAL CARDS MANAGEMENT */}
        {activeTab === 'staff' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Search Bar + Add Staff Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="جستجوی نام، سمت، شماره یا واحد..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-10 pl-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-medium"
                />
              </div>

              <button
                onClick={onOpenNewProfileModal}
                className="w-full sm:w-auto py-2.5 px-4 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>افزودن کارشناس جدید</span>
              </button>
            </div>

            {/* Profiles Grid / List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredProfiles.map((p) => {
                const isSelected = p.id === currentProfile.id;
                return (
                  <div
                    key={p.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-slate-800/95 border-amber-500/60 shadow-lg ring-1 ring-amber-500/20'
                        : 'bg-slate-800/50 border-slate-700/60 hover:border-slate-600 hover:bg-slate-800/80'
                    }`}
                  >
                    {/* Top row: Avatar + Name + Title */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-700 bg-slate-700 flex items-center justify-center shrink-0">
                          {p.avatarUrl ? (
                            <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-base font-bold text-amber-400">{p.name.slice(0, 1)}</span>
                          )}
                        </div>
                        <div className="flex flex-col overflow-hidden text-right">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white truncate">{p.name}</span>
                            {isSelected && (
                              <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded-md">
                                در حال نمایش
                              </span>
                            )}
                            {p.layoutDirection === 'ltr' ? (
                              <span className="text-[10px] bg-sky-500/15 text-sky-400 border border-sky-500/30 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                <AlignLeft className="w-2.5 h-2.5" />
                                <span>چپ‌چین LTR</span>
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                <AlignRight className="w-2.5 h-2.5" />
                                <span>راست‌چین RTL</span>
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 truncate mt-0.5">{p.title}</span>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[11px] font-mono text-slate-400" dir="ltr">
                              {p.mobile}
                            </span>
                            <span className="text-[10.5px] font-mono text-amber-300/90 bg-slate-900/90 px-2 py-0.5 rounded-md border border-slate-700 flex items-center gap-1" dir="ltr">
                              <LinkIcon className="w-2.5 h-2.5 text-amber-400" />
                              <span>/{p.slug || p.id}</span>
                            </span>
                          </div>

                          {/* Quick Engagement Micro-Stats */}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[10.5px]">
                            <span className="bg-slate-900/80 text-slate-300 px-1.5 py-0.5 rounded-md border border-slate-700/60 flex items-center gap-1">
                              <Eye className="w-3 h-3 text-sky-400" />
                              <span>{p.analytics?.views || 0} بازدید</span>
                            </span>
                            <span className="bg-slate-900/80 text-slate-300 px-1.5 py-0.5 rounded-md border border-slate-700/60 flex items-center gap-1">
                              <Radio className="w-3 h-3 text-amber-400" />
                              <span>{p.analytics?.nfcTaps || 0} NFC</span>
                            </span>
                            <span className="bg-slate-900/80 text-slate-300 px-1.5 py-0.5 rounded-md border border-slate-700/60 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-emerald-400" />
                              <span>{p.analytics?.callClicks || 0} تماس</span>
                            </span>
                            <span className="bg-slate-900/80 text-slate-300 px-1.5 py-0.5 rounded-md border border-slate-700/60 flex items-center gap-1">
                              <Download className="w-3 h-3 text-purple-400" />
                              <span>{p.analytics?.vcardDownloads || 0} vCard</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Select Button */}
                      {!isSelected && (
                        <button
                          onClick={() => onSelectProfile(p)}
                          className="py-1 px-2.5 bg-slate-700 hover:bg-amber-500 hover:text-slate-950 text-slate-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                        >
                          انتخاب
                        </button>
                      )}
                    </div>

                    {/* Bottom Action Toolbar */}
                    <div className="pt-2.5 border-t border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Edit Button */}
                        <button
                          onClick={() => {
                            onSelectProfile(p);
                            onOpenEditModal();
                          }}
                          className="p-2 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="ویرایش کامل مشخصات"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-[11px] font-medium">ویرایش</span>
                        </button>

                        {/* Copy Direct Card Link */}
                        <button
                          onClick={() => handleCopyLink(p)}
                          className="p-2 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="کپی لینک اختصاصی کارت"
                        >
                          {copiedId === p.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-sky-400" />
                          )}
                          <span className="text-[11px] font-medium">کپی لینک</span>
                        </button>

                        {/* Direct Open Card View */}
                        <a
                          href={getDirectCardUrl(p)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-xl bg-slate-700/70 hover:bg-amber-500/20 text-slate-200 hover:text-amber-300 text-xs flex items-center gap-1.5 transition-colors"
                          title="مشاهده زنده کارت ویزیت مشتری"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-[11px] font-medium">نمایش کارت</span>
                        </a>

                        {/* NFC Button */}
                        <button
                          onClick={() => {
                            onSelectProfile(p);
                            onOpenNfcModal();
                          }}
                          className="p-2 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="رایت روی تگ و کارت NFC"
                        >
                          <Radio className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-[11px] font-medium">NFC</span>
                        </button>

                        {/* QR Modal */}
                        <button
                          onClick={() => {
                            onSelectProfile(p);
                            onOpenShareModal();
                          }}
                          className="p-2 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="کیوآرکد و دانلود کارت"
                        >
                          <QrCode className="w-3.5 h-3.5 text-slate-300" />
                          <span className="text-[11px] font-medium">QR</span>
                        </button>
                      </div>

                      {/* Delete Button */}
                      {profiles.length > 1 && (
                        <button
                          onClick={() => {
                            if (confirm(`آیا از حذف کارت کارشناس "${p.name}" مطمئن هستید؟`)) {
                              onDeleteProfile(p.id);
                            }
                          }}
                          className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                          title="حذف کارشناس"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredProfiles.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-xs">
                هیچ کاربری با عبارت جستجوی وارد شده یافت نشد.
              </div>
            )}
          </div>
        )}

        {/* TAB: ANALYTICS & INSIGHTS */}
        {activeTab === 'analytics' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Header & Refresh */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <span>آمار و تحلیل تعاملات کارت‌های ویزیت دیجیتال</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  گزارش رویدادهای زنده: تپ‌های NFC، اسکن‌های QR، برقراری تماس و دانلود کاتالوگ
                </p>
              </div>

              <button
                onClick={fetchAnalytics}
                disabled={analyticsLoading}
                className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${analyticsLoading ? 'animate-spin' : ''}`} />
                <span>بروزرسانی آمار</span>
              </button>
            </div>

            {/* Top KPI Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>کل بازدیدهای کارت</span>
                  <Eye className="w-4 h-4 text-sky-400" />
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black text-white font-mono">
                    {analyticsData?.totalViews || profiles.reduce((acc, p) => acc + (p.analytics?.views || 0), 0)}
                  </span>
                  <span className="text-[10px] text-slate-400 mr-1.5">مرتبه</span>
                </div>
              </div>

              <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>تپ‌های NFC</span>
                  <Radio className="w-4 h-4 text-amber-400" />
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black text-amber-400 font-mono">
                    {analyticsData?.totalNfcTaps || profiles.reduce((acc, p) => acc + (p.analytics?.nfcTaps || 0), 0)}
                  </span>
                  <span className="text-[10px] text-slate-400 mr-1.5">تپ مستقیم</span>
                </div>
              </div>

              <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>اسکن کیوآرکد (QR)</span>
                  <QrCode className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    {analyticsData?.totalQrScans || profiles.reduce((acc, p) => acc + (p.analytics?.qrScans || 0), 0)}
                  </span>
                  <span className="text-[10px] text-slate-400 mr-1.5">اسکن</span>
                </div>
              </div>

              <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>تماس‌های مستقیم</span>
                  <PhoneCall className="w-4 h-4 text-rose-400" />
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black text-rose-400 font-mono">
                    {analyticsData?.totalCalls ?? profiles.reduce((acc, p) => acc + (p.analytics?.callClicks || 0), 0)}
                  </span>
                  <span className="text-[10px] text-slate-400 mr-1.5">کلیک تماس</span>
                </div>
              </div>
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-slate-800/50 rounded-2xl border border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block">پیام‌های واتساپ</span>
                  <span className="text-lg font-bold text-white font-mono mt-0.5 block">
                    {analyticsData?.totalWhatsapps ?? profiles.reduce((acc, p) => acc + (p.analytics?.whatsappClicks || 0), 0)}
                  </span>
                </div>
                <MessageCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              </div>

              <div className="p-3.5 bg-slate-800/50 rounded-2xl border border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block">دانلود کاتالوگ PDF</span>
                  <span className="text-lg font-bold text-white font-mono mt-0.5 block">
                    {analyticsData?.totalCatalogDownloads || profiles.reduce((acc, p) => acc + (p.analytics?.catalogDownloads || 0), 0)}
                  </span>
                </div>
                <FileDown className="w-5 h-5 text-amber-400 shrink-0" />
              </div>

              <div className="p-3.5 bg-slate-800/50 rounded-2xl border border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block">افزودن به مخاطبین (vCard)</span>
                  <span className="text-lg font-bold text-white font-mono mt-0.5 block">
                    {analyticsData?.totalVcardDownloads || profiles.reduce((acc, p) => acc + (p.analytics?.vcardDownloads || 0), 0)}
                  </span>
                </div>
                <Download className="w-5 h-5 text-purple-400 shrink-0" />
              </div>

              <div className="p-3.5 bg-slate-800/50 rounded-2xl border border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block">درخواست‌های مسیریابی</span>
                  <span className="text-lg font-bold text-white font-mono mt-0.5 block">
                    {analyticsData?.totalMapClicks || profiles.reduce((acc, p) => acc + (p.analytics?.mapClicks || 0), 0)}
                  </span>
                </div>
                <Navigation className="w-5 h-5 text-sky-400 shrink-0" />
              </div>
            </div>

            {/* Performance Ranking by Staff Table */}
            <div className="bg-slate-800/60 rounded-2xl border border-slate-700/80 overflow-hidden">
              <div className="p-4 bg-slate-900/80 border-b border-slate-700/80 flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  <span>تفکیک عملکرد و تعاملات به ازای هر کارشناس</span>
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-medium border-b border-slate-800">
                    <tr>
                      <th className="p-3">کارشناس</th>
                      <th className="p-3 text-center">شناسه آدرس</th>
                      <th className="p-3 text-center">بازدید</th>
                      <th className="p-3 text-center">تپ NFC</th>
                      <th className="p-3 text-center">اسکن QR</th>
                      <th className="p-3 text-center">تماس</th>
                      <th className="p-3 text-center">واتساپ</th>
                      <th className="p-3 text-center">دانلود کاتالوگ</th>
                      <th className="p-3 text-center">دانلود مخاطب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {profiles.map((p) => {
                      const an = p.analytics || {};
                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-700 shrink-0 flex items-center justify-center font-bold text-amber-400">
                              {p.avatarUrl ? (
                                <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                              ) : (
                                p.name.slice(0, 1)
                              )}
                            </div>
                            <div>
                              <span className="font-bold block text-white">{p.name}</span>
                              <span className="text-[10.5px] text-slate-400 block">{p.title}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center font-mono text-amber-300/90" dir="ltr">
                            /{p.slug || p.id}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-sky-400">{an.views || 0}</td>
                          <td className="p-3 text-center font-mono font-bold text-amber-400">{an.nfcTaps || 0}</td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-400">{an.qrScans || 0}</td>
                          <td className="p-3 text-center font-mono font-bold text-rose-400">{an.callClicks || 0}</td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-300">{an.whatsappClicks || 0}</td>
                          <td className="p-3 text-center font-mono font-bold text-amber-300">{an.catalogDownloads || 0}</td>
                          <td className="p-3 text-center font-mono font-bold text-purple-400">{an.vcardDownloads || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: CUSTOMER LEADS & CONTACT EXCHANGE */}
        {activeTab === 'leads' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-400" />
                  <span>بانک شماره و سرنخ‌های فروش ثبت‌شده توسط مشتریان ({leads.length})</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  لیست مشتریانی که در نمایشگاه یا جلسات از طریق کارت ویزیت دیجیتال شماره خود را ثبت کرده‌اند
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchLeads}
                  disabled={leadsLoading}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${leadsLoading ? 'animate-spin' : ''}`} />
                  <span>بروزرسانی</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportLeadsCsv}
                  className="py-2 px-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <FileDown className="w-4 h-4 stroke-[2.2]" />
                  <span>خروجی اکسل (CSV)</span>
                </button>
              </div>
            </div>

            {/* Search Bar for Leads */}
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="جستجوی نام مشتری، موبایل، شرکت، یادداشت یا کارشناس..."
                value={leadSearchQuery}
                onChange={(e) => setLeadSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500 transition-all"
              />
            </div>

            {filteredLeads.length === 0 ? (
              <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
                <UserPlus className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-xs font-bold text-slate-300">
                  {leads.length === 0
                    ? 'هنوز هیچ شماره‌ای توسط مشتریان ثبت نشده است.'
                    : 'مشتری با عبارت جستجو شده یافت نشد.'}
                </p>
                <p className="text-[11px] text-slate-500">
                  مشتریان با کلیک روی دکمه «ارسال شماره شما برای کارشناس» در پایین کارت ویزیت می‌توانند مشخصات خود را ثبت کنند.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredLeads.map((lead) => {
                  const cleanDigits = lead.customerMobile.replace(/\D/g, '');
                  const waPhone = cleanDigits.startsWith('0')
                    ? '98' + cleanDigits.slice(1)
                    : cleanDigits.startsWith('98')
                      ? cleanDigits
                      : '98' + cleanDigits;

                  return (
                    <div
                      key={lead.id}
                      className="p-4 bg-slate-800/60 hover:bg-slate-800/90 rounded-2xl border border-slate-700/70 flex flex-col justify-between gap-3 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white">{lead.customerName}</span>
                            {lead.customerCompany && (
                              <span className="text-[10.5px] bg-slate-700/80 text-amber-300 px-2 py-0.5 rounded-md border border-slate-600">
                                {lead.customerCompany}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 text-xs">
                            <span className="font-mono font-bold text-emerald-400" dir="ltr">
                              {lead.customerMobile}
                            </span>
                            <span className="text-[10.5px] text-slate-400">
                              • کارشناس: <strong className="text-slate-200">{lead.profileName}</strong>
                            </span>
                          </div>
                          {lead.note && (
                            <p className="mt-2 text-xs text-slate-300 bg-slate-900/70 p-2.5 rounded-xl border border-slate-700/60 leading-relaxed">
                              {lead.note}
                            </p>
                          )}
                        </div>

                        <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                          {new Date(lead.createdAt).toLocaleDateString('fa-IR')}
                        </span>
                      </div>

                      <div className="pt-2.5 border-t border-slate-700/60 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <a
                            href={`tel:${lead.customerMobile}`}
                            className="py-1.5 px-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>تماس</span>
                          </a>

                          <a
                            href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                              `سلام ${lead.customerName} عزیز، وقت بخیر. از شرکت رویا طرح داخلی (${lead.profileName}) با شما در ارتباطم.`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-1.5 px-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>واتساپ</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => handleDownloadCustomerVcf(lead)}
                            className="py-1.5 px-2.5 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                            title="ذخیره در مخاطبین گوشی"
                          >
                            <Contact className="w-3.5 h-3.5 text-amber-400" />
                            <span>ذخیره VCF</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`آیا از حذف اطلاعات تماس "${lead.customerName}" اطمینیان دارید؟`)) {
                              handleDeleteLead(lead.id);
                            }
                          }}
                          className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                          title="حذف سرنخ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: BRAND & ORGANIZATION IDENTITY */}
        {activeTab === 'brand' && (
          <div className="max-w-2xl space-y-5 animate-in fade-in duration-200">
            <div className="bg-slate-800/60 p-5 rounded-2xl border border-slate-700/80 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                <span>تنظیمات هویت سازمانی، کاتالوگ و جهت چیدمان</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                این مشخصات به عنوان هویت رسمی، تنظیمات پیش‌فرض چیدمان و پیوندهای کارت تمام پرسنل قرار می‌گیرند.
              </p>

              {/* Global Layout Direction Control */}
              <div className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white text-xs block">جهت استاندارد چیدمان محتوای کارت‌ها:</span>
                    <span className="text-[11px] text-slate-400">
                      تنظیم موقعیت آیکون‌ها و فلش‌های داخل کادر دکمه‌ها
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setBrandLayoutDirection('rtl')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        brandLayoutDirection === 'rtl' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <AlignRight className="w-3.5 h-3.5" />
                      <span>راست‌چین (RTL)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrandLayoutDirection('ltr')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        brandLayoutDirection === 'ltr' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                      <span>چپ‌چین (LTR)</span>
                    </button>
                  </div>
                </div>
                <p className="text-[10.5px] text-slate-400 leading-relaxed bg-slate-950/40 p-2 rounded-lg border border-slate-800/80">
                  {brandLayoutDirection === 'rtl'
                    ? '🔹 در حالت راست‌چین: آیکون و متون در سمت راست باکس قرار داشته و علامت فلش هدایت در سمت چپ باکس قرار می‌گیرد.'
                    : '🔹 در حالت چپ‌چین: علامت فلش به سمت راست باکس منتقل شده و نوشته‌ها و آیکون‌ها به سمت چپ باکس می‌آیند.'}
                </p>
              </div>

              <div className="space-y-3.5 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">نام رسمی سازمان / شرکت:</label>
                  <input
                    type="text"
                    value={brandCompany}
                    onChange={(e) => setBrandCompany(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">وب‌سایت رسمی:</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={brandWebsite}
                      onChange={(e) => setBrandWebsite(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">عنوان دکمه کاتالوگ:</label>
                    <input
                      type="text"
                      value={brandCatalog}
                      onChange={(e) => setBrandCatalog(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Catalog PDF URL, Upload & Test Button */}
                <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-700/70 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-300">
                      مسیر / آدرس فایل PDF کاتالوگ محصولات:
                    </label>
                    <button
                      type="button"
                      onClick={() => downloadCatalogPdf(brandCatalogPdfUrl)}
                      className="text-[11px] text-amber-300 hover:text-amber-200 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <FileDown className="w-3.5 h-3.5 text-amber-400" />
                      <span>تست دانلود PDF</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    dir="ltr"
                    value={brandCatalogPdfUrl}
                    onChange={(e) => setBrandCatalogPdfUrl(e.target.value)}
                    placeholder="/roya-catalog.pdf"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />

                  {/* Direct PDF Upload component */}
                  <PdfUploader
                    currentPdfUrl={brandCatalogPdfUrl}
                    onPdfUploaded={(uploadedUrl) => {
                      setBrandCatalogPdfUrl(uploadedUrl);
                      showToast('فایل PDF با موفقیت آپلود و به عنوان کاتالوگ تنظیم شد.');
                    }}
                    allowSetAsDefault={true}
                    label="آپلود فایل PDF کاتالوگ سازمانی"
                    description="فایل کاتالوگ جدید را مستقیماً از سیستم خود انتخاب کرده و آپلود کنید."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">آیدی صفحه اینستاگرام:</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={brandInstagram}
                    onChange={(e) => setBrandInstagram(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  onClick={handleSaveBrandToAll}
                  disabled={brandSaving}
                  className="py-2.5 px-5 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{brandSaving ? 'در حال اعمال...' : 'اعمال و ذخیره برای تمام پرسنل'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: LOCATION & GPS ROUTING */}
        {activeTab === 'location' && (
          <div className="max-w-2xl space-y-5 animate-in fade-in duration-200">
            <div className="bg-slate-800/60 p-5 rounded-2xl border border-slate-700/80 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  <span>موقعیت مکانی دفتر مرکزی و مسیریابی ۴‌گانه</span>
                </h3>

                <button
                  onClick={onOpenLocationModal}
                  className="py-1.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>ویرایش نقشه و مختصات</span>
                </button>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2">
                <div className="text-xs text-slate-400 font-medium">آدرس ثبت‌شده فعلی:</div>
                <div className="text-xs text-slate-200 leading-relaxed font-normal">
                  {currentProfile.address}
                </div>
                {currentProfile.postalCode && (
                  <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                    Postal Code: {currentProfile.postalCode}
                  </div>
                )}
                {currentProfile.mapLocation?.lat && (
                  <div className="text-[11px] text-amber-400/90 font-mono" dir="ltr">
                    GPS Coordinates: {currentProfile.mapLocation.lat}, {currentProfile.mapLocation.lng}
                  </div>
                )}
              </div>

              {/* Instant Test Buttons for Routing Apps */}
              <div className="space-y-2">
                <span className="text-xs text-slate-300 font-semibold block">تست فوری باز شدن در اپلیکیشن‌های مسیریابی:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <a
                    href={`https://neshan.org/maps/@${currentProfile.mapLocation?.lat || 35.7766},${currentProfile.mapLocation?.lng || 51.4277},17z`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-center text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>نشان (Neshan)</span>
                    <ArrowUpRight className="w-3 h-3 text-slate-400" />
                  </a>

                  <a
                    href={`https://balad.ir/location?latitude=${currentProfile.mapLocation?.lat || 35.7766}&longitude=${currentProfile.mapLocation?.lng || 51.4277}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-center text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>بلد (Balad)</span>
                    <ArrowUpRight className="w-3 h-3 text-slate-400" />
                  </a>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${currentProfile.mapLocation?.lat || 35.7766},${currentProfile.mapLocation?.lng || 51.4277}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-center text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Google Maps</span>
                    <ArrowUpRight className="w-3 h-3 text-slate-400" />
                  </a>

                  <a
                    href={`https://waze.com/ul?ll=${currentProfile.mapLocation?.lat || 35.7766},${currentProfile.mapLocation?.lng || 51.4277}&navigate=yes`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-center text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Waze</span>
                    <ArrowUpRight className="w-3 h-3 text-slate-400" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DATABASE, SECURITY & SERVER TOOLS */}
        {activeTab === 'server' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in fade-in duration-200">
            {/* Left Card: Change Password */}
            <div className="bg-slate-800/60 p-5 rounded-2xl border border-slate-700/80 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>تغییر کلمه عبور مدیریت</span>
              </h3>

              <form onSubmit={handleChangePassword} className="space-y-3 pt-1">
                {/* Master password hint */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-200/90 leading-relaxed">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>رمزهای معتبر ورود مدیریت:</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    رمز پیش‌فرض سیستم: <code className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-bold">roya1403</code> یا <code className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-bold">admin123</code> یا <code className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-bold">roya2026</code>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">کلمه عبور فعلی:</label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">کلمه عبور جدید:</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">تکرار کلمه عبور جدید:</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                </div>

                {passwordMsg && (
                  <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                    passwordMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {passwordMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span>{passwordMsg.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {passwordLoading ? 'در حال ثبت...' : 'به‌روزرسانی رمز عبور'}
                </button>
              </form>
            </div>

            {/* Right Card: Backup, Restore & Server Guide */}
            <div className="bg-slate-800/60 p-5 rounded-2xl border border-slate-700/80 space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>پشتیبان‌گیری از پایگاه داده (Flat-File DB)</span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  پایگاه داده سامانه در مسیر <code className="text-amber-300 font-mono">/data/database.json</code> قرار دارد. با دکمه زیر می‌توانید نسخه پشتیبان را مستقیماً دریافت نمایید.
                </p>

                <div className="mt-4 space-y-2.5">
                  <button
                    type="button"
                    onClick={handleBackupDownload}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>دانلود فایل پشتیبان دیتابیس (database.json)</span>
                  </button>

                  <label className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer">
                    <Upload className="w-4 h-4 text-amber-400" />
                    <span>بازیابی پایگاه داده از فایل پشتیبان (Restore JSON)</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleBackupRestore}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={onOpenDeployModal}
                    className="w-full py-2.5 px-4 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Server className="w-4 h-4 text-sky-400" />
                    <span>مشاهده پکیج استقرار سرور (Nginx, PM2, Docker)</span>
                  </button>
                </div>
              </div>

              {/* Reset to Default */}
              <div className="pt-3 border-t border-slate-700/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">بازنشانی کامل اطلاعات به پیش‌فرض رویا:</span>
                <button
                  onClick={() => {
                    if (confirm('آیا از بازنشانی کل دیتابیس به اطلاعات اولیه اطمینان دارید؟')) {
                      onResetToDefault();
                    }
                  }}
                  className="text-xs text-red-400 hover:text-red-300 font-medium underline underline-offset-4 cursor-pointer"
                >
                  بازنشانی دیتابیس
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
