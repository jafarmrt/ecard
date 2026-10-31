import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { PNG_1PX, setupTempDataDir } from './helpers';

// The data folder must be set before the server modules are loaded.
const tmp = setupTempDataDir();

let app: import('express').Express;
let db: typeof import('../src/server/db.ts').db;
let injectDynamicOpenGraph: typeof import('../src/server/app.ts').injectDynamicOpenGraph;
let cookie = '';

const auth = () => ({ Cookie: cookie });
const CONSENT = { consent: true };

async function login(password = 'test-admin-password') {
  const res = await request(app).post('/api/auth/login').send({ password });
  const setCookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0] || '';
  return { res, cookie: setCookie.split(';')[0] };
}

beforeAll(async () => {
  const appModule = await import('../src/server/app.ts');
  const dbModule = await import('../src/server/db.ts');
  app = appModule.createApp();
  injectDynamicOpenGraph = appModule.injectDynamicOpenGraph;
  db = dbModule.db;
  const first = await login();
  expect(first.res.status).toBe(200);
  cookie = first.cookie;
});

describe('admin authentication', () => {
  it.each(['roya1403', 'admin123', 'roya2026'])('rejects the old default password %s', async (password) => {
    expect((await login(password)).res.status).toBe(401);
  });

  it('uses an HttpOnly cookie and never returns the token to the page', async () => {
    const { res, cookie: c } = await login();
    expect(res.body.token).toBeUndefined();
    const header = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/SameSite=Strict/);
    expect(c).toMatch(/^roya_admin=roya_token_/);
  });

  it('refuses cookie-authenticated changes from another site', async () => {
    const res = await request(app)
      .put('/api/organization')
      .set(auth())
      .set('Origin', 'https://evil.example')
      .send({ slogan: 'x' });
    expect(res.status).toBe(403);
  });

  it('revokes the session on logout', async () => {
    const { cookie: c } = await login();
    expect((await request(app).post('/api/auth/check').set('Cookie', c)).body.valid).toBe(true);
    await request(app).post('/api/auth/logout').set('Cookie', c);
    expect((await request(app).post('/api/auth/check').set('Cookie', c)).body.valid).toBe(false);
  });

  it('requires 10 characters for a new password', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set(auth())
      .send({ oldPassword: 'test-admin-password', newPassword: 'short-pw1' });
    expect(res.status).toBe(400);
  });
});

describe('profiles', () => {
  it('keeps the full list admin-only', async () => {
    expect((await request(app).get('/api/profiles')).status).toBe(401);
    const res = await request(app).get('/api/profiles').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.profiles.length).toBeGreaterThan(0);
  });

  it('serves a public card without analytics or admin fields', async () => {
    const res = await request(app).get('/api/profiles/tajik');
    expect(res.status).toBe(200);
    expect(res.body.profile.id).toBe('amir-tajik');
    expect(res.body.profile.analytics).toBeUndefined();
    expect(res.body.profile.overrides).toBeUndefined();
    expect(res.body.profile.company).toBeTruthy(); // inherited from the organisation
  });

  it('rejects a duplicate slug instead of hijacking the existing card', async () => {
    const res = await request(app).post('/api/profiles').set(auth()).send({ id: 'new-person', slug: 'tajik', name: 'شخص جدید' });
    expect(res.status).toBe(409);
    expect((await request(app).get('/api/profiles/tajik')).body.profile.id).toBe('amir-tajik');
  });

  it('rejects reserved slugs', async () => {
    const res = await request(app).post('/api/profiles').set(auth()).send({ id: 'reserved-test', slug: 'api', name: 'تست' });
    expect(res.status).toBe(400);
  });

  it('creates a card and prefers an exact id over another card slug', async () => {
    const create = await request(app).post('/api/profiles').set(auth()).send({ id: 'sara', slug: 'sara-k', name: 'سارا', nameEn: 'Sara' });
    expect(create.status).toBe(201);
    const clash = await request(app).post('/api/profiles').set(auth()).send({ id: 'other', slug: 'sara', name: 'دیگر' });
    expect(clash.status).toBe(409);
    expect((await request(app).get('/api/profiles/sara')).body.profile.id).toBe('sara');
    expect((await request(app).get('/api/profiles/sara-k')).body.profile.id).toBe('sara');
  });

  it('does not let a client overwrite analytics', async () => {
    const res = await request(app).put('/api/profiles/sara').set(auth()).send({ name: 'سارا', slug: 'sara-k', analytics: { views: 99999 } });
    expect(res.status).toBe(200);
    expect(res.body.profile.analytics.views).toBe(0);
  });

  it('keeps an old short link working after the slug changes', async () => {
    const res = await request(app).put('/api/profiles/sara').set(auth()).send({ name: 'سارا', slug: 'sara-new' });
    expect(res.status).toBe(200);
    expect(res.body.profile.previousSlugs).toContain('sara-k');
    const old = await request(app).get('/api/profiles/sara-k');
    expect(old.body.profile.id).toBe('sara');
    expect(old.body.canonicalSlug).toBe('sara-new');
    // Nobody else can take the old link.
    const steal = await request(app).post('/api/profiles').set(auth()).send({ id: 'thief', slug: 'sara-k', name: 'x' });
    expect(steal.status).toBe(409);
  });
});

