import fs from 'fs';
import os from 'os';
import path from 'path';

/** Points the app at a fresh, empty data + uploads folder. Call before importing the server modules. */
export function setupTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roya-test-'));
  process.env.DATA_DIR = path.join(dir, 'data');
  process.env.UPLOADS_DIR = path.join(dir, 'uploads');
  process.env.ADMIN_PASSWORD = 'test-admin-password';
  delete process.env.SESSION_SECRET;
  delete process.env.PUBLIC_ORIGIN;
  return dir;
}

export const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
