import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { PNG_1PX, useTempDataDir } from './helpers';

// The data folder must be set before the server modules are loaded.
const tmp = useTempDataDir();

let app: import('express').Express;
let db: typeof import('../src/server/db.ts').db;
let injectDynamicOpenGraph: typeof import('../src/server/app.ts').injectDynamicOpenGraph;
let token = '';

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const appModule = await import('../src/server/app.ts');
  const dbModule = await import('../src/server/db.ts');
  app = appModule.createApp();
  injectDynamicOpenGraph = appModule.injectDynamicOpenGraph;
  db = dbModule.db;

  const res = await request(app).post('/api/auth/login').send({ password: 'test-admin-password' });
  expect(res.status).toBe(200);
  token = res.body.token;
});

describe('admin authentication', () => {
  it.each(['roya1403', 'admin123', 'roya2026'])('rejects the old default password %s', async (password) => {
    const res = await request(app).post('/api/auth/login').send({ password });
    expect(res.status).toBe(401);
  });

  it('refuses a token forged with the old salt+hash formula', async () => {
    const dbFile = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'database.json'), 'utf-8'));
    const payload = `${Date.now().toString(36)}.${crypto.randomBytes(16).toString('hex')}`;
    const oldSecret = `roya_secret_${dbFile.adminSalt}_${dbFile.adminPasswordHash}`;
    const sig = crypto.createHmac('sha256', oldSecret).update(payload).digest('hex');
    const forged = `roya_token_${payload}.${sig}`;
    const res = await request(app).get('/api/profiles').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('accepts the real token and revokes it on logout', async () => {
    const login = await request(app).post('/api/auth/login').send({ password: 'test-admin-password' });
    const t = login.body.token;
    expect((await request(app).post('/api/auth/check').set('Authorization', `Bearer ${t}`)).body.valid).toBe(true);
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${t}`);
    expect((await request(app).post('/api/auth/check').set('Authorization', `Bearer ${t}`)).body.valid).toBe(false);
  });
});

describe('profiles', () => {
  it('keeps the full list admin-only', async () => {
    expect((await request(app).get('/api/profiles')).status).toBe(401);
    const res = await request(app).get('/api/profiles').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.profiles.length).toBeGreaterThan(0);
  });

  it('serves a public card without analytics', async () => {
    const res = await request(app).get('/api/profiles/tajik');
    expect(res.status).toBe(200);
    expect(res.body.profile.id).toBe('amir-tajik');
    expect(res.body.profile.analytics).toBeUndefined();
  });

  it('rejects a duplicate slug instead of hijacking the existing card', async () => {
    const res = await request(app)
      .post('/api/profiles')
      .set(auth())
      .send({ id: 'new-person', slug: 'tajik', name: 'شخص جدید' });
    expect(res.status).toBe(409);
    const card = await request(app).get('/api/profiles/tajik');
    expect(card.body.profile.id).toBe('amir-tajik');
  });

  it('rejects reserved slugs', async () => {
    const res = await request(app)
      .post('/api/profiles')
      .set(auth())
      .send({ id: 'reserved-test', slug: 'api', name: 'تست' });
    expect(res.status).toBe(400);
  });

  it('creates a card and prefers an exact id over another card slug', async () => {
    const create = await request(app)
      .post('/api/profiles')
      .set(auth())
      .send({ id: 'sara', slug: 'sara-k', name: 'سارا', nameEn: 'Sara' });
    expect(create.status).toBe(201);
    // A second card whose slug equals the first card's id is refused.
    const clash = await request(app)
      .post('/api/profiles')
      .set(auth())
      .send({ id: 'other', slug: 'sara', name: 'دیگر' });
    expect(clash.status).toBe(409);
    expect((await request(app).get('/api/profiles/sara')).body.profile.id).toBe('sara');
    expect((await request(app).get('/api/profiles/sara-k')).body.profile.id).toBe('sara');
  });

  it('does not let a client overwrite analytics', async () => {
    const res = await request(app)
      .put('/api/profiles/sara')
      .set(auth())
      .send({ name: 'سارا', analytics: { views: 99999 } });
    expect(res.status).toBe(200);
    expect(res.body.profile.analytics.views).toBe(0);
  });
});

describe('leads', () => {
  it('validates the mobile number and name', async () => {
    const bad = await request(app).post('/api/leads').send({ profileId: 'amir-tajik', customerName: 'علی', customerMobile: '123' });
    expect(bad.status).toBe(400);
    const longName = await request(app)
      .post('/api/leads')
      .send({ profileId: 'amir-tajik', customerName: 'x'.repeat(500), customerMobile: '09121234567' });
    expect(longName.status).toBe(400);
  });

  it('normalises the number and keeps the right employee', async () => {
    const res = await request(app)
      .post('/api/leads')
      .send({ profileId: 'sara', customerName: 'علی رضایی', customerMobile: '+98 912 123 4567' });
    expect(res.status).toBe(201);
    expect(res.body.lead.customerMobile).toBeUndefined(); // the public reply does not echo data
    const leads = (await request(app).get('/api/leads').set(auth())).body.leads;
    const lead = leads.find((l: any) => l.id === res.body.lead.id);
    expect(lead.customerMobile).toBe('09121234567');
    expect(lead.profileId).toBe('sara');
  });

  it('does not attribute a lead for an unknown card to someone else', async () => {
    const res = await request(app)
      .post('/api/leads')
      .send({ profileId: 'nobody', customerName: 'مهمان', customerMobile: '09351234567' });
    expect(res.status).toBe(201);
    const leads = (await request(app).get('/api/leads').set(auth())).body.leads;
    const lead = leads.find((l: any) => l.id === res.body.lead.id);
    expect(lead.profileId).toBe('');
  });

  it('silently drops honeypot submissions', async () => {
    const before = (await request(app).get('/api/leads').set(auth())).body.count;
    const res = await request(app)
      .post('/api/leads')
      .send({ profileId: 'sara', customerName: 'ربات', customerMobile: '09121234567', website: 'spam' });
    expect(res.status).toBe(201);
    expect((await request(app).get('/api/leads').set(auth())).body.count).toBe(before);
  });
});

describe('vCard', () => {
  it('works for a card with only a name and never prints "undefined"', async () => {
    const res = await request(app).get('/api/vcard/sara');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/vcard');
    expect(res.text).toContain('FN;CHARSET=UTF-8:سارا');
    expect(res.text).not.toContain('undefined');
    expect(res.text).not.toMatch(/^TITLE/m);
  });
});

describe('analytics', () => {
  it('counts known events and rejects unknown ones', async () => {
    expect((await request(app).post('/api/analytics/sara/event').send({ event: 'instagram' })).status).toBe(200);
    expect((await request(app).post('/api/analytics/sara/event').send({ event: 'hack' })).status).toBe(400);
    const summary = (await request(app).get('/api/analytics/summary').set(auth())).body.summary;
    expect(summary.totalInstagramClicks).toBe(1);
  });
});

describe('uploads', () => {
  it('accepts a real PNG', async () => {
    const res = await request(app).post('/api/upload-image').set(auth()).send({ fileData: PNG_1PX, type: 'avatar', profileId: 'sara' });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\/images\/.+\.png$/);
  });

  it('rejects SVG and files that only pretend to be images', async () => {
    const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
    expect((await request(app).post('/api/upload-image').set(auth()).send({ fileData: svg })).status).toBe(400);
    const fake = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
    expect((await request(app).post('/api/upload-image').set(auth()).send({ fileData: fake })).status).toBe(400);
  });

  it('rejects a fake PDF', async () => {
    const res = await request(app)
      .post('/api/upload-pdf')
      .set(auth())
      .send({ fileName: 'x.pdf', fileData: Buffer.from('<html></html>').toString('base64') });
    expect(res.status).toBe(400);
  });
});

describe('backup', () => {
  it('never contains credentials', async () => {
    const res = await request(app).get('/api/backup').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.adminSalt).toBeUndefined();
    expect(res.body.adminPasswordHash).toBeUndefined();
    expect(res.body.sessionSecret).toBeUndefined();
    expect(Array.isArray(res.body.profiles)).toBe(true);
  });
});

describe('pages', () => {
  it('returns 404 for an unknown card and fills Open Graph for a known one', () => {
    const tpl = fs.readFileSync(path.resolve('index.html'), 'utf-8');
    const fakeReq = (url: string) => ({ path: url, originalUrl: url, query: {}, headers: { host: 'card.test' }, protocol: 'https', get: () => 'card.test' }) as any;
    expect(injectDynamicOpenGraph(tpl, fakeReq('/no-such-card')).status).toBe(404);
    const known = injectDynamicOpenGraph(tpl, fakeReq('/tajik'));
    expect(known.status).toBe(200);
    expect(known.html).toContain('<meta property="og:title" content="امیر تاجیک');
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

  it('flushes pending writes to disk', () => {
    db.flush();
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'database.json'), 'utf-8'));
    expect(onDisk.profiles.find((p: any) => p.id === 'sara').analytics.instagramClicks).toBe(1);
  });
});
