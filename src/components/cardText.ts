/** Labels on the public card in Persian and English (the English card is offered when the card has an English name). */
export type CardLang = 'fa' | 'en';

export const CARD_TEXT = {
  fa: {
    switchTo: 'English',
    switchLabel: 'View this card in English',
    avatarAlt: (name: string) => `تصویر ${name}`,
    call: 'تماس',
    callAria: (n: string) => `تماس با موبایل ${n}`,
    whatsapp: 'واتساپ',
    whatsappAria: (n: string) => `پیام در واتساپ به ${n}`,
    whatsappMessage: 'سلام وقت بخیر، از طریق کارت ویزیت دیجیتال با شما ارتباط می‌گیرم.',
    landline: 'تلفن ثابت',
    landlineAria: (n: string) => `تماس با تلفن ثابت ${n}`,
    instagram: 'اینستاگرام',
    instagramAria: (h: string) => `صفحه اینستاگرام ${h}`,
    website: 'وب سایت',
    websiteAria: (w: string) => `وب‌سایت ${w}`,
    catalog: 'کاتالوگ محصولات',
    catalogDownload: 'دانلود کاتالوگ محصولات',
    catalogDownloading: 'در حال دانلود کاتالوگ...',
    mb: 'مگابایت',
    kb: 'کیلوبایت',
    email: 'ایمیل',
    emailAria: (e: string) => `ارسال ایمیل به ${e}`,
    address: 'آدرس و مسیریابی',
    hours: 'ساعت کاری',
    save: 'ذخیره در مخاطبین',
    saveHint: 'افزودن اطلاعات به مخاطبین گوشی شما',
    savedIos:
      'در صفحه‌ای که باز می‌شود «ایجاد مخاطب جدید» را بزنید. اگر از داخل اینستاگرام یا تلگرام آمده‌اید و صفحه‌ای باز نشد، این کارت را در Safari باز کنید.',
    savedOther:
      'فایل مخاطب دانلود شد. آن را از اعلان دانلود باز کنید تا در دفترچه تلفن ذخیره شود. اگر از داخل اینستاگرام یا تلگرام آمده‌اید، اول صفحه را در Chrome باز کنید.',
    gallery: 'نمونه‌کارها',
    galleryOpen: (i: number) => `بزرگ‌نمایی نمونه‌کار ${i}`,
    close: 'بستن',
    next: 'بعدی',
    previous: 'قبلی',
    scanOrShare: 'اسکن یا اشتراک‌گذاری',
    qrAria: 'بزرگنمایی کد QR و اشتراک‌گذاری کارت',
    share: 'اشتراک‌گذاری لینک کارت و بارکد',
    saveShort: 'ذخیره مخاطب',
  },
  en: {
    switchTo: 'فارسی',
    switchLabel: 'نمایش کارت به فارسی',
    avatarAlt: (name: string) => `Photo of ${name}`,
    call: 'Call',
    callAria: (n: string) => `Call ${n}`,
    whatsapp: 'WhatsApp',
    whatsappAria: (n: string) => `Message ${n} on WhatsApp`,
    whatsappMessage: 'Hello, I am contacting you from your digital business card.',
    landline: 'Office',
    landlineAria: (n: string) => `Call the office ${n}`,
    instagram: 'Instagram',
    instagramAria: (h: string) => `Instagram page ${h}`,
    website: 'Website',
    websiteAria: (w: string) => `Website ${w}`,
    catalog: 'Product catalog',
    catalogDownload: 'Download catalog',
    catalogDownloading: 'Downloading the catalog…',
    mb: 'MB',
    kb: 'KB',
    email: 'Email',
    emailAria: (e: string) => `Email ${e}`,
    address: 'Address & directions',
    hours: 'Working hours',
    save: 'Save contact',
    saveHint: 'Add these details to your phone',
    savedIos: 'Tap "Create New Contact" on the screen that opens. If nothing opens inside Instagram or Telegram, open this card in Safari.',
    savedOther: 'The contact file was downloaded. Open it from the download notification to save it. Inside Instagram or Telegram, open the card in Chrome first.',
    gallery: 'Our projects',
    galleryOpen: (i: number) => `Enlarge project photo ${i}`,
    close: 'Close',
    next: 'Next',
    previous: 'Previous',
    scanOrShare: 'Scan or share',
    qrAria: 'Enlarge the QR code and share this card',
    share: 'Share the card link and QR code',
    saveShort: 'Save contact',
  },
} as const;

/** ?lang=en on the link (e.g. printed English cards) or the visitor's last choice; Persian otherwise. */
export function initialCardLang(hasEnglish: boolean): CardLang {
  if (!hasEnglish || typeof window === 'undefined') return 'fa';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl === 'en' || fromUrl === 'fa') return fromUrl;
    const saved = localStorage.getItem('roya_card_lang');
    if (saved === 'en' || saved === 'fa') return saved;
  } catch {
    // ignore
  }
  return 'fa';
}
