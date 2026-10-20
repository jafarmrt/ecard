import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Phone,
  Building2,
  MessageSquare,
  Check,
  Sparkles,
  Send,
  Contact,
  MessageCircle,
  AlertCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { EmployeeProfile } from '../types';
import { api } from '../services/api';
import { downloadVCard } from '../utils/vcard';

interface LeadCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: EmployeeProfile;
}

const QUICK_TOPICS = [
  'استعلام قیمت و موجودی',
  'درخواست سمپل و کاتالوگ',
  'پروژه معماری / دکوراسیون',
  'همکاری تجاری / نمایندگی',
];

function toEnglishDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
}

export const LeadCaptureModal: React.FC<LeadCaptureModalProps> = ({
  isOpen,
  onClose,
  profile,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const rawWhatsappDigits = toEnglishDigits(profile.whatsapp).replace(/[^0-9]/g, '');
  const cleanWhatsapp = rawWhatsappDigits.startsWith('0')
    ? '98' + rawWhatsappDigits.substring(1)
    : rawWhatsappDigits.startsWith('98')
      ? rawWhatsappDigits
      : '98' + rawWhatsappDigits;

  const handleSelectTopic = (topic: string) => {
    setNote((prev) => {
      if (prev.includes(topic)) return prev;
      return prev ? `${prev} - ${topic}` : topic;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const normalizedMobile = toEnglishDigits(customerMobile).trim();
    if (!customerName.trim()) {
      setErrorMsg('لطفاً نام و نام خانوادگی خود را وارد فرمایید.');
      return;
    }
    if (!normalizedMobile || normalizedMobile.replace(/\D/g, '').length < 10) {
      setErrorMsg('لطفاً یک شماره موبایل معتبر وارد فرمایید.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.submitLead({
        profileId: profile.id,
        customerName: customerName.trim(),
        customerMobile: normalizedMobile,
        customerCompany: customerCompany.trim() || undefined,
        note: note.trim() || undefined,
      });

      if (res.success) {
        setSubmitted(true);
        try {
          confetti({
            particleCount: 55,
            spread: 65,
            origin: { y: 0.7 },
            colors: ['#D0192A', '#10B981', '#F59E0B', '#3B82F6'],
          });
        } catch {}
      } else {
        setErrorMsg(res.error || 'خطا در ثبت اطلاعات تماس');
      }
    } catch {
      setErrorMsg('خطا در برقراری ارتباط با سرور');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSubmitted(false);
    setCustomerName('');
    setCustomerMobile('');
    setCustomerCompany('');
    setNote('');
    setErrorMsg(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/75 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={handleResetAndClose}
    >
      <div
        className="bg-white text-stone-900 w-full max-w-md rounded-3xl shadow-2xl relative border border-stone-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Red/Dark Header */}
        <div className="p-5 bg-gradient-to-l from-[#D0192A] to-[#9E111E] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">تبادل کارت و ثبت شماره تماس</h3>
              <p className="text-xs text-white/85 mt-0.5">
                ارسال مستقیم مشخصات شما برای {profile.name}
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {submitted ? (
            <div className="py-4 text-center space-y-4 animate-in fade-in duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <Check className="w-8 h-8 stroke-[2.5]" />
              </div>

              <div>
                <h4 className="text-base font-black text-stone-800">
                  مشخصات شما با موفقیت ثبت شد!
                </h4>
                <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                  اطلاعات تماس شما در کارتابل <span className="font-bold text-stone-800">{profile.name}</span> ({profile.title}) ثبت گردید تا در اسرع وقت با شما ارتباط برقرار شود.
                </p>
              </div>

              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  onClick={() => downloadVCard(profile)}
                  className="w-full py-3 px-4 bg-[#D0192A] hover:bg-[#B51221] text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
                >
                  <Contact className="w-4 h-4" />
                  <span>ذخیره مخاطب {profile.name} در گوشی شما (.vcf)</span>
                </button>

                <a
                  href={`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
                    `سلام وقت بخیر، من ${customerName}${customerCompany ? ` از مجموعه ${customerCompany}` : ''} هستم. شماره تماسم را در کارت ویزیت دیجیتال شما ثبت کردم.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>ارسال پیام همزمان در واتساپ کارشناس</span>
                </a>

                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="w-full py-2.5 text-xs font-semibold text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
                >
                  بستن پنجره
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  نام و نام خانوادگی شما <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="مثلاً: مهندس علی رضایی"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-hidden focus:border-[#D0192A] focus:bg-white font-medium transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  شماره موبایل جهت تماس <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    dir="ltr"
                    required
                    value={customerMobile}
                    onChange={(e) => setCustomerMobile(e.target.value)}
                    placeholder="0912..."
                    className="w-full pl-9 pr-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 font-mono text-left focus:outline-hidden focus:border-[#D0192A] focus:bg-white font-bold transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  نام شرکت، مجموعه یا پروژه (اختیاری)
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerCompany}
                    onChange={(e) => setCustomerCompany(e.target.value)}
                    placeholder="مثلاً: گروه معماری پارس / پروژه الهیه"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-hidden focus:border-[#D0192A] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  موضوع درخواست یا یادداشت کوتاه:
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {QUICK_TOPICS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => handleSelectTopic(topic)}
                      className="text-[10.5px] px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-[#D0192A] border border-stone-200 hover:border-red-200 transition-colors cursor-pointer"
                    >
                      + {topic}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <MessageSquare className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="توضیحات تکمیلی، کد سمپل مدنظر یا زمان مناسب تماس..."
                    className="w-full pl-9 pr-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-hidden focus:border-[#D0192A] focus:bg-white transition-colors resize-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 px-4 bg-[#D0192A] hover:bg-[#B51221] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-red-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'در حال ثبت...' : `ارسال مشخصات برای ${profile.name}`}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
