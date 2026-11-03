import { afterEach, describe, expect, it } from 'vitest';
import { getBaseOrigin, getDirectCardUrl, hasConfiguredPublicOrigin, isInternalOrigin, setConfiguredPublicOrigin } from '../src/utils/url';
import type { EmployeeProfile } from '../src/types';

afterEach(() => setConfiguredPublicOrigin(null));

describe('card links for NFC tags and QR codes', () => {
  it('use the official address from the server, not the address the panel was opened with', () => {
    setConfiguredPublicOrigin('https://card.royaco.com/');
    expect(hasConfiguredPublicOrigin()).toBe(true);
    expect(getBaseOrigin()).toBe('https://card.royaco.com');
    expect(getDirectCardUrl({ id: 'p1', slug: 'tajik' } as EmployeeProfile)).toBe('https://card.royaco.com/tajik');
  });

  it('ignore an empty or malformed address', () => {
    setConfiguredPublicOrigin('');
    expect(hasConfiguredPublicOrigin()).toBe(false);
    setConfiguredPublicOrigin('card.royaco.com');
    expect(hasConfiguredPublicOrigin()).toBe(false);
    setConfiguredPublicOrigin('https://card.royaco.com/path');
    expect(hasConfiguredPublicOrigin()).toBe(false);
  });

  it('flag addresses that only work inside the office', () => {
    for (const o of [
      'http://card.royaco.com',
      'https://localhost:3000',
      'http://192.168.1.10:3000',
      'https://10.0.0.5',
      'https://172.20.1.1',
      'https://server',
      'https://printer.local',
    ]) {
      expect(isInternalOrigin(o), o).toBe(true);
    }
    expect(isInternalOrigin('https://card.royaco.com')).toBe(false);
    expect(isInternalOrigin('https://172.32.0.1')).toBe(false);
  });
});