describe('organisation and branches', () => {
  it('applies a company-wide change to every card that does not override it', async () => {
    const res = await request(app).put('/api/organization').set(auth()).send({ website: 'royaco.ir' });
    expect(res.status).toBe(200);
    expect(res.body.organization.websiteUrl).toBe('https://royaco.ir');
    const card = (await request(app).get('/api/profiles/sara-new')).body.profile;
    expect(card.website).toBe('royaco.ir');
  });

  it('lets one card override an inherited field', async () => {
    await request(app).put('/api/profiles/sara').set(auth()).send({ name: 'سارا', slug: 'sara-new', website: 'sara.example' });
    const list = (await request(app).get('/api/profiles').set(auth())).body.profiles;
    const sara = list.find((p: any) => p.id === 'sara');
    expect(sara.website).toBe('sara.example');
    expect(sara.overrides).toContain('website');
    const tajik = list.find((p: any) => p.id === 'amir-tajik');
    expect(tajik.website).toBe('royaco.ir');
  });

  it('moves cards to the address of a new branch', async () => {
    const created = await request(app)
      .post('/api/branches')
      .set(auth())
      .send({ name: 'شوروم غرب', address: 'سعادت‌آباد', landline: '021 1111 2222', mapLocation: { lat: 35.78, lng: 51.37 } });
    expect(created.status).toBe(201);
    const branchId = created.body.branch.id;
    await request(app).put('/api/profiles/sara').set(auth()).send({ name: 'سارا', slug: 'sara-new', branchId });
    const card = (await request(app).get('/api/profiles/sara-new')).body.profile;
    expect(card.address).toBe('سعادت‌آباد');
    expect(card.landline).toBe('021 1111 2222');
    expect(card.mapLocation.lat).toBeCloseTo(35.78);
  });
});

