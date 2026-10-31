/**
 * Data layer on SQLite (see sqlite.ts for the schema).
 *
 * - Company-wide settings live in `organization`, address/phone/map in
 *   `branches`. A card stores only its personal fields plus the fields it
 *   overrides; everything else is inherited when the card is read.
 * - Analytics are rows in `events` (time, source, device), so statistics can
 *   be reported per day. Totals from the old JSON database are kept in
 *   `legacy_counters` and added on top.
 * - On first start an existing data/database.json is imported automatically and
 *   renamed to database.json.imported-<date>.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { INITIAL_PROFILES } from '../data/defaultProfiles.ts';
import { DEFAULT_COORDINATES, buildMapUrls } from '../utils/location.ts';
import { LEAD_TOPICS } from '../utils/leadTopics.ts';
import type {
  AuditEntry,
  Branch,
  CustomerLead,
  EmployeeAnalytics,
  EmployeeProfile,
  MapLocation,
  Organization,
  ProfileStatus,
} from '../types.ts';
import {
  ValidationError,
  LeadInput,
  MIN_PASSWORD_LENGTH,
  RESERVED_SLUGS,
  isValidIdentifier,
  normalizeSlug,
} from './validation.ts';
import { SqliteDb, backupTo, getDbPath, openDatabase, schemaVersion, transaction } from './sqlite.ts';
import { hashPassword, legacyPbkdf2Hash, needsRehash, safeEqualString, verifyPasswordHash } from './passwords.ts';
import { cleanupOrphanUploads, getUploadsDir, persistBase64Image } from './uploads.ts';

export { getUploadsDir, persistBase64Image };

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

export function getDataDir(): string {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
}
export function getBackupsDir(): string {
  return path.resolve(process.env.BACKUP_DIR || path.join(getDataDir(), 'backups'));
}
function legacyJsonFile(): string {
  return path.join(getDataDir(), 'database.json');
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Passwords that were hard-coded in earlier versions (source code and docker-compose).
 * They are public, so they are refused even if an old database still stores their hash.
 */
export const KNOWN_DEFAULT_PASSWORDS = new Set(['roya1403', 'admin123', 'roya2026']);

function envAdminPassword(): string | undefined {
  const value = process.env.ADMIN_PASSWORD;
  if (!value) return undefined;
  if (KNOWN_DEFAULT_PASSWORDS.has(value) || value.length < MIN_PASSWORD_LENGTH) {
    console.warn(
      `[Roya DB] ADMIN_PASSWORD is a known default or shorter than ${MIN_PASSWORD_LENGTH} characters and is ignored.`
    );
    return undefined;
  }
  return value;
}

/** Events the card page may report. nfcTap / qrScan are stored as a `view` with that source. */
export type AnalyticsEvent =
  | 'view'
  | 'nfcTap'
  | 'qrScan'
  | 'call'
  | 'whatsapp'
  | 'catalogDownload'
  | 'vcardDownload'
  | 'mapClick'
  | 'instagram'
  | 'website'
  | 'email';

export const ANALYTICS_EVENTS: AnalyticsEvent[] = [
  'view',
  'nfcTap',
  'qrScan',
  'call',
  'whatsapp',
  'catalogDownload',
  'vcardDownload',
  'mapClick',
  'instagram',
  'website',
  'email',
];

const INTERACTION_TYPES = ['call', 'whatsapp', 'catalogDownload', 'vcardDownload', 'mapClick', 'instagram', 'website', 'email'];

const EVENT_TO_FIELD: Record<string, keyof EmployeeAnalytics> = {
  view: 'views',
  call: 'callClicks',
  whatsapp: 'whatsappClicks',
  catalogDownload: 'catalogDownloads',
  vcardDownload: 'vcardDownloads',
  mapClick: 'mapClicks',
  instagram: 'instagramClicks',
  website: 'websiteClicks',
  email: 'emailClicks',
};

export type EventSource = 'nfc' | 'qr' | 'link';

export interface EventContext {
  source?: string;
  campaign?: string;
  userAgent?: string;
  ip?: string;
}

/** Fields a card inherits from the organisation unless it overrides them. */
export const ORG_FIELDS = [
  'company',
  'companyEn',
  'slogan',
  'logoUrl',
  'website',
  'websiteUrl',
  'instagram',
  'instagramUrl',
  'catalogUrl',
  'catalogPdfUrl',
  'layoutDirection',
] as const;
/** Fields a card inherits from its branch unless it overrides them. */
export const BRANCH_FIELDS = ['address', 'postalCode', 'landline', 'mapLocation'] as const;

/** Columns that are stored outside the profile JSON. */
const META_FIELDS = [
  'id',
  'slug',
  'status',
  'branchId',
  'redirectTo',
  'archivedAt',
  'analytics',
  'previousSlugs',
  'overrides',
  'createdAt',
  'updatedAt',
] as const;

export interface BulkBrandUpdatePayload {
  company?: string;
  website?: string;
  websiteUrl?: string;
  catalogUrl?: string;
  catalogPdfUrl?: string;
  layoutDirection?: 'rtl' | 'ltr';
  instagram?: string;
  instagramUrl?: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const now = () => new Date().toISOString();

function newSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function sameLocation(a?: Partial<MapLocation>, b?: Partial<MapLocation>): boolean {
  if (!a || !b) return false;
  return Math.abs(Number(a.lat) - Number(b.lat)) < 1e-6 && Math.abs(Number(a.lng) - Number(b.lng)) < 1e-6;
}

function sameValue(field: string, a: unknown, b: unknown): boolean {
  if (field === 'mapLocation') return sameLocation(a as MapLocation, b as MapLocation);
  return String(a ?? '').trim() === String(b ?? '').trim();
}

function withUrl(value: string, url: string | undefined, build: (v: string) => string): string {
  if (!isBlank(url)) return String(url).trim();
  if (isBlank(value)) return '';
  return build(String(value).trim());
}

const websiteToUrl = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);
const instagramToUrl = (v: string) =>
  /^https?:\/\//i.test(v) ? v : `https://www.instagram.com/${v.replace(/^@/, '').replace(/\/+$/, '')}`;

function mapLocationFrom(input: Partial<MapLocation> | undefined, fallbackTitle: string): MapLocation {
  const lat = Number(input?.lat) || DEFAULT_COORDINATES.lat;
  const lng = Number(input?.lng) || DEFAULT_COORDINATES.lng;
  return { lat, lng, title: input?.title || fallbackTitle, ...buildMapUrls(lat, lng) };
}

/** Device class from the User-Agent (no fingerprinting, only a coarse bucket). */
export function deviceFromUserAgent(ua: string | undefined): string {
  const s = String(ua || '');
  if (/iPhone|iPad|iPod/i.test(s)) return 'ios';
  if (/Android/i.test(s)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/i.test(s)) return 'desktop';
  return 'other';
}

/** Link preview fetchers and crawlers must not count as visitors. */
export function isBot(ua: string | undefined): boolean {
  return /bot|crawl|spider|preview|facebookexternalhit|WhatsApp|TelegramBot|Slackbot|Discordbot|curl|wget|python-requests|HeadlessChrome/i.test(
    String(ua || '')
  );
}

function normalizeSource(source: string | undefined): string {
  const s = String(source || '').toLowerCase();
  if (s === 'nfc' || s === 'qr') return s;
  return 'link';
}

