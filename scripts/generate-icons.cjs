const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generate() {
  const svgPath = path.resolve(__dirname, '..', 'public', 'icon.svg');
  const publicDir = path.resolve(__dirname, '..', 'public');
  const svgBuffer = fs.readFileSync(svgPath);

  console.log('Generating PWA icons from SVG...');

  // 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('✓ Created pwa-192x192.png');

  // 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('✓ Created pwa-512x512.png');

  // 512x512 maskable (with 10% safe zone padding)
  await sharp(svgBuffer)
    .resize(410, 410)
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: '#0f172a'
    })
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('✓ Created pwa-maskable-512x512.png');

  // apple-touch-icon 180x180
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ Created apple-touch-icon.png');

  // favicon 48x48
  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('✓ Created favicon.png');

  console.log('All PWA assets generated successfully!');
}

generate().catch(console.error);
