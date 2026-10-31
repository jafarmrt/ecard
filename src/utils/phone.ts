/** Phone helpers shared by the browser and the server (pure functions). */

/** Convert Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII digits. */
export function toEnglishDigits(input: string | undefined | null): string {
  return String(input ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * Normalise an Iranian mobile number to the 09xxxxxxxxx form.
 * Accepts Persian digits, spaces, dashes and +98 / 0098 / 98 prefixes.
 * Returns null when the value is not a valid Iranian mobile number.
 */
export function normalizeIranMobile(input: string | undefined | null): string | null {
  const digits = toEnglishDigits(input).replace(/[\s\-().]/g, '');
  const match = digits.match(/^(?:\+98|0098|98|0)?(9\d{9})$/);
  return match ? `0${match[1]}` : null;
}

/** Digits (and a leading +) for tel: links. */
export function telHref(input: string | undefined | null): string {
  return toEnglishDigits(input).replace(/[^\d+]/g, '');
}

/** International number without + for wa.me links (Iranian numbers get the 98 prefix). */
export function whatsappNumber(input: string | undefined | null): string {
  const digits = toEnglishDigits(input).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('98')) return digits;
  if (digits.startsWith('0')) return `98${digits.slice(1)}`;
  return `98${digits}`;
}

/** Show ASCII digits as Persian digits (for display only; links keep ASCII digits). */
export function toPersianDigits(input: string | number | undefined | null): string {
  return String(input ?? '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