describe('archiving', () => {
  it('archives instead of deleting and sends visitors to the replacement card', async () => {
    await request(app).post('/api/profiles').set(auth()).send({ id: 'leaver', slug: 'leaver', name: 'همکار سابق' });
    const del = await request(app).delete('/api/profiles/leaver').set(auth());
    expect(del.status).toBe(200);
    expect(del.body.archived).toBe(true);
    // Without a replacement: the card is unavailable but the company info is shown.
    const gone = await request(app).get('/api/profiles/leaver');
    expect(gone.status).toBe(410);
    expect(gone.body.company.company).toBeTruthy();
    // With a replacement: visitors land on the colleague's card.
    await request(app).post('/api/profiles/leaver/archive').set(auth()).send({ redirectTo: 'amir-tajik' });
    const redirected = await request(app).get('/api/profiles/leaver');
    expect(redirected.status).toBe(200);
    expect(redirected.body.profile.id).toBe('amir-tajik');
    expect(redirected.body.replacedFrom.name).toBe('همکار سابق');
  });

  it('only deletes archived cards permanently', async () => {
    const active = await request(app).delete('/api/profiles/amir-tajik?permanent=1').set(auth());
    expect(active.status).toBe(409);
    const removed = await request(app).delete('/api/profiles/leaver?permanent=1').set(auth());
    expect(removed.status).toBe(200);
    expect((await request(app).get('/api/profiles/leaver')).status).toBe(404);
  });

  it('can bring an archived card back', async () => {
    await request(app).post('/api/profiles').set(auth()).send({ id: 'back', name: 'بازگشت' });
    await request(app).post('/api/profiles/back/archive').set(auth()).send({});
    expect((await request(app).get('/api/profiles/back')).status).toBe(410);
    await request(app).post('/api/profiles/back/restore').set(auth());
    expect((await request(app).get('/api/profiles/back')).status).toBe(200);
  });
});

describe('leads', () => {
  it('validates the mobile number, name and consent', async () => {
    const bad = await request(app).post('/api/leads').send({ profileId: 'amir-tajik', customerName: 'علی', customerMobile: '123', ...CONSENT });
    expect(bad.status).toBe(400);
    const longName = await request(app)
      .post('/api/leads')
      .send({ profileId: 'amir-tajik', customerName: 'x'.repeat(500), customerMobile: '09121234567', ...CONSENT });
    expect(longName.status).toBe(400);
    const noConsent = await request(app).post('/api/leads').send({ profileId: 'amir-tajik', customerName: 'علی', customerMobile: '09121234567' });
    expect(noConsent.status).toBe(400);
    const badTopic = await request(app)
      .post('/api/leads')
      .send({ profileId: 'amir-tajik', customerName: 'علی', customerMobile: '09121234567', topic: 'هک', ...CONSENT });
    expect(badTopic.status).toBe(400);
  });

  it('normalises the number, stores topic and consent and keeps the right employee', async () => {
    const res = await request(app)
      .post('/api/leads')
      .send({ profileId: 'sara', customerName: 'علی رضایی', customerMobile: '+98 912 123 4567', topic: 'استعلام قیمت', source: 'qr', ...CONSENT });
    expect(res.status).toBe(201);
    expect(res.body.lead.customerMobile).toBeUndefined(); // the public reply does not echo data
    const leads = (await request(app).get('/api/leads').set(auth())).body.leads;
    const lead = leads.find((l: any) => l.id === res.body.lead.id);
    expect(lead.customerMobile).toBe('09121234567');
    expect(lead.profileId).toBe('sara');
    expect(lead.topic).toBe('استعلام قیمت');
    expect(lead.consentAt).toBeTruthy();
    expect(lead.source).toBe('qr');
  });

  it('does not attribute a lead for an unknown card to someone else', async () => {
    const res = await request(app).post('/api/leads').send({ profileId: 'nobody', customerName: 'مهمان', customerMobile: '09351234567', ...CONSENT });
    expect(res.status).toBe(201);
    const leads = (await request(app).get('/api/leads').set(auth())).body.leads;
    expect(leads.find((l: any) => l.id === res.body.lead.id).profileId).toBe('');
  });

  it('silently drops honeypot submissions', async () => {
    const before = (await request(app).get('/api/leads').set(auth())).body.count;
    const res = await request(app)
      .post('/api/leads')
      .send({ profileId: 'sara', customerName: 'ربات', customerMobile: '09121234567', website: 'spam', ...CONSENT });
    expect(res.status).toBe(201);
    expect((await request(app).get('/api/leads').set(auth())).body.count).toBe(before);
  });
});

