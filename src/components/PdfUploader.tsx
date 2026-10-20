import React, { useRef, useState } from 'react';
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  FileDown, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { api } from '../services/api';
import { downloadCatalogPdf } from '../utils/catalog';

interface PdfUploaderProps {
  currentPdfUrl?: string;
  onPdfUploaded: (url: string, fileName?: string) => void;
  label?: string;
  description?: string;
  allowSetAsDefault?: boolean;
  compact?: boolean;
}

export const PdfUploader: React.FC<PdfUploaderProps> = ({
  currentPdfUrl = '/roya-catalog.pdf',
  onPdfUploaded,
  label = 'بارگذاری فایل PDF کاتالوگ محصولات',
  description = 'فایل کاتالوگ با فرمت PDF را انتخاب کرده یا به این کادر بکشید.',
  allowSetAsDefault = false,
  compact = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [replaceDefault, setReplaceDefault] = useState(false);
  const [uploadedInfo, setUploadedInfo] = useState<{ name: string; size: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleFile = async (file: File) => {
    setErrorMsg(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMsg('فرمت فایل انتخابی باید حتماً PDF باشد (.pdf).');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrorMsg('حجم فایل انتخابی بیش از ۵۰ مگابایت است. لطفاً فایل کم‌حجم‌تری انتخاب فرمایید.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(`در حال پردازش ${file.name} (${formatFileSize(file.size)})...`);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        if (!base64Data) {
          setIsUploading(false);
          setErrorMsg('خطا در خواندن فایل.');
          return;
        }

        setUploadProgress('در حال ارسال فایل به سرور...');
        const result = await api.uploadPdf(base64Data, file.name, replaceDefault);

        setIsUploading(false);
        if (result.success && result.url) {
          onPdfUploaded(result.url, file.name);
          setUploadedInfo({
            name: file.name,
            size: formatFileSize(file.size),
          });
          setUploadProgress(null);
        } else {
          setErrorMsg(result.error || 'خطا در بارگذاری فایل');
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setIsUploading(false);
      setErrorMsg('خطا در بارگذاری فایل: ' + (err?.message || 'نامشخص'));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  if (compact) {
    return (
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{isUploading ? 'در حال آپلود...' : 'انتخاب و آپلود PDF'}</span>
          </button>

          {currentPdfUrl && (
            <button
              type="button"
              onClick={() => downloadCatalogPdf(currentPdfUrl)}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer"
              title="تست دانلود فایل PDF"
            >
              <FileDown className="w-3.5 h-3.5 text-slate-400" />
              <span>تست دانلود</span>
            </button>
          )}
        </div>

        {uploadedInfo && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate">آپلود شد: {uploadedInfo.name} ({uploadedInfo.size})</span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-1.5 text-[11px] text-rose-400">
            <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-900/90 rounded-2xl p-4 border border-slate-700/80 space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">{label}</h4>
            <p className="text-[11px] text-slate-400">{description}</p>
          </div>
        </div>

        {currentPdfUrl && (
          <button
            type="button"
            onClick={() => downloadCatalogPdf(currentPdfUrl)}
            className="text-[11px] font-bold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-amber-400" />
            <span>دانلود / تست PDF</span>
          </button>
        )}
      </div>

      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative rounded-xl p-4 border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
          isDragging
            ? 'border-amber-500 bg-amber-500/10 scale-[1.01]'
            : 'border-slate-700 bg-slate-950/60 hover:border-amber-500/60 hover:bg-slate-950/90'
        }`}
      >
        {isUploading ? (
          <div className="py-3 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            <span className="text-xs font-bold text-amber-300">{uploadProgress || 'در حال آپلود فایل...'}</span>
          </div>
        ) : (
          <div className="py-2 flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-amber-400 shadow-inner">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                برای انتخاب فایل PDF کلیک کنید یا آن را اینجا رها نمایید
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                حداکثر حجم مجاز: ۵۰ مگابایت • فرمت: PDF
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Options & Status */}
      {allowSetAsDefault && (
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={replaceDefault}
            onChange={(e) => setReplaceDefault(e.target.checked)}
            className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-0 focus:outline-hidden"
          />
          <span>جایگزینی به عنوان کاتالوگ پیش‌فرض کل سازمان (<code className="text-amber-300 font-mono">/roya-catalog.pdf</code>)</span>
        </label>
      )}

      {uploadedInfo && (
        <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-2 text-xs text-emerald-300">
          <div className="flex items-center gap-1.5 truncate">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">فایل <strong>{uploadedInfo.name}</strong> ({uploadedInfo.size}) با موفقیت بارگذاری شد.</span>
          </div>
          <span className="text-[10.5px] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300 shrink-0 font-bold">
            آماده استفاده
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
