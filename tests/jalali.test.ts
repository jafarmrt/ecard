import { describe, expect, it } from 'vitest';
import { jalaliMonthKey, jalaliMonthRange, jalaliParts, tehranDayOf } from '../src/utils/jalali';

describe('jalali months', () => {
  it('converts Gregorian days', () => {
    expect(jalaliParts('2026-03-21')).toEqual({ y: 1405, m: 1, d: 1 });
    expect(jalaliParts('2026-11-03')).toEqual({ y: 1405, m: 8, d: 12 });
  });

  it('counts the day in Tehran time', () => {
    expect(tehranDayOf('2026-02-01T21:00:00Z')).toBe('2026-02-02');
    // 23:00 UTC on 22 Oct is already 1 Aban in Tehran.
    expect(jalaliMonthKey('2026-10-22T23:00:00Z')).toBe('1405-08');
  });

  it('gives this month up to today and whole earlier months', () => {
    expect(jalaliMonthRange(0, '2026-11-03')).toMatchObject({ from: '2026-10-23', to: '2026-11-03', key: '1405-08' });
    expect(jalaliMonthRange(-1, '2026-11-03')).toMatchObject({ from: '2026-09-23', to: '2026-10-22', key: '1405-07' });
    expect(jalaliMonthRange(-8, '2026-11-03')).toMatchObject({ from: '2026-02-20', to: '2026-03-20', key: '1404-12' });
  });
});
