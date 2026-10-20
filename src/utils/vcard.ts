import { EmployeeProfile } from '../types';

function toEnglishDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
}

/**
 * Standard UTF-8 Compliant vCard 3.0 Generator
 * Fully compatible with iOS Contacts (iPhone/iPad), Android Contacts, macOS & Outlook
 */
export function generateVCardString(profile: EmployeeProfile): string {
  // Normalize mobile and landline (strip non-numeric except leading +)
  const cleanMobile = toEnglishDigits(profile.mobile).replace(/[^\d+]/g, '');
  const cleanLandline = toEnglishDigits(profile.landline).replace(/[^\d+]/g, '');

  // Split full name into First and Last names
  const nameParts = profile.name.trim().split(/\s+/);
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  const firstName = nameParts[0] || '';

  const currentHost = typeof window !== 'undefined' ? window.location.origin : 'https://card.royaco.com';
  const cardUrl = `${currentHost}/${profile.slug || profile.id}`;

  const vcardLines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N;CHARSET=UTF-8:${lastName};${firstName};;;`,
    `FN;CHARSET=UTF-8:${profile.name}`,
    `ORG;CHARSET=UTF-8:${profile.company || 'شرکت رویا طرح داخلی'};${profile.department || 'پروژه‌ای'}`,
    `TITLE;CHARSET=UTF-8:${profile.title}`,
    `TEL;TYPE=CELL,VOICE,PREF:${cleanMobile || profile.mobile}`,
  ];

  if (cleanLandline || profile.landline) {
    vcardLines.push(`TEL;TYPE=WORK,VOICE:${cleanLandline || profile.landline}`);
  }

  if (profile.email) {
    vcardLines.push(`EMAIL;TYPE=INTERNET,WORK,PREF:${profile.email}`);
  }

  // Official & Card URLs
  vcardLines.push(`URL;TYPE=WORK,PREF:${cardUrl}`);
  const siteUrl = profile.websiteUrl || (profile.website ? (profile.website.startsWith('http') ? profile.website : `https://${profile.website}`) : '');
  if (siteUrl && siteUrl !== cardUrl) {
    vcardLines.push(`URL;TYPE=WORK:${siteUrl}`);
  }

  // Postal Address
  if (profile.address) {
    // ADR components: Post Office Box; Extended Address; Street; Locality (City); Region (State); Postal Code; Country
    vcardLines.push(`ADR;TYPE=WORK,POSTAL;CHARSET=UTF-8:;;${profile.address};تهران;تهران;${profile.postalCode || '1939613111'};ایران`);
    vcardLines.push(`LABEL;TYPE=WORK;CHARSET=UTF-8:${profile.address}`);
  }

  // Social Profiles
  if (profile.instagram) {
    const handle = profile.instagram.replace('@', '');
    vcardLines.push(`X-SOCIALPROFILE;TYPE=instagram:https://instagram.com/${handle}`);
  }

  // Catalog URL if available
  if (profile.catalogPdfUrl || profile.catalogUrl) {
    const catUrl = profile.catalogPdfUrl || profile.catalogUrl || '';
    if (catUrl.startsWith('http')) {
      vcardLines.push(`URL;TYPE=OTHER;LABEL="کاتالوگ محصولات":${catUrl}`);
    }
  }

  // Bio / Note
  const noteLines = [
    `کارت ویزیت دیجیتال هوشمند رویا طرح داخلی (ROYA Surface Center)`,
    profile.slogan ? `شعار سازمانی: ${profile.slogan}` : '',
    profile.bio ? `توضیحات: ${profile.bio}` : '',
    `لینک مستقیم کارت: ${cardUrl}`
  ].filter(Boolean).join(' \\n ');

  vcardLines.push(`NOTE;CHARSET=UTF-8:${noteLines}`);
  vcardLines.push(`PRODID:-//ROYA Surface Center//Smart NFC Digital Card 2026//FA`);
  vcardLines.push('REV:' + new Date().toISOString());
  vcardLines.push('END:VCARD');

  return vcardLines.join('\r\n');
}

/**
 * Initiates direct download of UTF-8 encoded .vcf file
 */
export function downloadVCard(profile: EmployeeProfile): boolean {
  try {
    const vcardContent = generateVCardString(profile);
    
    // Add UTF-8 BOM for Windows / older Outlook compatibility
    const bom = '\uFEFF';
    const blob = new Blob([bom + vcardContent], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    
    // Clean ASCII or Unicode filename
    const safeName = profile.nameEn ? profile.nameEn.replace(/\s+/g, '_') : profile.name.replace(/\s+/g, '_');
    link.download = `${safeName}_Roya_Contact.vcf`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 2000);

    return true;
  } catch (error) {
    console.error('Error downloading vCard:', error);
    return false;
  }
}

/**
 * Share contact using Web Share API
 */
export async function shareContact(profile: EmployeeProfile): Promise<boolean> {
  const currentHost = typeof window !== 'undefined' ? window.location.origin : '';
  const currentUrl = `${currentHost}/${profile.slug || profile.id}`;
  
  if (navigator.share) {
    try {
      await navigator.share({
        title: `${profile.name} | ${profile.title} | ${profile.company}`,
        text: `کارت ویزیت دیجیتال هوشمند ${profile.name} (${profile.title} شرکت رویا طرح داخلی)`,
        url: currentUrl,
      });
      return true;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  }
  return false;
}
