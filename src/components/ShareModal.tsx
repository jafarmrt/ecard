import React, { useState, useRef } from 'react';
import { X, Share2, Copy, Check, Download, MessageCircle, Send, Smartphone, ExternalLink, QrCode } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { EmployeeProfile } from '../types';
import { shareContact } from '../utils/vcard';
import { copyToClipboard } from '../utils/clipboard';
import { getDirectCardUrl } from '../utils/url';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: EmployeeProfile;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, profile }) => {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Exact standalone card URL (showing exclusively the mobile business card view)
  const directCardUrl = getDirectCardUrl(profile);

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(directCardUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = () => {
    shareContact(profile);
  };

  const downloadQrPng = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (canvas) {
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `QR_${profile.name.replace(/\s+/g, '_')}_Roya_Card.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  const shareText = encodeURIComponent(`کارت ویزیت دیجیتال ${profile.name} (${profile.title} شرکت رویا طرح داخلی):\n${directCardUrl}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 text-slate-100 w-full max-w-md rounded-3xl shadow-2xl relative border border-slate-800 max-h-[90vh] overflow-y-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">کیوآرکد اختصاصی کارت ویزیت</h3>
              <p className="text-xs text-slate-400">{profile.name} ({profile.title})</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* QR Code Container */}
          <div className="p-5 bg-slate-800/80 rounded-2xl border border-slate-700/80 flex flex-col items-center justify-center">
            <div ref={qrRef} className="p-4 bg-white rounded-2xl shadow-lg border border-slate-700">
              <QRCodeCanvas 
                value={directCardUrl}
                size={190}
                level="H"
                marginSize={1}
              />
            </div>
            
            <div className="mt-3 text-center">
              <p className="text-xs font-bold text-white">کیوآرکد مستقیم محتوای کارت ویزیت</p>
              <p className="text-[11px] text-amber-400 font-medium mt-0.5">
                اسکن این کد صرفاً کادر کارت ویزیت موبایلی را بدون ابزار‌های مدیریتی باز می‌کند.
              </p>
            </div>
            
            <div className="mt-3.5 flex flex-col sm:flex-row items-center gap-2 w-full">
              <button
                onClick={downloadQrPng}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>دانلود فایل تصویر بارکد (PNG)</span>
              </button>
              
              <a
                href={directCardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-950 border border-slate-700 text-slate-300 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span>تست و بازکردن لینک</span>
              </a>
            </div>
          </div>

          {/* Copy Direct Card Link Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 px-1">لینک مستقیم کارت ویزیت (بدون منوی برنامه):</label>
            <div className="flex items-center gap-2 p-1.5 bg-slate-800/90 border border-slate-700 rounded-xl">
              <input 
                type="text" 
                readOnly 
                value={directCardUrl} 
                className="w-full bg-transparent text-xs text-slate-300 font-mono px-2 outline-hidden truncate"
              />
              <button
                onClick={handleCopyLink}
                className="py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shrink-0 flex items-center gap-1 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>کپی شد</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>کپی لینک</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Social Share Buttons */}
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-slate-400 px-1">ارسال سریع کارت به مشتری:</p>
            <div className="grid grid-cols-3 gap-2">
              <a
                href={`https://wa.me/?text=${shareText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-medium flex flex-col items-center justify-center gap-1 border border-emerald-500/30 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>واتساپ</span>
              </a>

              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(directCardUrl)}&text=${encodeURIComponent(`کارت ویزیت ${profile.name}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded-xl text-xs font-medium flex flex-col items-center justify-center gap-1 border border-sky-500/30 transition-colors"
              >
                <Send className="w-4 h-4" />
                <span>تلگرام</span>
              </a>

              <button
                onClick={handleNativeShare}
                className="py-2.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium flex flex-col items-center justify-center gap-1 border border-slate-700 transition-colors cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-amber-400" />
                <span>اشتراک گوشی</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