describe('vCard', () => {
  it('works for a card with only a name and never prints "undefined"', async () => {
    await request(app).post('/api/profiles').set(auth()).send({ id: 'minimal', name: 'حداقلی' });
    const res = await request(app).get('/api/vcard/minimal');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/vcard');
    expect(res.text).toContain('FN;CHARSET=UTF-8:حداقلی');
    expect(res.text).not.toContain('undefined');
    expect(res.text).not.toMatch(/^TITLE/m);
  });
});

describe('analytics', () => {
  it('stores dated events with source and device and ignores link-preview bots', async () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
    expect((await request(app).post('/api/analytics/sara/event').set('User-Agent', iphone).send({ event: 'instagram' })).status).toBe(200);
    expect((await request(app).post('/api/analytics/sara/event').set('User-Agent', iphone).send({ event: 'view', source: 'nfc' })).status).toBe(200);
    expect((await request(app).post('/api/analytics/sara/event').set('User-Agent', 'TelegramBot (like TwitterBot)').send({ event: 'view' })).status).toBe(200);
    expect((await request(app).post('/api/analytics/sara/event').send({ event: 'hack' })).status).toBe(400);

    const summary = (await request(app).get('/api/analytics/summary').set(auth())).body.summary;
    expect(summary.totalInstagramClicks).toBe(1);
    expect(summary.totalViews).toBe(1); // the bot was not counted
    expect(summary.totalNfcTaps).toBe(1);

    const series = (await request(app).get('/api/analytics/timeseries?profileId=sara').set(auth())).body;
    const today = series.days.find((d: any) => d.day === new Date().toISOString().slice(0, 10));
    expect(today.views).toBe(1);
    expect(today.interactions).toBe(1);
    expect(series.bySource).toEqual([{ source: 'nfc', device: 'ios', n: 1 }]);
  });

  it('returns a row for every day in the range, including quiet days', async () => {
    const res = await request(app).get('/api/analytics/timeseries?from=2026-01-01&to=2026-01-07').set(auth());
    expect(res.body.days.map((d: any) => d.day)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
    ]);
    expect(res.body.days.every((d: any) => d.views === 0)).toBe(true);
  });
});

describe('uploads', () => {
  it('stores an uploaded image as optimised WebP (raw body)', async () => {
    const png = Buffer.from(PNG_1PX.split(',')[1], 'base64');
    const res = await request(app)
      .post('/api/upload-image?type=avatar&profileId=sara')
      .set(auth())
      .set('Content-Type', 'image/png')
      .send(png);
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\/images\/avatar-sara-.+\.webp$/);
  });

  it('still accepts the old base64 JSON upload', async () => {
    const res = await request(app).post('/api/upload-image').set(auth()).send({ fileData: PNG_1PX, type: 'logo' });
    expect(res.status).toBe(200);
  });

  it('rejects SVG and files that only pretend to be images', async () => {
    const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
    expect((await request(app).post('/api/upload-image').set(auth()).send({ fileData: svg })).status).toBe(400);
    const fake = Buffer.from('<script>alert(1)</script>'.repeat(3));
    expect((await request(app).post('/api/upload-image').set(auth()).set('Content-Type', 'image/png').send(fake)).status).toBe(400);
  });

  it('rejects a fake PDF', async () => {
    const res = await request(app)
      .post('/api/upload-pdf?fileName=x.pdf')
      .set(auth())
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('<html></html>'));
    expect(res.status).toBe(400);
  });

  it('removes uploaded files that no card uses', async () => {
    const png = Buffer.from(PNG_1PX.split(',')[1], 'base64');
    const used = (await request(app).post('/api/upload-image?profileId=back').set(auth()).set('Content-Type', 'image/png').send(png)).body.url;
    const unused = (await request(app).post('/api/upload-image?profileId=tmp').set(auth()).set('Content-Type', 'image/png').send(png)).body.url;
    await request(app).put('/api/profiles/back').set(auth()).send({ name: 'بازگشت', avatarUrl: used });
    const removed = db.cleanupUploads(0);
    expect(removed).toContain(unused);
    expect(removed).not.toContain(used);
  });
});

