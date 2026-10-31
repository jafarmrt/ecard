import { describe, expect, it } from 'vitest';
import { buildVCard, escapeVCardText } from '../src/utils/vcardBuilder';
import { INITIAL_PROFILES } from '../src/data/defaultProfiles';
import { EmployeeProfile } from '../src/types';

const minimal = { id: 'p1', name: 'سارا', mobile: '0912 000 1111' } as EmployeeProfile;

describe('vCard builder', () => {
  it('escapes special characters', () => {
    expect(escapeVCardText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('never writes "undefined" for missing fields', () => {
    const v = buildVCard(minimal, { origin: 'https://card.royaco.com' });
    expect(v).not.toContain('undefined');
    expect(v).not.toContain('TITLE');
    expect(v).not.toContain('ADR');
    expect(v).toContain('TEL;TYPE=CELL,VOICE,PREF:09120001111');
    expect(v).toContain('URL;TYPE=WORK,PREF:https://card.royaco.com/p1');
  });

  it('does not invent a city or postal code', () => {
    const v = buildVCard({ ...minimal, address: 'اصفهان، خیابان چهارباغ' }, { origin: 'https://x' });
    expect(v).toContain('ADR;TYPE=WORK,POSTAL;CHARSET=UTF-8:;;اصفهان، خیابان چهارباغ;;;;ایران');
    expect(v).not.toContain('1939613111');
  });

  it('uses the instagram URL so the link matches the card', () => {
    const v = buildVCard(INITIAL_PROFILES[0], { origin: 'https://x' });
    expect(v).toContain('X-SOCIALPROFILE;TYPE=instagram:https://www.instagram.com/royaco');
  });
});
