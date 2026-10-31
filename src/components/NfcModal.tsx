import React, { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { 
  X, 
  Radio, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Cpu, 
  Layers, 
  Download, 
  Copy, 
  Check, 
  FileSpreadsheet, 
  Lock, 
  ShieldCheck, 
  QrCode,
  Printer
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { EmployeeProfile } from '../types';
import { isWebNfcSupported, writeUrlToNfc } from '../utils/nfc';
import { copyToClipboard as universalCopy } from '../utils/clipboard';
import { getDirectCardUrl, getBaseOrigin } from '../utils/url';

interface NfcModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: EmployeeProfile;
  allProfiles?: EmployeeProfile[];
}

export const NfcModal: React.FC<NfcModalProps> = ({ 
  isOpen, 
  onClose, 
  profile,
  allProfiles = [] 
}) => {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'qr-sheet' | 'guide'>('single');
  const [isWriting, setIsWriting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [includeNfcTrackingParam, setIncludeNfcTrackingParam] = useState<boolean>(true);

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const baseCardUrl = getDirectCardUrl(profile);
  const nfcTargetUrl = includeNfcTrackingParam ? `${baseCardUrl}?src=nfc` : baseCardUrl;
  const webNfcAvailable = isWebNfcSupported();
  const origin = getBaseOrigin();
  const staffList = allProfiles.length > 0 ? allProfiles : [profile];

  const handleWriteNfc = async () => {
    setIsWriting(true);
    setResult(null);
    setStatusText('لطفاً کارت یا برچسب NFC را به پشت گوشی نزدیک کنید...');

    const res = await writeUrlToNfc(nfcTargetUrl, (status) => {
      setStatusText(status);
    });

    setIsWriting(false);
    setResult(res);
  };

  const copyToClipboard = async (text: string, key: string) => {
    const ok = await universalCopy(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // Export Bulk NFC & QR CSV for PVC Card Printing House
  const handleExportBulkCsv = () => {
    const escapeCsv = (val?: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'ردیف',
      'شناسه (ID)',
      'نام و نام خانوادگی (فارسی)',
      'نام انگلیسی (چاپ روی کارت)',
      'سمت سازمانی',
      'واحد سازمانی',
      'شماره موبایل',
      'لینک رایت چیپ NFC (همراه با ردیاب تپ)',
      'لینک بارکد QR (همراه با ردیاب اسکن)',
      'لینک مستقیم کارت',
      'لینک دانلود مستقیم مخاطب (VCF)',
    ];

    const rows = staffList.map((p, idx) => {
      const cardBase = getDirectCardUrl(p);
      const slugOrId = (p.slug || p.id).trim();
      return [
        escapeCsv(idx + 1),
        escapeCsv(p.id),
        escapeCsv(p.name),
        escapeCsv(p.nameEn || ''),
        escapeCsv(p.title),
        escapeCsv(p.department || 'فروش'),
        escapeCsv(p.mobile || ''),
        escapeCsv(`${cardBase}?src=nfc`),
        escapeCsv(`${cardBase}?src=qr`),
        escapeCsv(cardBase),
        escapeCsv(`${origin}/api/vcard/${slugOrId}`),
      ];
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `roya_pvc_print_nfc_qr_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-slate-900 text-slate-100 w-full max-w-3xl rounded-3xl shadow-2xl relative border border-slate-700/80 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <span>مرکز برنامه‌ریزی NFC و خروجی چاپخانه کارت‌های PVC</span>
                <span className="text-xs bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                  NTAG 213/215/216
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                رایت تکی با موبایل، فایل اکسل چاپخانه و شیت یکجای بارکدهای QR تمام پرسنل
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            aria-label="بستن"
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1.5 p-2 bg-slate-950/80 border-b border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('single')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'single'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>رایت آنلاین با موبایل ({profile.name})</span>
          </button>

          <button
            onClick={() => setActiveTab('bulk')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'bulk'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>لیست اکسل چاپخانه ({staffList.length} نفر)</span>
          </button>

          <button
            onClick={() => setActiveTab('qr-sheet')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'qr-sheet'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>شیت یکجای بارکدهای QR</span>
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'guide'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>راهنمای چیپ و قفل‌گذاری</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* TAB 1: SINGLE WRITER */}
          {activeTab === 'single' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    لینک رایت روی تگ NFC برای {profile.name}:
                  </span>
                  <button
                    onClick={() => copyToClipboard(nfcTargetUrl, 'direct-url')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'direct-url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'direct-url' ? 'کپی شد!' : 'کپی لینک NFC'}</span>
                  </button>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-amber-300 select-all break-all" dir="ltr">
                  {nfcTargetUrl}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeNfcTrackingParam}
                    onChange={(e) => setIncludeNfcTrackingParam(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-amber-400"
                  />
                  <span>افزودن پارامتر هوشمند <code className="text-amber-300 font-mono">?src=nfc</code> جهت شمارش دقیق تپ‌های فیزیکی NFC در داشبورد آمار</span>
                </label>
              </div>

              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-white">رایت فوری با پروتکل Web NFC</h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {webNfcAvailable 
                        ? 'مرورگر شما از Web NFC پشتیبانی می‌کند. روی دکمه زیر کلیک کرده و چیپ را نزدیک کنید.'
                        : 'برای رایت در اندروید از مرورگر Chrome و در آیفون/اندروید از اپلیکیشن رایگان NFC Tools استفاده فرمایید.'}
                    </p>
                  </div>
                </div>

                {webNfcAvailable ? (
                  <div className="pt-2">
                    <button
                      onClick={handleWriteNfc}
                      disabled={isWriting}
                      className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md shadow-amber-500/10 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isWriting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                          <span>در حال انتظار برای نزدیک کردن چیپ NFC...</span>
                        </>
                      ) : (
                        <>
                          <Radio className="w-4 h-4 text-slate-950" />
                          <span>شروع رایت تگ NFC برای {profile.name}</span>
                        </>
                      )}
                    </button>
                    {statusText && isWriting && (
                      <p className="text-xs text-center text-amber-400 font-medium mt-2.5 animate-pulse">
                        {statusText}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <span>
                      جهت رایت مستقیم روی تگ، مرورگر <strong className="text-white">Google Chrome در اندروید</strong> را باز کنید یا لینک بالا را در اپلیکیشن <strong className="text-white">NFC Tools</strong> کپی و گزینه <em>Write → Add a record → URL</em> را انتخاب نمایید.
                    </span>
                  </div>
                )}

                {result && (
                  <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${result.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}`}>
                    {result.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{result.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: BULK ENCODING & PRINTING CSV */}
          {activeTab === 'bulk' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">جدول جامع لینک‌های NFC و QR تمام پرسنل رویا</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    مناسب برای تحویل به چاپخانه کارت‌های هوشمند PVC (شامل لینک‌های مجزای تپ NFC و اسکن QR)
                  </p>
                </div>
                <button
                  onClick={handleExportBulkCsv}
                  className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4 stroke-[2.2]" />
                  <span>دانلود شیت اکسل چاپخانه (CSV)</span>
                </button>
              </div>

              <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-800/90 text-slate-300 text-xs border-b border-slate-700/60 sticky top-0">
                    <tr>
                      <th className="p-2.5">نام کارشناس</th>
                      <th className="p-2.5">سمت سازمانی</th>
                      <th className="p-2.5">لینک چیپ NFC</th>
                      <th className="p-2.5 text-center">کپی NFC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {staffList.map((p) => {
                      const nfcUrl = `${getDirectCardUrl(p)}?src=nfc`;
                      return (
                        <tr key={p.id} className="hover:bg-slate-900/80">
                          <td className="p-2.5 font-bold text-white">{p.name}</td>
                          <td className="p-2.5 text-slate-400 text-xs">{p.title}</td>
                          <td className="p-2.5 font-mono text-xs text-amber-300 max-w-[220px] truncate" dir="ltr">
                            {nfcUrl}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              onClick={() => copyToClipboard(nfcUrl, `bulk-${p.id}`)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                              title="کپی لینک NFC"
                            >
                              {copiedKey === `bulk-${p.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: BATCH QR CODE SHEET FOR PRINTING HOUSE */}
          {activeTab === 'qr-sheet' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">شیت یکجای بارکدهای QR اختصاصی پرسنل</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    تمامی بارکدها مجهز به لوگوی مرکزی رویا و پارامتر ردیاب اسکن (<code className="font-mono text-amber-300">?src=qr</code>) هستند
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportBulkCsv}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>دانلود CSV لینک‌ها</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>چاپ / ذخیره PDF شیت</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 max-h-80 overflow-y-auto p-1">
                {staffList.map((p) => {
                  const qrUrl = `${getDirectCardUrl(p)}?src=qr`;
                  return (
                    <div
                      key={p.id}
                      className="p-3.5 bg-white text-stone-900 rounded-2xl border border-stone-200 flex flex-col items-center text-center shadow-sm"
                    >
                      <QRCodeSVG
                        value={qrUrl}
                        size={116}
                        level="H"
                        fgColor="#1C1917"
                        bgColor="#FFFFFF"
                        imageSettings={{
                          src: '/favicon.png',
                          height: 22,
                          width: 22,
                          excavate: true,
                        }}
                      />
                      <span className="mt-2.5 text-xs font-black text-stone-900 truncate max-w-full">
                        {p.name}
                      </span>
                      <span className="text-xs text-stone-500 truncate max-w-full mt-0.5">
                        {p.title}
                      </span>
                      <span className="mt-1 text-xs font-mono text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100" dir="ltr">
                        /{p.slug || p.id}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: HARDWARE & CHIP GUIDE */}
          {activeTab === 'guide' && (
            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 space-y-3">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  راهنمای انتخاب چیپ مناسب برای کارت‌های شرکت رویا:
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-3 bg-slate-900/90 rounded-xl border border-amber-500/30">
                    <div className="font-bold text-amber-400 text-xs">NTAG213 (پیشنهادی)</div>
                    <div className="text-xs text-slate-400 mt-1">حجم: ۱۴۴ بایت</div>
                    <div className="text-xs text-slate-300 mt-1">قیمت اقتصادی، سرعت اسکن فوق‌العاده بالا، کاملاً متناسب با لینک کارت رویا</div>
                  </div>

                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-700">
                    <div className="font-bold text-slate-200 text-xs">NTAG215</div>
                    <div className="text-xs text-slate-400 mt-1">حجم: ۵۰۴ بایت</div>
                    <div className="text-xs text-slate-300 mt-1">پشتیبانی کامل از لینک‌های بلند و اطلاعات اضافی vCard</div>
                  </div>

                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-700">
                    <div className="font-bold text-slate-200 text-xs">NTAG216</div>
                    <div className="text-xs text-slate-400 mt-1">حجم: ۸۸۸ بایت</div>
                    <div className="text-xs text-slate-300 mt-1">بیشترین حجم حافظه برای ذخیره مستقیم مخاطب آفلاین روی چیپ</div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/40 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>توصیه امنیتی مهم: قفل‌گذاری چیپ (Lock Tag)</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  پس از رایت لینک روی کارت ویزیت فیزیکی پرسنل، می‌توانید از گزینه <strong className="text-white">Lock / Read-Only</strong> در اپلیکیشن NFC Tools یا دستگاه رایت استفاده کنید تا هیچ فرد دیگری نتواند اطلاعات یا لینک روی کارت را بازنویسی یا پاک کند.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>سازگار با انواع گوشی‌های اپل آیفون و اندروید</span>
          </div>
          <button
            onClick={onClose}
            className="py-2 px-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-xs transition-colors border border-slate-700 cursor-pointer"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};