function cleanCampaign(campaign: string | undefined): string | null {
  const c = String(campaign || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  return c || null;
}

// ---------------------------------------------------------------------------
// Connection & first-run setup
// ---------------------------------------------------------------------------

let connection: SqliteDb | null = null;
let connectionPath = '';

function conn(): SqliteDb {
  const file = getDbPath(getDataDir());
  if (connection && connectionPath === file) return connection;
  if (connection) {
    try {
      connection.close();
    } catch {}
  }
  const isNew = !fs.existsSync(file);
  connection = openDatabase(file);
  connectionPath = file;
  if (isNew || !getMeta('initialized')) initialize(connection);
  ensureSessionSecret();
  return connection;
}

function getMeta(key: string): string | undefined {
  const row = connection!.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

function setMeta(key: string, value: string) {
  connection!.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  );
}

function ensureSessionSecret() {
  if (!getMeta('session_secret')) setMeta('session_secret', newSecret());
}

function initialPassword(): { password: string; generated: boolean } {
  const fromEnv = envAdminPassword();
  if (fromEnv) return { password: fromEnv, generated: false };
  return { password: crypto.randomBytes(9).toString('base64url'), generated: true };
}

function initialize(db: SqliteDb) {
  const jsonFile = legacyJsonFile();
  let imported = false;
  if (fs.existsSync(jsonFile)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
      if (Array.isArray(legacy?.profiles)) {
        transaction(db, () => {
          importLegacyData(legacy, { credentials: true });
          setMeta('initialized', now());
          setMeta('migrated_from_json', now());
        });
        const target = `${jsonFile}.imported-${new Date().toISOString().slice(0, 10)}`;
        try {
          fs.renameSync(jsonFile, target);
        } catch {}
        console.log(`[Roya DB] Imported ${legacy.profiles.length} cards from database.json (kept as ${path.basename(target)}).`);
        imported = true;
      }
    } catch (err) {
      console.error('[Roya DB] Could not import database.json; starting with default data instead.', err);
    }
  }
  if (!imported) {
    transaction(db, () => {
      importLegacyData({ profiles: structuredClone(INITIAL_PROFILES), leads: [] }, { credentials: false });
      setMeta('initialized', now());
    });
  }
  if (!getMeta('admin_hash')) {
    const { password, generated } = initialPassword();
    setMeta('admin_hash', hashPassword(password));
    setMeta('password_customized', 'false');
    if (generated) {
      console.warn('==================================================================');
      console.warn('[Roya DB] New database created. Temporary admin password:');
      console.warn(`[Roya DB]   ${password}`);
      console.warn('[Roya DB] Log in and change it from the admin panel, or set ADMIN_PASSWORD.');
      console.warn('==================================================================');
    }
  }
}

// ---------------------------------------------------------------------------
// Organisation & branches
// ---------------------------------------------------------------------------

const DEFAULT_ORGANIZATION: Organization = {
  company: 'شرکت رویا طرح داخلی',
  companyEn: 'ROYA Surface Center',
  slogan: 'Dream | Design | Deliver',
  logoUrl: '',
  website: 'www.royaco.com',
  websiteUrl: 'https://www.royaco.com',
  instagram: 'royaco',
  instagramUrl: 'https://www.instagram.com/royaco',
  catalogUrl: '',
  catalogPdfUrl: '/roya-catalog.pdf',
  layoutDirection: 'rtl',
};

function normalizeOrganization(input: Partial<Organization>, base: Organization = DEFAULT_ORGANIZATION): Organization {
  const merged = { ...base, ...input } as Organization;
  const website = String(merged.website || '').trim();
  const instagram = String(merged.instagram || '')
    .trim()
    .replace(/^@/, '');
  return {
    company: String(merged.company || '').trim().slice(0, 120),
    companyEn: String(merged.companyEn || '').trim().slice(0, 120),
    slogan: String(merged.slogan || '').trim().slice(0, 120),
    logoUrl: String(merged.logoUrl || '').trim(),
    website,
    websiteUrl:
      'website' in input && !('websiteUrl' in input) ? withUrl(website, '', websiteToUrl) : withUrl(website, merged.websiteUrl, websiteToUrl),
    instagram,
    instagramUrl:
      'instagram' in input && !('instagramUrl' in input)
        ? withUrl(instagram, '', instagramToUrl)
        : withUrl(instagram, merged.instagramUrl, instagramToUrl),
    catalogUrl: String(merged.catalogUrl || '').trim(),
    catalogPdfUrl: String(merged.catalogPdfUrl || '').trim(),
    layoutDirection: merged.layoutDirection === 'ltr' ? 'ltr' : 'rtl',
  };
}

function readOrganization(): Organization {
  const row = conn().prepare('SELECT data FROM organization WHERE id = 1').get() as { data: string } | undefined;
  return row ? { ...DEFAULT_ORGANIZATION, ...JSON.parse(row.data) } : { ...DEFAULT_ORGANIZATION };
}

function writeOrganization(org: Organization) {
  conn()
    .prepare(
      'INSERT INTO organization (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    )
    .run(JSON.stringify(org), now());
}

function readBranches(): Branch[] {
  const rows = conn().prepare('SELECT id, data, is_default FROM branches ORDER BY is_default DESC, sort, created_at').all() as {
    id: string;
    data: string;
    is_default: number;
  }[];
  return rows.map((r) => ({ ...JSON.parse(r.data), id: r.id, isDefault: r.is_default === 1 }));
}

function defaultBranch(branches = readBranches()): Branch | undefined {
  return branches.find((b) => b.isDefault) || branches[0];
}

function normalizeBranch(input: Partial<Branch>, id: string): Branch {
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) throw new ValidationError('نام شعبه الزامی است.');
  return {
    id,
    name,
    address: String(input.address || '').trim().slice(0, 300),
    postalCode: String(input.postalCode || '').trim().slice(0, 20),
    landline: String(input.landline || '').trim().slice(0, 40),
    mapLocation: mapLocationFrom(input.mapLocation, name),
  };
}

