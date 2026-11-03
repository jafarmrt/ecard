/**
 * Solar Hijri (Jalali) month helpers on top of the browser's built-in calendar
 * support (Intl, "persian" calendar), with days counted in Tehran time
 * like the server's statistics.
 */
const TEHRAN_OFFSET_MS = 210 * 60 * 1000;
const DAY_MS = 86400000;

/** Tehran calendar day (YYYY-MM-DD, Gregorian) of an instant. */
export function tehranDayOf(instant: Date | string | number = Date.now()): string {
  return new Date(new Date(instant).getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

const numeric = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });

/** Jalali year, month and day of a Gregorian day (YYYY-MM-DD). */
export function jalaliParts(day: string): { y: number; m: number; d: number } {
  const parts = numeric.formatToParts(new Date(`${day}T12:00:00Z`));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** "آبان ۱۴۰۵" */
export function jalaliMonthLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fa-IR-u-ca-persian', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * First and last day (Gregorian YYYY-MM-DD) of a Jalali month: offset 0 is
 * this month up to today, -1 the whole previous month, and so on.
 */
export function jalaliMonthRange(offset = 0, today = tehranDayOf()): { from: string; to: string; label: string; key: string } {
  let end = today;
  let start = addDays(end, 1 - jalaliParts(end).d);
  for (let i = 0; i > offset; i--) {
    end = addDays(start, -1);
    start = addDays(end, 1 - jalaliParts(end).d);
  }
  const { y, m } = jalaliParts(start);
  return { from: start, to: end, label: jalaliMonthLabel(start), key: `${y}-${String(m).padStart(2, '0')}` };
}

/** Jalali month key ("1405-08") of an instant, by Tehran day. */
export function jalaliMonthKey(instant: Date | string | number): string {
  const { y, m } = jalaliParts(tehranDayOf(instant));
  return `${y}-${String(m).padStart(2, '0')}`;
}
