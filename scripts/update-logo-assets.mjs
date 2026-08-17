import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sourceImgPath = 'C:\\Users\\TyaTyoKya\\.gemini\\antigravity-ide\\brain\\9e252d0d-5e0a-4c6e-a1f4-a29d400bd113\\.user_uploaded\\media_1786954664518.jpg';

async function updateLogos() {
  console.log('Generating updated 3D embossed logo assets with Android safe-zone centering...');

  // 1. Generate ambient blurred background matching the exact source atmosphere
  const bgBuffer = await sharp(sourceImgPath)
    .resize(1024, 1024, { fit: 'cover' })
    .blur(35)
    .modulate({ brightness: 0.88 })
    .toBuffer();

  // 2. Scale the sharp foreground logo to 680px wide (fits 100% inside squircle safe zone)
  const fgWidth = 680;
  const fgHeight = 511;

  const fgBuffer = await sharp(sourceImgPath)
    .resize(fgWidth, fgHeight, { fit: 'contain' })
    .png()
    .toBuffer();

  // 3. Composite into a seamless 1024x1024 master icon
  const final1024 = await sharp(bgBuffer)
    .composite([
      { input: fgBuffer, gravity: 'center' }
    ])
    .png({ quality: 100 })
    .toBuffer();

  // 1. public/sahamlens-scope.png & public/sahamlens-logo.png (512x512)
  await sharp(final1024)
    .resize(512, 512)
    .toFile('public/sahamlens-scope.png');
  await sharp(final1024)
    .resize(512, 512)
    .toFile('public/sahamlens-logo.png');
  console.log('✓ public/sahamlens-logo.png generated');

  // 2. public/icon-512x512.png & public/icon-pwa-512.png
  await sharp(final1024)
    .resize(512, 512)
    .toFile('public/icon-512x512.png');
  await sharp(final1024)
    .resize(512, 512)
    .toFile('public/icon-pwa-512.png');
  console.log('✓ public/icon-pwa-512.png generated');

  // 3. public/icon-192x192.png & public/icon-pwa-192.png
  await sharp(final1024)
    .resize(192, 192)
    .toFile('public/icon-192x192.png');
  await sharp(final1024)
    .resize(192, 192)
    .toFile('public/icon-pwa-192.png');
  console.log('✓ public/icon-pwa-192.png generated');

  // 4. app/apple-icon.png (180x180 for iOS)
  await sharp(final1024)
    .resize(180, 180)
    .toFile('app/apple-icon.png');
  console.log('✓ app/apple-icon.png generated');

  // 5. app/icon.png (Next.js app router default icon)
  await sharp(final1024)
    .resize(512, 512)
    .toFile('app/icon.png');
  console.log('✓ app/icon.png generated');

  // 6. app/favicon.ico & public/favicon.ico
  const faviconBuffer = await sharp(final1024)
    .resize(48, 48)
    .png()
    .toBuffer();
  fs.writeFileSync('app/favicon.ico', faviconBuffer);
  fs.writeFileSync('public/favicon.ico', faviconBuffer);
  console.log('✓ app/favicon.ico generated');

  // 7. public/sahamlens-logo-full.png
  await sharp(sourceImgPath)
    .png({ quality: 95 })
    .toFile('public/sahamlens-logo-full.png');
  console.log('✓ public/sahamlens-logo-full.png generated');

  // 8. public/og-image.png (1200x630 OpenGraph social share)
  await sharp(sourceImgPath)
    .resize(1200, 630, { fit: 'contain', background: { r: 25, g: 37, b: 53, alpha: 1 } })
    .png({ quality: 95 })
    .toFile('public/og-image.png');
  console.log('✓ public/og-image.png generated');

  console.log('All safe-zone logo and icon assets successfully generated!');
}

updateLogos().catch(console.error);
