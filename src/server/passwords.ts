import crypto from 'crypto';

/**
 * Admin password hashing.
 *
 * New hashes use scrypt: `scrypt$N$r$p$saltHex$hashHex`.
 * Hashes from version 2.x (PBKDF2-SHA512, 10k rounds) are stored as
 * `pbkdf2$10000$saltHex$hashHex`; they still verify and are upgraded to
 * scrypt on the next successful login.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function legacyPbkdf2Hash(saltHex: string, hashHex: string): string {
  return `pbkdf2$10000$${saltHex}$${hashHex}`;
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  if (!stored || typeof password !== 'string') return false;
  const parts = stored.split('$');
  try {
    if (parts[0] === 'scrypt' && parts.length === 6) {
      const [, n, r, p, saltHex, hashHex] = parts;
      const expected = Buffer.from(hashHex, 'hex');
      const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: 64 * 1024 * 1024,
      });
      return safeEqual(actual, expected);
    }
    if (parts[0] === 'pbkdf2' && parts.length === 4) {
      const [, rounds, saltHex, hashHex] = parts;
      // The 2.x code used the hex salt string itself as the salt.
      const actual = crypto.pbkdf2Sync(password, saltHex, Number(rounds), 64, 'sha512');
      return safeEqual(actual, Buffer.from(hashHex, 'hex'));
    }
  } catch {
    return false;
  }
  return false;
}

export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$`);
}

/** Constant-time comparison of two strings of any length. */
export function safeEqualString(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
