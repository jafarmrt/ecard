import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { setupTempDataDir } from './helpers';

// A 2.x database.json with a customised PBKDF2 password, two branches and some history.
const tmp = setupTempDataDir();
delete process.env.ADMIN_PASSWORD;
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync('old-custom-password', salt, 10000, 64, 'sha512').toString('hex');
const loc = (lat: number, lng: number) => ({ lat, lng, title: 'شوروم', googleMapsUrl: '', neshanUrl: '', baladUrl: '', wazeUrl: '' });
const base = {
  company: 'شرکت رویا طرح داخلی',
  companyEn: 'ROYA',
  slogan: 'Dream',
  website: 'www.royaco.com',
  websiteUrl: 'https://www.royaco.com',
  instagram: 'Royco',
  instagramUrl: 'https://www.instagram.com/royaco',
  catalogPdfUrl: '/roya-catalog.pdf',
  landline: '021 2599 1425',
  titleEn: '',
  nameEn: '',
  whatsapp: '',
  email: '',
};
fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'data', 'database.json'),
  JSON.stringify({
    version: 4,
    adminSalt: salt,
    adminPasswordHash: hash,
    isPasswordCustomized: true,
    profiles: [
      { ...base, id: 'a', slug: 'aa', name: 'الف', title: 't', mobile: '0912', address: 'قلهک', mapLocation: loc(35.7757, 51.4368), analytics: { views: 7, callClicks: 2 } },
      { ...base, id: 'b', slug: 'bb', name: 'ب', title: 't', mobile: '0912', address: 'قلهک', mapLocation: loc(35.7757, 51.4368) },
      { ...base, id: 'c', slug: 'cc', name: 'ج', title: 't', mobile: '0912', address: 'سعادت‌آباد', landline: '021 0000', mapLocation: loc(35.78, 51.37), website: 'c.example' },
    ],
    leads: [{ id: 'lead_1', profileId: 'a', profileName: 'الف', customerName: 'مشتری', customerMobile: '09120000000', createdAt: '2026-01-01T00:00:00.000Z' }],
    updatedAt: '2026-01-01T00:00:00.000Z',
  })
);

let db: typeof import('../src/server/db.ts').db;
beforeAll(async () => {
  db = (await import('../src/server/db.ts')).db;
});

describe('import of a 2.x database.json', () => {
  it('moves cards, leads and statistics into SQLite and keeps the json file', () => {
    const profiles = db.getAllProfiles();
    expect(profiles.map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
    expect(db.getAllLeads()).toHaveLength(1);
    const a = profiles.find((p) => p.id === 'a')!;
    expect(a.analytics?.views).toBe(7);
    expect(a.analytics?.callClicks).toBe(2);
    expect(a.analytics?.leadCaptures).toBe(1);
    expect(fs.existsSync(path.join(tmp, 'data', 'database.json'))).toBe(false);
    expect(fs.readdirSync(path.join(tmp, 'data')).some((n) => n.startsWith('database.json.imported-'))).toBe(true);
  });

  it('derives the organisation and one branch per office', () => {
    const org = db.getOrganization();
    expect(org.company).toBe('شرکت رویا طرح داخلی');
    expect(org.instagram).toBe('royaco'); // taken from the link, not the old "Royco" label
    const branches = db.getBranches();
    expect(branches).toHaveLength(2);
    expect(branches[0].isDefault).toBe(true);
    expect(branches[0].address).toBe('قلهک');
    const c = db.getProfileById('c')!;
    expect(c.address).toBe('سعادت‌آباد');
    expect(c.landline).toBe('021 0000');
    expect(c.website).toBe('c.example');
    expect(c.overrides).toContain('website');
    expect(db.getProfileById('a')!.overrides).toEqual([]);
  });

  it('keeps the customised password and upgrades its hash', () => {
    expect(db.verifyPassword('old-custom-password')).toBe(true);
    expect(db.verifyPassword('wrong-password')).toBe(false);
    expect(db.verifyPassword('old-custom-password')).toBe(true); // still works after the rehash
  });
});
