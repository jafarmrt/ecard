import React, { useState, useRef } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { X, Copy, Check, Download, MessageCircle, Send, Smartphone, ExternalLink, QrCode, IdCard } from 'lucide-react';
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

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  // Exact standalone card URL (showing exclusively the mobile business card view)
  const directCardUrl = getDirectCardUrl(profile);
  const trackedQrUrl = `${directCardUrl}?src=qr`;

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

  const downloadRawQrPng = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (canvas) {
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `QR_Raw_${profile.slug || profile.id}_Roya.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  // Generate a high-resolution Printable PVC / Social Badge with QR, Name, Title & Brand
  const downloadBrandedBadgePng = () => {
    const qrCanvas = qrRef.current?.querySelector('canvas');
    if (!qrCanvas) return;

    const badgeCanvas = document.createElement('canvas');
    const width = 800;
    const height = 1040;
    badgeCanvas.width = width;
    badgeCanvas.height = height;
    const ctx = badgeCanvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Top Red Accent Bar
    ctx.fillStyle = '#D0192A';
    ctx.fillRect(0, 0, width, 24);

    // Subtle Outer Border
    ctx.strokeStyle = '#E7E5E4';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 44, width - 48, height - 68);

    // Brand Title
    ctx.fillStyle = '#D0192A';
    ctx.font = '900 44px Vazirmatn, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ROYA', width / 2, 130);

    ctx.fillStyle = '#57534E';
    ctx.font = '600 20px Vazirmatn, sans-serif';
    ctx.fillText('شرکت رویا طرح داخلی', width / 2, 170);

    // QR Code Frame
    const qrBoxSize = 460;
    const qrX = (width - qrBoxSize) / 2;
    const qrY = 215;

    ctx.fillStyle = '#FAFAF9';
    ctx.fillRect(qrX - 20, qrY - 20, qrBoxSize + 40, qrBoxSize + 40);
    ctx.strokeStyle = '#D6D3D1';
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX - 20, qrY - 20, qrBoxSize + 40, qrBoxSize + 40);

    ctx.drawImage(qrCanvas, qrX, qrY, qrBoxSize, qrBoxSize);

    // Employee Name
    ctx.fillStyle = '#1C1917';
    ctx.font = '900 42px Vazirmatn, sans-serif';
    ctx.fillText(profile.name, width / 2, 765);

    // Red Divider
    ctx.fillStyle = '#D0192A';
    ctx.fillRect(width / 2 - 45, 790, 90, 5);

    // Employee Title
    ctx.fillStyle = '#57534E';
    ctx.font = '600 26px Vazirmatn, sans-serif';
    ctx.fillText(profile.title, width / 2, 840);

    // Mobile & Direct Slug
    ctx.fillStyle = '#292524';
    ctx.font = '700 26px monospace';
    ctx.fillText(profile.mobile || '', width / 2, 895);

    ctx.fillStyle = '#78716C';
    ctx.font = '500 20px monospace';
    ctx.fillText(directCardUrl.replace(/^https?:\/\//, ''), width / 2, 945);

    const pngUrl = badgeCanvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    downloadLink.href = pngUrl;
    downloadLink.download = `Roya_Card_QR_${profile.slug || profile.id}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const shareText = encodeURIComponent(`کارت ویزیت دیجیتال ${profile.name} (${profile.title} شرکت رویا طرح داخلی):\n${directCardUrl}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
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
            aria-label="بستن"
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* QR Code Container */}
          <div className="p-5 bg-slate-800/80 rounded-2xl border border-slate-700/80 flex flex-col items-center justify-center">
            <div ref={qrRef} className="p-4 bg-white rounded-2xl shadow-lg border border-slate-700">
              <QRCodeCanvas 
                value={trackedQrUrl}
                size={240}
                level="H"
                marginSize={1}
                imageSettings={{
                  src: '/favicon.png',
                  height: 44,
                  width: 44,
                  excavate: true,
                }}
              />
            </div>
            
            <div className="mt-3 text-center">
              <p className="text-xs font-bold text-white">کیوآرکد مستقیم محتوای کارت ویزیت (مجهز به ردیاب اسکن)</p>
              <p className="text-xs text-amber-400 font-medium mt-0.5">
                اسکن این کد مستقیماً کارت ویزیت موبایلی را باز کرده و در آمار اسکن QR ثبت می‌شود.
              </p>
            </div>
            
            <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
              <button
                onClick={downloadBrandedBadgePng}
                className="w-full py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer"
              >
                <IdCard className="w-4 h-4 shrink-0" />
                <span>دانلود کارت بارکد نام‌دار (PNG)</span>
              </button>

              <button
                onClick={downloadRawQrPng}
                className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-950 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>دانلود بارکد خام (چاپخانه)</span>
              </button>
            </div>

            <a
              href={directCardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 w-full py-2 px-3 bg-slate-900/70 hover:bg-slate-950 border border-slate-700/80 text-slate-300 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              <span>تست و بازکردن لینک مستقیم کارت</span>
            </a>
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
