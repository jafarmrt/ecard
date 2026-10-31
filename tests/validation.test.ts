import { describe, expect, it } from 'vitest';
import { normalizeIranMobile, normalizeSlug, validateLeadInput, ValidationError } from '../src/server/validation';
import { whatsappNumber, telHref } from '../src/utils/phone';
import { resolveCatalogUrl } from '../src/utils/catalog';

describe('Iranian mobile numbers', () => {
  it.each([
    ['09121234567', '09121234567'],
    ['0912 123 4567', '09121234567'],
    ['۰۹۱۲۱۲۳۴۵۶۷', '09121234567'],
    ['+989121234567', '09121234567'],
    ['00989121234567', '09121234567'],
    ['9121234567', '09121234567'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeIranMobile(input)).toBe(expected);
  });

  it.each(['abc', '021 2599 1425', '0912123', '091212345678', ''])('rejects %s', (input) => {
    expect(normalizeIranMobile(input)).toBeNull();
  });

  it('builds wa.me and tel: numbers', () => {
    expect(whatsappNumber('0912 075 3287')).toBe('989120753287');
    expect(whatsappNumber('')).toBe('');
    expect(telHref('۰۲۱ ۲۵۹۹ ۱۴۲۵')).toBe('02125991425');
  });
});

describe('lead validation', () => {
  it('normalises a valid lead', () => {
    const lead = validateLeadInput({ profileId: 'x', customerName: '  علی رضایی ', customerMobile: '۰۹۱۲ ۱۲۳ ۴۵۶۷', consent: true });
    expect(lead.customerName).toBe('علی رضایی');
    expect(lead.customerMobile).toBe('09121234567');
  });

  it('rejects an invalid mobile and an oversized name', () => {
    expect(() => validateLeadInput({ customerName: 'Ali', customerMobile: 'abc' })).toThrow(ValidationError);
    expect(() => validateLeadInput({ customerName: 'x'.repeat(500), customerMobile: '09121234567' })).toThrow(ValidationError);
  });

  it('truncates long optional fields', () => {
    const lead = validateLeadInput({ customerName: 'Ali', customerMobile: '09121234567', note: 'n'.repeat(5000), consent: true });
    expect(lead.note!.length).toBe(1000);
  });
});

describe('slugs and catalog links', () => {
  it('normalises slugs', () => {
    expect(normalizeSlug(' Amir Tajik ')).toBe('amir-tajik');
    expect(normalizeSlug('آقای تاجیک')).toBe('');
  });

  it('never links the catalog button to display text', () => {
    expect(resolveCatalogUrl({ catalogPdfUrl: '', catalogUrl: 'کاتالوگ جامع محصولات رویا' })).toBe('/roya-catalog.pdf');
    expect(resolveCatalogUrl({ catalogPdfUrl: '', catalogUrl: 'catalog.royaco.com' })).toBe('https://catalog.royaco.com');
    expect(resolveCatalogUrl({ catalogPdfUrl: '/uploads/c.pdf', catalogUrl: 'x' })).toBe('/uploads/c.pdf');
  });
});
