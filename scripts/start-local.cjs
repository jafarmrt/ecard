/**
 * Runs the built app on a personal computer for testing (Windows, macOS or Linux).
 *
 *   npm run local        (builds first, then starts)
 *
 * On first run it creates a .env file with a random admin password and prints it.
 * Data is kept in ./data and ./public/uploads.
 */
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const os = require('os');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');

if (!fs.existsSync(path.join(root, 'dist', 'server.cjs'))) {
  console.error('dist/server.cjs not found. Run "npm run build" first (or use "npm run local").');
  process.exit(1);
}

if (!fs.existsSync(envFile)) {
  const password = randomBytes(12).toString('base64url').slice(0, 14);
  fs.writeFileSync(
    envFile,
    [
      '# Local test settings (created by scripts/start-local.cjs)',
      'NODE_ENV=production',
      'PORT=3000',
      `ADMIN_PASSWORD=${password}`,
      `SESSION_SECRET=${randomBytes(32).toString('hex')}`,
      '',
    ].join('\n')
  );
  console.log('\nCreated .env with a new admin password:  ' + password);
  console.log('(It stays in the .env file next to package.json.)\n');
}

const env = { ...process.env, NODE_ENV: 'production' };
const port = (fs.readFileSync(envFile, 'utf8').match(/^PORT=(\d+)/m) || [])[1] || '3000';
const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);

console.log(`Open on this computer:  http://localhost:${port}   (admin panel: /admin)`);
for (const ip of lanIps) console.log(`Open from a phone on the same Wi-Fi:  http://${ip}:${port}`);
console.log('Stop with Ctrl+C.\n');

const child = spawn(process.execPath, ['dist/server.cjs'], { cwd: root, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