function writeBranch(branch: Branch, opts: { isDefault?: boolean; createdAt?: string } = {}) {
  const { id, isDefault: _d, ...data } = branch;
  conn()
    .prepare(
      `INSERT INTO branches (id, data, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(id, JSON.stringify(data), opts.isDefault ? 1 : 0, opts.createdAt || now(), now());
}

// ---------------------------------------------------------------------------
// Profiles: storage format <-> resolved card
// ---------------------------------------------------------------------------

interface ProfileRow {
  id: string;
  slug: string | null;
  status: ProfileStatus;
  branch_id: string | null;
  redirect_to: string | null;
  data: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface Context {
  org: Organization;
  branches: Map<string, Branch>;
  fallbackBranch?: Branch;
  aliases: Map<string, string[]>;
}

function loadContext(): Context {
  const branches = readBranches();
  const aliases = new Map<string, string[]>();
  for (const row of conn().prepare('SELECT alias, profile_id FROM profile_aliases ORDER BY created_at').all() as {
    alias: string;
    profile_id: string;
  }[]) {
    aliases.set(row.profile_id, [...(aliases.get(row.profile_id) || []), row.alias]);
  }
  return {
    org: readOrganization(),
    branches: new Map(branches.map((b) => [b.id, b])),
    fallbackBranch: defaultBranch(branches),
    aliases,
  };
}

/** Builds the full card a visitor sees from the stored row + organisation + branch. */
function resolveRow(row: ProfileRow, ctx: Context): EmployeeProfile {
  const stored = JSON.parse(row.data) as Partial<EmployeeProfile>;
  const branch = (row.branch_id && ctx.branches.get(row.branch_id)) || ctx.fallbackBranch;
  const overrides: string[] = [];
  const pick = <T,>(field: string, inherited: T): T => {
    const own = (stored as any)[field];
    if (!isBlank(own)) {
      overrides.push(field);
      return own as T;
    }
    return inherited;
  };
  const profile: EmployeeProfile = {
    ...(stored as EmployeeProfile),
    id: row.id,
    slug: row.slug || undefined,
    name: stored.name || '',
    nameEn: stored.nameEn || '',
    title: stored.title || '',
    titleEn: stored.titleEn || '',
    mobile: stored.mobile || '',
    whatsapp: stored.whatsapp || '',
    email: stored.email || '',
    company: pick('company', ctx.org.company),
    companyEn: pick('companyEn', ctx.org.companyEn),
    slogan: pick('slogan', ctx.org.slogan),
    logoUrl: pick('logoUrl', ctx.org.logoUrl || undefined),
    website: pick('website', ctx.org.website),
    websiteUrl: pick('websiteUrl', ctx.org.websiteUrl),
    instagram: pick('instagram', ctx.org.instagram),
    instagramUrl: pick('instagramUrl', ctx.org.instagramUrl),
    catalogUrl: pick('catalogUrl', ctx.org.catalogUrl),
    catalogPdfUrl: pick('catalogPdfUrl', ctx.org.catalogPdfUrl),
    layoutDirection: pick('layoutDirection', ctx.org.layoutDirection),
    address: pick('address', branch?.address || ''),
    postalCode: pick('postalCode', branch?.postalCode),
    landline: pick('landline', branch?.landline || ''),
    mapLocation: pick('mapLocation', branch?.mapLocation || mapLocationFrom(undefined, DEFAULT_COORDINATES.title)),
    status: row.status,
    branchId: branch?.id,
    redirectTo: row.redirect_to || undefined,
    archivedAt: row.archived_at || undefined,
    previousSlugs: ctx.aliases.get(row.id) || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  profile.overrides = overrides;
  return profile;
}

/**
 * Keeps only what is personal to the card: any inherited field whose value
 * equals the organisation / branch value is dropped so later company-wide
 * changes reach this card too.
 */
function toStorage(input: EmployeeProfile, org: Organization, branch: Branch | undefined): Record<string, unknown> {
  const data: Record<string, unknown> = { ...input };
  for (const f of META_FIELDS) delete data[f];
  // Instagram is shown from its link, so a different label with the company link is not an override.
  if (!isBlank(data.instagramUrl) && sameValue('instagramUrl', data.instagramUrl, org.instagramUrl)) {
    delete data.instagram;
    delete data.instagramUrl;
  }
  // A card with its own website text but the company link gets a link that matches its text.
  if (!isBlank(data.website) && !sameValue('website', data.website, org.website)) {
    if (isBlank(data.websiteUrl) || sameValue('websiteUrl', data.websiteUrl, org.websiteUrl)) {
      data.websiteUrl = websiteToUrl(String(data.website).trim());
    }
  }
  for (const f of ORG_FIELDS) {
    if (isBlank(data[f]) || sameValue(f, data[f], (org as any)[f])) delete data[f];
  }
  for (const f of BRANCH_FIELDS) {
    if (f === 'mapLocation') {
      const loc = data.mapLocation as MapLocation | undefined;
      if (!loc || !branch || sameLocation(loc, branch.mapLocation)) delete data.mapLocation;
      else data.mapLocation = mapLocationFrom(loc, loc.title || branch.name);
      continue;
    }
    if (isBlank(data[f]) || (branch && sameValue(f, data[f], (branch as any)[f]))) delete data[f];
  }
  // Remove derived URL fields that only follow their visible value.
  if (!('website' in data)) delete data.websiteUrl;
  if (!('instagram' in data)) delete data.instagramUrl;
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }
  return data;
}

function allRows(includeArchived = true): ProfileRow[] {
  const sql = includeArchived
    ? 'SELECT * FROM profiles ORDER BY sort, created_at DESC'
    : "SELECT * FROM profiles WHERE status != 'archived' ORDER BY sort, created_at DESC";
  return conn().prepare(sql).all() as unknown as ProfileRow[];
}

function rowById(id: string): ProfileRow | undefined {
  return conn().prepare('SELECT * FROM profiles WHERE id = ? COLLATE NOCASE').get(id) as unknown as ProfileRow | undefined;
}

/**
 * Lookup order: exact id, then current short link, then an old short link,
 * then the dashed English name (oldest URL format).
 */
function findRow(identifier: string): { row: ProfileRow; via: 'id' | 'slug' | 'alias' | 'name' } | undefined {
  const clean = String(identifier || '').trim().toLowerCase();
  if (!clean) return undefined;
  const byId = rowById(clean);
  if (byId) return { row: byId, via: 'id' };
  const bySlug = conn().prepare('SELECT * FROM profiles WHERE slug = ? COLLATE NOCASE').get(clean) as unknown as ProfileRow | undefined;
  if (bySlug) return { row: bySlug, via: 'slug' };
  const alias = conn().prepare('SELECT profile_id FROM profile_aliases WHERE alias = ? COLLATE NOCASE').get(clean) as
    | { profile_id: string }
    | undefined;
  if (alias) {
    const row = rowById(alias.profile_id);
    if (row) return { row, via: 'alias' };
  }
  const byName = allRows(false).find((r) => {
    const nameEn = String(JSON.parse(r.data).nameEn || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    return nameEn && nameEn === clean;
  });
  return byName ? { row: byName, via: 'name' } : undefined;
}

/** Follows an archived card to its replacement (at most 3 hops, no loops). */
function followRedirect(row: ProfileRow): ProfileRow | null {
  let current: ProfileRow | undefined = row;
  const seen = new Set<string>();
  for (let hops = 0; hops < 4 && current; hops++) {
    if (current.status === 'active') return current;
    if (current.status !== 'archived' || !current.redirect_to || seen.has(current.id)) return null;
    seen.add(current.id);
    current = rowById(current.redirect_to);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Analytics aggregation
// ---------------------------------------------------------------------------

function emptyAnalytics(): EmployeeAnalytics {
  return {
    views: 0,
    nfcTaps: 0,
    qrScans: 0,
    callClicks: 0,
    whatsappClicks: 0,
    catalogDownloads: 0,
    vcardDownloads: 0,
    mapClicks: 0,
    instagramClicks: 0,
    websiteClicks: 0,
    emailClicks: 0,
    leadCaptures: 0,
  };
}

function analyticsByProfile(): Map<string, EmployeeAnalytics> {
  const result = new Map<string, EmployeeAnalytics>();
  const get = (id: string) => {
    let a = result.get(id);
    if (!a) {
      a = emptyAnalytics();
      result.set(id, a);
    }
    return a;
  };
  for (const row of conn().prepare('SELECT profile_id, data FROM legacy_counters').all() as { profile_id: string; data: string }[]) {
    const legacy = JSON.parse(row.data) as Partial<EmployeeAnalytics>;
    const a = get(row.profile_id);
    for (const [k, v] of Object.entries(legacy)) {
      if (typeof v === 'number') (a as any)[k] = ((a as any)[k] || 0) + v;
      else if (k === 'lastInteractionAt' && typeof v === 'string') a.lastInteractionAt = v;
    }
  }
  const rows = conn()
    .prepare('SELECT profile_id, type, source, COUNT(*) AS n, MAX(created_at) AS last FROM events GROUP BY profile_id, type, source')
    .all() as { profile_id: string; type: string; source: string | null; n: number; last: string }[];
  for (const r of rows) {
    const a = get(r.profile_id);
    const field = EVENT_TO_FIELD[r.type];
    if (field) (a as any)[field] = ((a as any)[field] || 0) + r.n;
    if (r.type === 'view' && r.source === 'nfc') a.nfcTaps += r.n;
    if (r.type === 'view' && r.source === 'qr') a.qrScans += r.n;
    if (!a.lastInteractionAt || r.last > a.lastInteractionAt) a.lastInteractionAt = r.last;
  }
  for (const r of conn().prepare('SELECT profile_id, COUNT(*) AS n, MAX(created_at) AS last FROM leads GROUP BY profile_id').all() as {
    profile_id: string;
    n: number;
    last: string;
  }[]) {
    if (!r.profile_id) continue;
    const a = get(r.profile_id);
    a.leadCaptures = (a.leadCaptures || 0) + r.n;
    if (!a.lastInteractionAt || r.last > a.lastInteractionAt) a.lastInteractionAt = r.last;
  }
  return result;
}

/** Fields that are safe to show to anyone who opens a card. */
export function toPublicProfile(profile: EmployeeProfile): EmployeeProfile {
  const {
    analytics: _a,
    overrides: _o,
    previousSlugs: _p,
    redirectTo: _r,
    archivedAt: _ar,
    createdAt: _c,
    updatedAt: _u,
    ...rest
  } = profile;
  return rest as EmployeeProfile;
}

// ---------------------------------------------------------------------------
// Validation for saves
// ---------------------------------------------------------------------------

function identifierTaken(value: string, exceptProfileId: string | null): boolean {
  const clean = value.toLowerCase();
  const row = conn()
    .prepare(
      `SELECT id FROM profiles WHERE (lower(id) = ? OR slug = ? COLLATE NOCASE) AND id != ?
       UNION SELECT profile_id FROM profile_aliases WHERE alias = ? COLLATE NOCASE AND profile_id != ?`
    )
    .get(clean, clean, exceptProfileId || '', clean, exceptProfileId || '');
  return Boolean(row);
}

function validateIdentity(id: string, slugInput: string | undefined, existingId: string | null): { id: string; slug: string | null } {
  if (!id || !isValidIdentifier(id)) {
    throw new ValidationError('شناسه کارمند فقط می‌تواند شامل حروف انگلیسی، عدد، خط تیره و زیرخط باشد.');
  }
  if (RESERVED_SLUGS.has(id.toLowerCase())) {
    throw new ValidationError(`شناسه «${id}» رزرو شده است و نمی‌توان از آن استفاده کرد.`);
  }
  if (identifierTaken(id, existingId)) {
    throw new ValidationError(`شناسه «${id}» قبلاً برای کارمند دیگری استفاده شده است.`, 409);
  }
  const slug = normalizeSlug(slugInput);
  if (slug) {
    if (RESERVED_SLUGS.has(slug)) {
      throw new ValidationError(`آدرس «${slug}» رزرو شده است. لطفاً آدرس دیگری انتخاب کنید.`);
    }
    if (identifierTaken(slug, existingId)) {
      throw new ValidationError(`آدرس «${slug}» قبلاً برای کارمند دیگری ثبت شده است. لطفاً آدرس دیگری انتخاب کنید.`, 409);
    }
  }
  return { id, slug: slug || null };
}

function storeInlineImages(profile: EmployeeProfile, strict: boolean): EmployeeProfile {
  const key = profile.slug || profile.id || 'staff';
  const convert = (value: string | undefined, prefix: 'avatar' | 'logo') => {
    if (!value || !value.startsWith('data:image/')) return value;
    try {
      return persistBase64Image(value, prefix, key);
    } catch (err) {
      if (strict) throw err;
      console.warn(`Could not store inline ${prefix} for ${key}:`, (err as Error).message);
      return undefined;
    }
  };
  return { ...profile, avatarUrl: convert(profile.avatarUrl, 'avatar'), logoUrl: convert(profile.logoUrl, 'logo') };
}

// ---------------------------------------------------------------------------
// Import of the 2.x JSON format (first start and old backup files)
// ---------------------------------------------------------------------------

function mostCommon<T>(values: T[], key: (v: T) => string): T | undefined {
  const counts = new Map<string, { n: number; v: T }>();
  for (const v of values) {
    const k = key(v);
    if (!k) continue;
    const entry = counts.get(k) || { n: 0, v };
    entry.n++;
    counts.set(k, entry);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.v;
}

function deriveOrganization(profiles: EmployeeProfile[]): Organization {
  const org: Partial<Organization> = {};
  for (const field of ORG_FIELDS) {
    const value = mostCommon(
      profiles.map((p) => (p as any)[field]).filter((v) => !isBlank(v)),
      (v) => String(v)
    );
    if (value !== undefined) (org as any)[field] = value;
  }
  // 2.x showed "Royco" while linking to royaco: use the handle from the link.
  if (org.instagramUrl) {
    const handle = org.instagramUrl.match(/instagram\.com\/([^/?#]+)/i)?.[1];
    if (handle) org.instagram = handle;
  }
  return normalizeOrganization({ ...org, websiteUrl: org.websiteUrl, instagramUrl: org.instagramUrl });
}

function locationKey(p: Partial<EmployeeProfile>): string {
  const lat = Number(p.mapLocation?.lat);
  const lng = Number(p.mapLocation?.lng);
  if (lat && lng) return `${lat.toFixed(5)},${lng.toFixed(5)}`;
  return String(p.address || '').trim();
}

function deriveBranches(profiles: EmployeeProfile[]): { branches: Branch[]; byProfile: Map<string, string> } {
  const groups = new Map<string, EmployeeProfile[]>();
  for (const p of profiles) {
    const key = locationKey(p) || 'default';
    groups.set(key, [...(groups.get(key) || []), p]);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const branches: Branch[] = [];
  const byProfile = new Map<string, string>();
  sorted.forEach(([, members], index) => {
    const sample = members[0];
    const id = index === 0 ? 'main' : `branch-${index + 1}`;
    const name =
      index === 0 ? 'دفتر مرکزی' : String(sample.mapLocation?.title || '').trim() || `شعبه ${index + 1}`;
    const landline = mostCommon(
      members.map((m) => m.landline).filter((v) => !isBlank(v)),
      (v) => String(v)
    );
    const postal = mostCommon(
      members.map((m) => m.postalCode).filter((v) => !isBlank(v)),
      (v) => String(v)
    );
    branches.push(
      normalizeBranch(
        {
          name,
          address: sample.address || (index === 0 ? DEFAULT_COORDINATES.address : ''),
          postalCode: postal,
          landline,
          mapLocation: sample.mapLocation,
        },
        id
      )
    );
    for (const m of members) byProfile.set(m.id, id);
  });
  if (!branches.length) {
    branches.push(
      normalizeBranch({ name: 'دفتر مرکزی', address: DEFAULT_COORDINATES.address, landline: '021 2599 1425' }, 'main')
    );
  }
  return { branches, byProfile };
}

function importLegacyLeads(leads: any[]) {
  const insert = conn().prepare(
    `INSERT OR REPLACE INTO leads (id, profile_id, profile_name, customer_name, customer_mobile, customer_company, topic, note, consent_at, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const l of leads || []) {
    if (!l || !l.id || !l.customerName) continue;
    insert.run(
      String(l.id),
      l.profileId || '',
      l.profileName || '',
      String(l.customerName).slice(0, 200),
      String(l.customerMobile || '').slice(0, 30),
      l.customerCompany || null,
      l.topic || null,
      l.note || null,
      l.consentAt || null,
      l.source || null,
      l.createdAt || now()
    );
  }
}

/** Replaces cards, branches, organisation and leads with data in the 2.x JSON layout. */
function importLegacyData(legacy: any, opts: { credentials: boolean }) {
  const profiles = (legacy.profiles as EmployeeProfile[]).filter(
    (p) => p && typeof p.id === 'string' && isValidIdentifier(p.id) && typeof p.name === 'string'
  );
  const org = deriveOrganization(profiles);
  const { branches, byProfile } = deriveBranches(profiles);
  const db = conn();
  db.exec('DELETE FROM profile_aliases; DELETE FROM profiles; DELETE FROM branches; DELETE FROM legacy_counters;');
  writeOrganization(org);
  branches.forEach((b, i) => writeBranch(b, { isDefault: i === 0 }));
  const branchMap = new Map(branches.map((b) => [b.id, b]));
  const usedSlugs = new Set<string>();
  const insert = db.prepare(
    `INSERT INTO profiles (id, slug, status, branch_id, redirect_to, data, sort, created_at, updated_at, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  profiles.forEach((raw, index) => {
    const p = storeInlineImages(raw, false);
    let slug = normalizeSlug(p.slug) || null;
    if (slug && (usedSlugs.has(slug) || RESERVED_SLUGS.has(slug))) slug = null;
    if (slug) usedSlugs.add(slug);
    const branchId = (p as any).branchId && branchMap.has((p as any).branchId) ? (p as any).branchId : byProfile.get(p.id) || 'main';
    const status: ProfileStatus = ['active', 'inactive', 'archived'].includes(p.status as string)
      ? (p.status as ProfileStatus)
      : 'active';
    insert.run(
      p.id,
      slug,
      status,
      branchId,
      p.redirectTo || null,
      JSON.stringify(toStorage(p, org, branchMap.get(branchId))),
      index,
      p.createdAt || legacy.updatedAt || now(),
      now(),
      p.archivedAt || null
    );
    if (p.analytics && Object.values(p.analytics).some((v) => typeof v === 'number' && v > 0)) {
      const { leadCaptures: _ignored, ...counters } = p.analytics; // leads are counted from the leads table
      db.prepare('INSERT OR REPLACE INTO legacy_counters (profile_id, data) VALUES (?, ?)').run(p.id, JSON.stringify(counters));
    }
    for (const alias of p.previousSlugs || []) {
      const a = normalizeSlug(alias);
      if (a && a !== slug && !usedSlugs.has(a)) {
        db.prepare('INSERT OR IGNORE INTO profile_aliases (alias, profile_id, created_at) VALUES (?, ?, ?)').run(a, p.id, now());
      }
    }
  });
  if (Array.isArray(legacy.leads)) {
    db.exec('DELETE FROM leads');
    importLegacyLeads(legacy.leads);
  }
  if (opts.credentials) {
    if (legacy.adminSalt && legacy.adminPasswordHash) {
      setMeta('admin_hash', legacyPbkdf2Hash(legacy.adminSalt, legacy.adminPasswordHash));
      setMeta('password_customized', legacy.isPasswordCustomized ? 'true' : 'false');
    }
    if (legacy.sessionSecret) setMeta('session_secret', legacy.sessionSecret);
  }
}

/** Organization / branches / cards in the 3.x backup layout. */
function importCurrentData(backup: any) {
  const db = conn();
  const org = normalizeOrganization(backup.organization || {});
  const branches: Branch[] = (backup.branches || []).map((b: Branch) => normalizeBranch(b, String(b.id)));
  if (!branches.length) branches.push(normalizeBranch({ name: 'دفتر مرکزی', address: DEFAULT_COORDINATES.address }, 'main'));
  db.exec('DELETE FROM profile_aliases; DELETE FROM profiles; DELETE FROM branches; DELETE FROM legacy_counters;');
  writeOrganization(org);
  const defaultId = (backup.branches || []).find((b: Branch) => b.isDefault)?.id || branches[0].id;
  branches.forEach((b) => writeBranch(b, { isDefault: b.id === defaultId }));
  const branchMap = new Map(branches.map((b) => [b.id, b]));
  const insert = db.prepare(
    `INSERT INTO profiles (id, slug, status, branch_id, redirect_to, data, sort, created_at, updated_at, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  (backup.profiles as EmployeeProfile[]).forEach((raw, index) => {
    const p = storeInlineImages(raw, false);
    const branchId = p.branchId && branchMap.has(p.branchId) ? p.branchId : defaultId;
    const status: ProfileStatus = ['active', 'inactive', 'archived'].includes(p.status as string)
      ? (p.status as ProfileStatus)
      : 'active';
    insert.run(
      p.id,
      normalizeSlug(p.slug) || null,
      status,
      branchId,
      p.redirectTo || null,
      JSON.stringify(toStorage(p, org, branchMap.get(branchId))),
      index,
      p.createdAt || now(),
      now(),
      p.archivedAt || null
    );
    for (const alias of p.previousSlugs || []) {
      db.prepare('INSERT OR IGNORE INTO profile_aliases (alias, profile_id, created_at) VALUES (?, ?, ?)').run(
        normalizeSlug(alias),
        p.id,
        now()
      );
    }
  });
  if (backup.legacyCounters && typeof backup.legacyCounters === 'object') {
    for (const [pid, counters] of Object.entries(backup.legacyCounters)) {
      db.prepare('INSERT OR REPLACE INTO legacy_counters (profile_id, data) VALUES (?, ?)').run(pid, JSON.stringify(counters));
    }
  }
  if (Array.isArray(backup.leads)) {
    db.exec('DELETE FROM leads');
    importLegacyLeads(backup.leads);
  }
}

function validateBackupShape(backup: any): string | null {
  if (!backup || typeof backup !== 'object') return 'فایل پشتیبان نامعتبر است.';
  if (!Array.isArray(backup.profiles) || backup.profiles.length === 0) return 'فایل پشتیبان هیچ کارتی ندارد.';
  const bad = backup.profiles.find(
    (p: any) => !p || typeof p.id !== 'string' || !isValidIdentifier(p.id) || typeof p.name !== 'string'
  );
  if (bad) return `کارت «${bad?.id ?? '?'}» در فایل پشتیبان معتبر نیست.`;
  const ids = new Set<string>();
  for (const p of backup.profiles) {
    const id = p.id.toLowerCase();
    if (ids.has(id)) return `شناسه «${p.id}» در فایل پشتیبان تکراری است.`;
    ids.add(id);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function getSigningSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv + (getMeta('session_epoch') || '');
  return getMeta('session_secret') as string;
}

function createSignedToken(): string {
  const issuedAt = Date.now().toString(36);
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${issuedAt}.${nonce}`;
  const signature = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
  return `roya_token_${payload}.${signature}`;
}

function tokenIssuedAt(token: string): number {
  return parseInt(token.slice('roya_token_'.length).split('.')[0] || '', 36);
}

function verifySignedToken(token: string): boolean {
  if (!token || !token.startsWith('roya_token_')) return false;
  const parts = token.slice('roya_token_'.length).split('.');
  if (parts.length !== 3) return false;
  const [issuedAtB36, nonce, signature] = parts;
  const issuedAt = parseInt(issuedAtB36, 36);
  if (isNaN(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS || issuedAt > Date.now() + 60_000) return false;
  const expected = crypto.createHmac('sha256', getSigningSecret()).update(`${issuedAtB36}.${nonce}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  const revoked = conn().prepare('SELECT 1 FROM revoked_tokens WHERE token = ?').get(token);
  return !revoked;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PublicCardResult =
  | { kind: 'ok'; profile: EmployeeProfile; canonicalSlug?: string; replacedFrom?: { id: string; name: string } }
  | { kind: 'unavailable'; state: 'inactive' | 'archived'; name: string; organization: Organization; branch?: Branch }
  | { kind: 'not-found' };

export interface BackupPreview {
  valid: boolean;
  error?: string;
  format?: 'legacy' | 'current';
  incoming: { profiles: number; leads: number; branches: number };
  current: { profiles: number; leads: number; branches: number };
  added: string[];
  removed: string[];
}

export const db = {
  // ----- organisation & branches -----
  getOrganization(): Organization {
    conn();
    return readOrganization();
  },

  /**
   * Updates company-wide settings. With `clearOverrides`, cards that had their
   * own value for one of the changed fields go back to the company value.
   */
  updateOrganization(input: Partial<Organization>, opts: { clearOverrides?: boolean } = {}): Organization {
    return transaction(conn(), () => {
      const current = readOrganization();
      const clean: Partial<Organization> = {};
      for (const f of ORG_FIELDS) {
        if (f in input) (clean as any)[f] = (input as any)[f];
      }
      const next = normalizeOrganization(clean, current);
      writeOrganization(next);
      if (opts.clearOverrides) {
        const changed = Object.keys(clean);
        if (clean.website !== undefined) changed.push('websiteUrl');
        if (clean.instagram !== undefined) changed.push('instagramUrl');
        for (const row of allRows()) {
          const data = JSON.parse(row.data);
          let touched = false;
          for (const f of changed) {
            if (f in data) {
              delete data[f];
              touched = true;
            }
          }
          if (touched) conn().prepare('UPDATE profiles SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(data), now(), row.id);
        }
      }
      return next;
    });
  },

  getBranches(): Branch[] {
    conn();
    return readBranches();
  },

  saveBranch(input: Partial<Branch>, mode: 'create' | 'update'): Branch {
    return transaction(conn(), () => {
      let id = String(input.id || '').trim().toLowerCase();
      if (mode === 'create') {
        id = id || `branch-${crypto.randomBytes(3).toString('hex')}`;
        if (!isValidIdentifier(id)) throw new ValidationError('شناسه شعبه معتبر نیست.');
        if (readBranches().some((b) => b.id === id)) throw new ValidationError('شعبه‌ای با این شناسه وجود دارد.', 409);
      } else if (!readBranches().some((b) => b.id === id)) {
        throw new ValidationError('شعبه یافت نشد.', 404);
      }
      const branch = normalizeBranch(input, id);
      const existing = conn().prepare('SELECT created_at FROM branches WHERE id = ?').get(id) as { created_at: string } | undefined;
      writeBranch(branch, { createdAt: existing?.created_at, isDefault: mode === 'create' && readBranches().length === 0 });
      if (input.isDefault) {
        conn().prepare('UPDATE branches SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END').run(id);
      }
      return readBranches().find((b) => b.id === id)!;
    });
  },

  /** Deletes a branch; its cards move to the default branch. The last branch cannot be deleted. */
  deleteBranch(id: string): boolean {
    return transaction(conn(), () => {
      const branches = readBranches();
      const target = branches.find((b) => b.id === id);
      if (!target) return false;
      if (branches.length === 1) throw new ValidationError('حداقل یک شعبه باید باقی بماند.');
      const fallback = branches.find((b) => b.id !== id && b.isDefault) || branches.find((b) => b.id !== id)!;
      conn().prepare('UPDATE profiles SET branch_id = ? WHERE branch_id = ?').run(fallback.id, id);
      conn().prepare('DELETE FROM branches WHERE id = ?').run(id);
      if (target.isDefault) conn().prepare('UPDATE branches SET is_default = 1 WHERE id = ?').run(fallback.id);
      return true;
    });
  },

  // ----- profiles -----
  /** Every card for the admin panel (archived included), with analytics. */
  getAllProfiles(opts: { includeArchived?: boolean } = {}): EmployeeProfile[] {
    const ctx = loadContext();
    const analytics = analyticsByProfile();
    return allRows(opts.includeArchived !== false).map((row) => ({
      ...resolveRow(row, ctx),
      analytics: analytics.get(row.id) || emptyAnalytics(),
    }));
  },

  getProfileById(id: string): EmployeeProfile | undefined {
    const row = rowById(id);
    return row ? resolveRow(row, loadContext()) : undefined;
  },

  /** Internal lookup (any status). Use resolvePublicCard() for visitors. */
  getProfileBySlugOrId(identifier: string): EmployeeProfile | undefined {
    const found = findRow(identifier);
    return found ? resolveRow(found.row, loadContext()) : undefined;
  },

  /** What a visitor should see for a link, following archived cards to their replacement. */
  resolvePublicCard(identifier: string): PublicCardResult {
    const found = findRow(identifier);
    if (!found) return { kind: 'not-found' };
    const ctx = loadContext();
    const { row, via } = found;
    if (row.status === 'active') {
      const profile = resolveRow(row, ctx);
      const canonical = row.slug || row.id;
      return { kind: 'ok', profile, canonicalSlug: via === 'alias' || via === 'name' ? canonical : undefined };
    }
    const target = row.status === 'archived' ? followRedirect(row) : null;
    const original = JSON.parse(row.data);
    if (target) {
      const profile = resolveRow(target, ctx);
      return {
        kind: 'ok',
        profile,
        canonicalSlug: target.slug || target.id,
        replacedFrom: { id: row.id, name: original.name || '' },
      };
    }
    const branch = (row.branch_id && ctx.branches.get(row.branch_id)) || ctx.fallbackBranch;
    return { kind: 'unavailable', state: row.status as 'inactive' | 'archived', name: original.name || '', organization: ctx.org, branch };
  },

  /**
   * Create or update a card. Validates id / short link (including old links of
   * other cards), stores inline images on disk and keeps the old short link
   * working when it changes. Throws ValidationError for invalid input.
   */
  saveProfile(input: EmployeeProfile, mode: 'create' | 'update' | 'upsert' = 'upsert'): EmployeeProfile {
    return transaction(conn(), () => {
      const id = String(input?.id || '').trim();
      const existing = id ? rowById(id) : undefined;
      if (mode === 'create' && existing) throw new ValidationError('کارمندی با این شناسه قبلاً ثبت شده است.', 409);
      if (mode === 'update' && !existing) throw new ValidationError('پروفایل کارمند یافت نشد.', 404);
      if (!String(input?.name || '').trim()) throw new ValidationError('نام کارمند الزامی است.');

      const identity = validateIdentity(existing ? existing.id : id, input.slug, existing?.id ?? null);
      const ctx = loadContext();
      const branchId =
        input.branchId && ctx.branches.has(input.branchId) ? input.branchId : existing?.branch_id || ctx.fallbackBranch?.id || null;
      const branch = branchId ? ctx.branches.get(branchId) : undefined;

      let status: ProfileStatus = existing?.status || 'active';
      if (input.status && ['active', 'inactive', 'archived'].includes(input.status)) status = input.status;
      let redirectTo: string | null = input.redirectTo !== undefined ? input.redirectTo || null : existing?.redirect_to || null;
      if (redirectTo) {
        const target = rowById(redirectTo);
        if (!target || target.id === identity.id) throw new ValidationError('کارت جایگزین معتبر نیست.');
        redirectTo = target.id;
      }

      const clean = storeInlineImages({ ...input, name: String(input.name).trim() }, true);
      const data = JSON.stringify(toStorage(clean, ctx.org, branch));
      const stamp = now();
      const archivedAt = status === 'archived' ? existing?.archived_at || stamp : null;

      if (existing) {
        if (existing.slug && existing.slug.toLowerCase() !== (identity.slug || '').toLowerCase()) {
          // Keep the old short link (printed NFC tags / QR codes) pointing at this card.
          conn()
            .prepare('INSERT OR IGNORE INTO profile_aliases (alias, profile_id, created_at) VALUES (?, ?, ?)')
            .run(existing.slug.toLowerCase(), existing.id, stamp);
        }
        if (identity.slug) conn().prepare('DELETE FROM profile_aliases WHERE alias = ? COLLATE NOCASE').run(identity.slug);
        conn()
          .prepare(
            'UPDATE profiles SET slug = ?, status = ?, branch_id = ?, redirect_to = ?, data = ?, updated_at = ?, archived_at = ? WHERE id = ?'
          )
          .run(identity.slug, status, branchId, redirectTo, data, stamp, archivedAt, existing.id);
      } else {
        const minSort = (conn().prepare('SELECT MIN(sort) AS m FROM profiles').get() as { m: number | null }).m ?? 0;
        conn()
          .prepare(
            `INSERT INTO profiles (id, slug, status, branch_id, redirect_to, data, sort, created_at, updated_at, archived_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(identity.id, identity.slug, status, branchId, redirectTo, data, minSort - 1, stamp, stamp, archivedAt);
      }
      return { ...this.getProfileById(identity.id)!, analytics: analyticsByProfile().get(identity.id) || emptyAnalytics() };
    });
  },

  /** Archives a card instead of deleting it. Its links then open `redirectTo` or the company page. */
  archiveProfile(id: string, redirectTo?: string | null): EmployeeProfile | undefined {
    const row = rowById(id);
    if (!row) return undefined;
    return this.saveProfile({ ...this.getProfileById(row.id)!, status: 'archived', redirectTo: redirectTo || '' }, 'update');
  },

  restoreProfile(id: string): EmployeeProfile | undefined {
    const row = rowById(id);
    if (!row) return undefined;
    return transaction(conn(), () => {
      conn().prepare("UPDATE profiles SET status = 'active', redirect_to = NULL, archived_at = NULL, updated_at = ? WHERE id = ?").run(now(), row.id);
      return this.getProfileById(row.id);
    });
  },

  /** Permanent delete, only for archived cards. Statistics and leads stay. */
  deleteProfile(id: string): boolean {
    const row = rowById(id);
    if (!row) return false;
    if (row.status !== 'archived') {
      throw new ValidationError('فقط کارت‌های بایگانی‌شده را می‌توان برای همیشه حذف کرد.', 409);
    }
    return transaction(conn(), () => {
      conn().prepare('UPDATE profiles SET redirect_to = NULL WHERE redirect_to = ?').run(row.id);
      conn().prepare('DELETE FROM profiles WHERE id = ?').run(row.id);
      return true;
    });
  },

  updateBrandForAll(brandUpdates: BulkBrandUpdatePayload): EmployeeProfile[] {
    this.updateOrganization(brandUpdates as Partial<Organization>, { clearOverrides: true });
    return this.getAllProfiles();
  },

  // ----- analytics -----
  recordAnalyticsEvent(
    identifier: string,
    event: AnalyticsEvent,
    context: EventContext = {}
  ): { success: boolean; profileId?: string; ignored?: boolean } {
    const found = findRow(identifier);
    if (!found) return { success: false };
    const target = followRedirect(found.row);
    if (!target) return { success: true, profileId: found.row.id, ignored: true };
    if (isBot(context.userAgent)) return { success: true, profileId: target.id, ignored: true };

    let type: string = event;
    let source = normalizeSource(context.source);
    if (event === 'nfcTap') {
      type = 'view';
      source = 'nfc';
    } else if (event === 'qrScan') {
      type = 'view';
      source = 'qr';
    }
    const day = new Date().toISOString().slice(0, 10);
    const visitor =
      context.ip || context.userAgent
        ? crypto
            .createHash('sha256')
            .update(`${getMeta('session_secret')}|${day}|${context.ip || ''}|${context.userAgent || ''}`)
            .digest('hex')
            .slice(0, 16)
        : null;
    conn()
      .prepare('INSERT INTO events (profile_id, type, source, campaign, device, visitor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(target.id, type, source, cleanCampaign(context.campaign), deviceFromUserAgent(context.userAgent), visitor, now());
    return { success: true, profileId: target.id };
  },

  /** Daily counts between two dates (inclusive, YYYY-MM-DD, UTC). */
  getTimeSeries(opts: { from: string; to: string; profileId?: string }) {
    const params: (string | number)[] = [opts.from, `${opts.to}T23:59:59.999Z`];
    let filter = '';
    if (opts.profileId) {
      filter = ' AND profile_id = ?';
      params.push(opts.profileId);
    }
    const events = conn()
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day,
                SUM(CASE WHEN type = 'view' THEN 1 ELSE 0 END) AS views,
                COUNT(DISTINCT CASE WHEN type = 'view' THEN visitor END) AS visitors,
                SUM(CASE WHEN type IN (${INTERACTION_TYPES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS interactions
         FROM events WHERE created_at >= ? AND created_at <= ?${filter}
         GROUP BY day ORDER BY day`
      )
      .all(...INTERACTION_TYPES, ...params) as { day: string; views: number; visitors: number; interactions: number }[];
    const leads = conn()
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS leads FROM leads WHERE created_at >= ? AND created_at <= ?${
          opts.profileId ? ' AND profile_id = ?' : ''
        } GROUP BY day`
      )
      .all(...params) as { day: string; leads: number }[];
    const bySource = conn()
      .prepare(
        `SELECT source, device, COUNT(*) AS n FROM events WHERE type = 'view' AND created_at >= ? AND created_at <= ?${filter} GROUP BY source, device`
      )
      .all(...params) as { source: string; device: string; n: number }[];
    const leadMap = new Map(leads.map((l) => [l.day, l.leads]));
    const days = new Map(events.map((e) => [e.day, { ...e, leads: leadMap.get(e.day) || 0 }]));
    for (const [day, n] of leadMap) if (!days.has(day)) days.set(day, { day, views: 0, visitors: 0, interactions: 0, leads: n });
    // Every day in the range gets a row, so charts show quiet days as zero instead of skipping them.
    const start = Date.parse(`${opts.from}T00:00:00Z`);
    const end = Date.parse(`${opts.to}T00:00:00Z`);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 400 * 86400000) {
      for (let t = start; t <= end; t += 86400000) {
        const day = new Date(t).toISOString().slice(0, 10);
        if (!days.has(day)) days.set(day, { day, views: 0, visitors: 0, interactions: 0, leads: 0 });
      }
    }
    return {
      days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
      bySource,
    };
  },

  // ----- leads -----
  getAllLeads(): CustomerLead[] {
    const rows = conn().prepare('SELECT * FROM leads ORDER BY created_at DESC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      profileId: r.profile_id || '',
      profileName: r.profile_name || '',
      customerName: r.customer_name,
      customerMobile: r.customer_mobile,
      customerCompany: r.customer_company || undefined,
      topic: r.topic || undefined,
      note: r.note || undefined,
      consentAt: r.consent_at || undefined,
      source: r.source || undefined,
      createdAt: r.created_at,
    }));
  },

  /** Expects input already validated by validateLeadInput(). */
  addLead(payload: LeadInput & { source?: string }): { lead: CustomerLead } {
    // Only attribute the lead when the card really exists; never guess.
    const found = payload.profileId ? findRow(payload.profileId) : undefined;
    const target = found ? followRedirect(found.row) || found.row : undefined;
    const name = target ? JSON.parse(target.data).name : 'نامشخص (کارت یافت نشد)';
    const lead: CustomerLead = {
      id: `lead_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      profileId: target ? target.id : '',
      profileName: name,
      customerName: payload.customerName,
      customerMobile: payload.customerMobile,
      customerCompany: payload.customerCompany,
      topic: payload.topic && (LEAD_TOPICS as readonly string[]).includes(payload.topic) ? payload.topic : undefined,
      note: payload.note,
      consentAt: payload.consent ? now() : undefined,
      source: payload.source ? normalizeSource(payload.source) : undefined,
      createdAt: now(),
    };
    conn()
      .prepare(
        `INSERT INTO leads (id, profile_id, profile_name, customer_name, customer_mobile, customer_company, topic, note, consent_at, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        lead.id,
        lead.profileId,
        lead.profileName,
        lead.customerName,
        lead.customerMobile,
        lead.customerCompany ?? null,
        lead.topic ?? null,
        lead.note ?? null,
        lead.consentAt ?? null,
        lead.source ?? null,
        lead.createdAt
      );
    return { lead };
  },

  deleteLead(id: string): boolean {
    return Number(conn().prepare('DELETE FROM leads WHERE id = ?').run(id).changes) > 0;
  },

  // ----- admin password & sessions -----
  verifyPassword(password: string): boolean {
    if (typeof password !== 'string' || !password) return false;
    if (KNOWN_DEFAULT_PASSWORDS.has(password)) return false;
    conn();
    const envPassword = envAdminPassword();
    if (envPassword && safeEqualString(password, envPassword)) return true;
    const stored = getMeta('admin_hash') || '';
    const ok = verifyPasswordHash(password, stored);
    if (ok && needsRehash(stored)) setMeta('admin_hash', hashPassword(password)); // upgrade 2.x PBKDF2 hashes
    return ok;
  },

  /** Sets a new admin password, logs out every session and returns a fresh token. */
  setPassword(newPassword: string): string {
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`رمز عبور جدید باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد.`);
    }
    if (KNOWN_DEFAULT_PASSWORDS.has(newPassword)) {
      throw new ValidationError('این رمز عبور قبلاً عمومی بوده و قابل استفاده نیست.');
    }
    conn();
    transaction(conn(), () => {
      setMeta('admin_hash', hashPassword(newPassword));
      setMeta('password_customized', 'true');
      setMeta('session_secret', newSecret());
      setMeta('session_epoch', newSecret().slice(0, 16));
      conn().exec('DELETE FROM revoked_tokens');
    });
    return createSignedToken();
  },

  changePassword(oldPassword: string, newPassword: string): { success: boolean; message: string; token?: string } {
    if (!this.verifyPassword(oldPassword)) return { success: false, message: 'رمز عبور فعلی نامعتبر است.' };
    try {
      const token = this.setPassword(newPassword);
      return { success: true, message: 'رمز عبور مدیریت با موفقیت تغییر یافت.', token };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  },

  createSession(): string {
    conn();
    return createSignedToken();
  },

  validateToken(token: string): boolean {
    conn();
    return verifySignedToken(token);
  },

  destroySession(token: string): void {
    if (!token || !this.validateToken(token)) return;
    const expires = tokenIssuedAt(token) + SESSION_TTL_MS;
    conn().prepare('DELETE FROM revoked_tokens WHERE expires_at < ?').run(Date.now());
    conn().prepare('INSERT OR IGNORE INTO revoked_tokens (token, expires_at) VALUES (?, ?)').run(token, expires);
  },

  // ----- audit log -----
  audit(action: string, entity: string, entityId?: string | null, summary?: string, ip?: string) {
    try {
      conn()
        .prepare('INSERT INTO audit_log (at, action, entity, entity_id, summary, ip) VALUES (?, ?, ?, ?, ?, ?)')
        .run(now(), action, entity, entityId || null, summary ? summary.slice(0, 500) : null, ip || null);
    } catch (err) {
      console.error('[Roya DB] audit log failed', err);
    }
  },

  getAuditLog(limit = 100, offset = 0): { entries: AuditEntry[]; total: number } {
    const rows = conn()
      .prepare('SELECT id, at, action, entity, entity_id, summary FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?')
      .all(Math.min(Math.max(limit, 1), 500), Math.max(offset, 0)) as any[];
    const total = (conn().prepare('SELECT COUNT(*) AS n FROM audit_log').get() as { n: number }).n;
    return {
      entries: rows.map((r) => ({
        id: r.id,
        at: r.at,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id || undefined,
        summary: r.summary || undefined,
      })),
      total,
    };
  },

  // ----- backup & restore -----
  /** JSON backup without credentials (password hash, session key). */
  exportBackup() {
    const ctx = loadContext();
    const legacyCounters: Record<string, unknown> = {};
    for (const row of conn().prepare('SELECT profile_id, data FROM legacy_counters').all() as { profile_id: string; data: string }[]) {
      legacyCounters[row.profile_id] = JSON.parse(row.data);
    }
    return {
      version: 5,
      format: 'roya-card-backup',
      exportedAt: now(),
      organization: ctx.org,
      branches: readBranches(),
      profiles: allRows().map((row) => {
        const stored = JSON.parse(row.data);
        return {
          ...stored,
          id: row.id,
          slug: row.slug || undefined,
          status: row.status,
          branchId: row.branch_id || undefined,
          redirectTo: row.redirect_to || undefined,
          archivedAt: row.archived_at || undefined,
          previousSlugs: ctx.aliases.get(row.id) || [],
          createdAt: row.created_at,
        };
      }),
      leads: this.getAllLeads(),
      legacyCounters,
    };
  },

  previewRestore(backup: any): BackupPreview {
    const current = {
      profiles: (conn().prepare('SELECT COUNT(*) AS n FROM profiles').get() as { n: number }).n,
      leads: (conn().prepare('SELECT COUNT(*) AS n FROM leads').get() as { n: number }).n,
      branches: readBranches().length,
    };
    const error = validateBackupShape(backup);
    const incomingIds: string[] = Array.isArray(backup?.profiles) ? backup.profiles.map((p: any) => String(p?.id)) : [];
    const currentIds = allRows().map((r) => r.id);
    return {
      valid: !error,
      error: error || undefined,
      format: backup?.organization ? 'current' : 'legacy',
      incoming: {
        profiles: incomingIds.length,
        leads: Array.isArray(backup?.leads) ? backup.leads.length : 0,
        branches: Array.isArray(backup?.branches) ? backup.branches.length : 0,
      },
      current,
      added: incomingIds.filter((id) => !currentIds.includes(id)),
      removed: currentIds.filter((id) => !incomingIds.includes(id)),
    };
  },

  /**
   * Restores cards, branches, organisation and leads. A copy of the current
   * database is written to the backups folder first. Credentials are never
   * restored. Returns the path of that safety copy.
   */
  importBackup(backup: any): { ok: boolean; error?: string; safetyCopy?: string } {
    const error = validateBackupShape(backup);
    if (error) return { ok: false, error };
    const safetyCopy = this.snapshot('pre-restore');
    transaction(conn(), () => {
      if (backup.organization) importCurrentData(backup);
      else importLegacyData(backup, { credentials: false });
    });
    return { ok: true, safetyCopy };
  },

  /** Writes a consistent copy of the database to the backups folder. */
  snapshot(reason = 'manual'): string {
    const file = path.join(getBackupsDir(), `roya-${reason}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    backupTo(conn(), file);
    return file;
  },

  /** Keeps the newest `keep` automatic snapshots of each kind. */
  pruneSnapshots(keep = 14) {
    const dir = getBackupsDir();
    if (!fs.existsSync(dir)) return;
    const groups = new Map<string, string[]>();
    for (const name of fs.readdirSync(dir)) {
      const m = name.match(/^roya-([a-z-]+?)-\d{4}-/);
      if (!m) continue;
      groups.set(m[1], [...(groups.get(m[1]) || []), name]);
    }
    for (const names of groups.values()) {
      names.sort().reverse();
      for (const old of names.slice(keep)) {
        try {
          fs.unlinkSync(path.join(dir, old));
        } catch {}
      }
    }
  },

  listSnapshots(): { name: string; size: number; createdAt: string }[] {
    const dir = getBackupsDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.db') || n.endsWith('.tar.gz'))
      .map((name) => {
        const stat = fs.statSync(path.join(dir, name));
        return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  // ----- uploads -----
  /** Every /uploads URL that a card, branch or the organisation still uses. */
  referencedUploads(): Set<string> {
    const refs = new Set<string>();
    const add = (v: unknown) => {
      if (typeof v === 'string' && v.startsWith('/uploads/')) refs.add(v.split('?')[0]);
    };
    const org = readOrganization();
    Object.values(org).forEach(add);
    for (const row of allRows()) Object.values(JSON.parse(row.data)).forEach(add);
    return refs;
  },

  cleanupUploads(minAgeMs?: number): string[] {
    return cleanupOrphanUploads(this.referencedUploads(), minAgeMs);
  },

  // ----- health -----
  stats() {
    const c = conn();
    const count = (sql: string) => (c.prepare(sql).get() as { n: number }).n;
    return {
      schemaVersion: schemaVersion(c),
      profiles: count("SELECT COUNT(*) AS n FROM profiles WHERE status != 'archived'"),
      archivedProfiles: count("SELECT COUNT(*) AS n FROM profiles WHERE status = 'archived'"),
      branches: count('SELECT COUNT(*) AS n FROM branches'),
      leads: count('SELECT COUNT(*) AS n FROM leads'),
      events: count('SELECT COUNT(*) AS n FROM events'),
      passwordCustomized: getMeta('password_customized') === 'true' || Boolean(envAdminPassword()),
      databaseFile: connectionPath,
    };
  },

  /** Kept for compatibility: SQLite writes immediately. Checkpoints the WAL. */
  flush(): void {
    if (connection) {
      try {
        connection.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      } catch {}
    }
  },

  close(): void {
    if (connection) {
      try {
        connection.close();
      } catch {}
    }
    connection = null;
    connectionPath = '';
  },

  /** Test helper: close the connection so the next call reopens DATA_DIR. */
  _resetCacheForTests(): void {
    this.close();
  },
};
