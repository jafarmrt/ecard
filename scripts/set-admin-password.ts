/**
 * Set the admin password directly on the server (e.g. after upgrading, or if it was forgotten).
 *
 *   npm run admin:password -- "a-new-strong-password"
 *
 * Every logged-in admin session is signed out.
 */
import 'dotenv/config';
import { db } from '../src/server/db.ts';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run admin:password -- "<new password, at least 8 characters>"');
  process.exit(1);
}
try {
  db.setPassword(password);
  console.log('Admin password updated. All existing admin sessions were signed out.');
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
