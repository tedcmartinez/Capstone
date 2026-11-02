// Draws the app icons used by the installed app (PWA)
//
// The icon is the same mark the loading screen shows: an orange "C" on the
// Cornerblock brown. It is drawn here as SVG and turned into the PNG sizes
// browsers ask for, so the icons can be redrawn the same way at any time.
//
//   node tools/make-icons.mjs
//
// Writes into app-firebase/public/icons/. The PNGs are committed, so this
// only needs running again if the mark changes.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'app-firebase', 'public', 'icons');

const BROWN = '#412118';
const ORANGE = '#d2691e';

// The "C" drawn as a thick arc rather than as a letter in a font, so the
// icon looks the same on every computer that builds it, whatever fonts it
// has installed. `scale` shrinks the mark for the maskable icon, whose
// edges a phone may crop into a circle.
function iconSvg({ rounded, scale = 1 }) {
  const size = 512;
  const centre = size / 2;
  const radius = 128 * scale;
  const stroke = 64 * scale;

  // The opening of the C faces right, from 45 degrees above to 45 below
  const angle = Math.PI / 4;
  const x = centre + radius * Math.cos(angle);
  const yTop = centre - radius * Math.sin(angle);
  const yBottom = centre + radius * Math.sin(angle);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rounded ? 96 : 0}" fill="${BROWN}"/>
  <path d="M ${x} ${yTop} A ${radius} ${radius} 0 1 0 ${x} ${yBottom}"
        fill="none" stroke="${ORANGE}" stroke-width="${stroke}" stroke-linecap="round"/>
</svg>`;
}

async function png(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(OUT, file));
  console.log(`  ${file}`);
}

mkdirSync(OUT, { recursive: true });
console.log('Writing icons to app-firebase/public/icons/');

// "any" icons: rounded corners, as the desktop window and browser tab show them
await png(iconSvg({ rounded: true }), 192, 'icon-192.png');
await png(iconSvg({ rounded: true }), 512, 'icon-512.png');

// Maskable: square, with the mark kept inside the safe middle area
await png(iconSvg({ rounded: false, scale: 0.8 }), 512, 'maskable-512.png');

// iPhone and iPad home screen, which ignore the manifest's icons
await png(iconSvg({ rounded: false }), 180, 'apple-touch-icon.png');

// The browser tab
writeFileSync(join(OUT, 'favicon.svg'), iconSvg({ rounded: true }));
console.log('  favicon.svg');