describe('backup and restore', () => {
  it('never contains credentials', async () => {
    const res = await request(app).get('/api/backup').set(auth());
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/admin_hash|adminSalt|adminPasswordHash|session_secret|sessionSecret/);
    expect(res.body.organization).toBeTruthy();
    expect(Array.isArray(res.body.branches)).toBe(true);
  });

  it('previews, keeps a safety copy, then restores', async () => {
    const backup = (await request(app).get('/api/backup').set(auth())).body;
    const smaller = { ...backup, profiles: backup.profiles.filter((p: any) => p.id !== 'minimal') };
    const preview = (await request(app).post('/api/restore/preview').set(auth()).send(smaller)).body.preview;
    expect(preview.valid).toBe(true);
    expect(preview.removed).toEqual(['minimal']);

    const res = await request(app).post('/api/restore').set(auth()).send(smaller);
    expect(res.status).toBe(200);
    expect(res.body.safetyCopy).toMatch(/^roya-pre-restore-.*\.db$/);
    expect(fs.existsSync(path.join(tmp, 'data', 'backups', res.body.safetyCopy))).toBe(true);
    expect((await request(app).get('/api/profiles/minimal')).status).toBe(404);
    expect((await request(app).get('/api/profiles/sara-k')).body.profile.id).toBe('sara'); // old links survive
  });

  it('refuses a broken backup', async () => {
    const res = await request(app).post('/api/restore').set(auth()).send({ profiles: [{ id: '../x', name: 1 }] });
    expect(res.status).toBe(400);
  });

  it('the old reset button is gone', async () => {
    expect((await request(app).post('/api/profiles/reset').set(auth())).status).toBe(404);
  });
});

describe('admin tools', () => {
  it('reports system health and writes the audit log', async () => {
    const health = (await request(app).get('/api/admin/health').set(auth())).body.health;
    expect(health.version).toBeTruthy();
    expect(health.profiles).toBeGreaterThan(0);
    expect(health.databaseBytes).toBeGreaterThan(0);
    expect(health.lastBackupAt).toBeTruthy(); // the pre-restore copy
    const log = (await request(app).get('/api/audit').set(auth())).body;
    const actions = log.entries.map((e: any) => `${e.action}:${e.entity}`);
    expect(actions).toContain('restore:backup');
    expect(actions).toContain('archive:profile');
    expect(actions).toContain('login:session');
  });
});

describe('pages', () => {
  const tpl = () => fs.readFileSync(path.resolve('index.html'), 'utf-8');
  const fakeReq = (url: string) =>
    ({ path: url, originalUrl: url, query: {}, headers: { host: 'card.test' }, protocol: 'https', get: () => 'card.test' }) as any;

  it('returns 404 for an unknown card and fills Open Graph for a known one', () => {
    expect(injectDynamicOpenGraph(tpl(), fakeReq('/no-such-card')).status).toBe(404);
    const known = injectDynamicOpenGraph(tpl(), fakeReq('/tajik'));
    expect(known.status).toBe(200);
    expect(known.html).toContain('<meta property="og:title" content="امیر تاجیک');
    expect(known.html).toContain('/api/og/amir-tajik.png');
  });

  it('serves the admin panel page instead of a "card not found" 404', () => {
    expect(injectDynamicOpenGraph(tpl(), fakeReq('/admin')).status).toBe(200);
  });

  it('renders a 1200x630 link preview image', async () => {
    const res = await request(app).get('/api/og/amir-tajik.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    const sharp = (await import('sharp')).default;
    const meta = await sharp(res.body).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
  });

  it('returns JSON for unknown API routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('sends basic security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
