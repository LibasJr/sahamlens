import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sourceImgPath = 'C:\\Users\\TyaTyoKya\\.gemini\\antigravity-ide\\brain\\9e252d0d-5e0a-4c6e-a1f4-a29d400bd113\\.user_uploaded\\media_1786954664518.jpg';

async function updateLogos() {
  console.log('Generating updated 3D embossed logo assets for Web & Mobile...');

  // Extend 1024x770 to square 1024x1024 with background { r: 25, g: 37, b: 53, alpha: 1 }
  const squareBuffer = await sharp(sourceImgPath)
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 25, g: 37, b: 53, alpha: 1 }
    })
    .toBuffer();

  // 1. public/sahamlens-scope.png & public/sahamlens-logo.png (512x512)
  await sharp(squareBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 25, g: 37, b: 53, alpha: 1 } })
    .png({ quality: 95 })
    .toFile('public/sahamlens-scope.png');
  await sharp(squareBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 25, g: 37, b: 53, alpha: 1 } })
    .png({ quality: 95 })
    .toFile('public/sahamlens-logo.png');
  console.log('✓ public/sahamlens-logo.png generated');

  // 2. public/icon-512x512.png & public/icon-pwa-512.png
  await sharp(iconBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 10, g: 15, b: 29, alpha: 1 } })
    .png({ quality: 95 })
    .toFile('public/icon-512x512.png');
  await sharp(iconBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 10, g: 15, b: 29, alpha: 1 } })
    .png({ quality: 95 })
    .toFile('public/icon-pwa-512.png');
  console.log('✓ public/icon-pwa-512.png generated');

  // 3. public/icon-192x192.png & public/icon-pwa-192.png
  await sharp(iconBuffer)
    .resize(192, 192, { fit: 'contain', background: { r: 10, g: 15, b: 29, alpha: 1 } })
    .png({ quality: 95 })
    .toFile('public/icon-192x192.png');
  await sharp(iconBuffer)
    .resize(192, 192, { fit: 'contain', background: { r: 10, g: 15, b: 29, alpha: 1 } })
    .png({ quality: 95 })
    .toFile('public/icon-pwa-192.png');
  console.log('✓ public/icon-pwa-192.png generated');

  // 4. app/apple-icon.png (180x180 for iOS)
  await sharp(iconBuffer)
    .resize(180, 180, { fit: 'contain', background: { r: 10, g: 15, b: 29, alpha: 1 } })
    .png({ quality: 95 })
    .toFile('app/apple-icon.png');
  console.log('✓ app/apple-icon.png generated');

  // 5. app/icon.png (Next.js app router default icon)
  await sharp(iconBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 10, g: 15, b: 29, alpha: 1 } })
    .png({ quality: 95 })
    .toFile('app/icon.png');
  console.log('✓ app/icon.png generated');

  // 6. app/favicon.ico (we create a 48x48 PNG or write to favicon.ico)
  const faviconBuffer = await sharp(iconBuffer)
    .resize(48, 48, { fit: 'contain', background: { r: 10, g: 15, b: 29, alpha: 1 } })
    .png()
    .toBuffer();
  fs.writeFileSync('app/favicon.ico', faviconBuffer);
  console.log('✓ app/favicon.ico generated');

  // 7. public/sahamlens-logo-full.png (Full horizontal logo)
  await sharp(sourceImgPath)
    .png({ quality: 95 })
    .toFile('public/sahamlens-logo-full.png');
  console.log('✓ public/sahamlens-logo-full.png generated');

  // 8. public/og-image.png (1200x630 OpenGraph social share)
  await sharp(sourceImgPath)
    .resize(1200, 630, { fit: 'cover', position: 'center' })
    .png({ quality: 92 })
    .toFile('public/og-image.png');
  console.log('✓ public/og-image.png generated');

  console.log('All logo and icon assets successfully generated!');
}

updateLogos().catch(console.error);
