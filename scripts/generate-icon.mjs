import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('assets/images');

// Brand color matches the app tint (Colors.light.tint = #2f95dc).
const BRAND_DARK = '#1E6FA8';
const BRAND_LIGHT = '#2F95DC';

// Core content (receipt + cart), sized inside a 1024 viewBox.
// `scale` lets us shrink the content for adaptive-icon's safe zone.
const contentGroup = (scale = 1) => {
  const tx = (1024 * (1 - scale)) / 2;
  return `
  <g transform="translate(${tx} ${tx}) scale(${scale})">
    <!-- receipt accent -->
    <g opacity="0.18" transform="translate(300 210)">
      <rect x="0" y="0" width="420" height="560" rx="28" fill="#ffffff"/>
      <rect x="60" y="100" width="300" height="28" rx="14" fill="${BRAND_DARK}"/>
      <rect x="60" y="170" width="220" height="20" rx="10" fill="${BRAND_DARK}"/>
      <rect x="60" y="220" width="260" height="20" rx="10" fill="${BRAND_DARK}"/>
      <rect x="60" y="270" width="180" height="20" rx="10" fill="${BRAND_DARK}"/>
      <rect x="60" y="340" width="300" height="28" rx="14" fill="${BRAND_DARK}"/>
    </g>

    <!-- shopping cart glyph -->
    <g fill="#ffffff" transform="translate(232 332)">
      <path d="M 0 40 L 70 40 Q 100 40 108 70 L 170 330 Q 178 370 218 370 L 500 370"
            stroke="#ffffff" stroke-width="46" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M 140 120 L 560 120 L 520 300 Q 514 330 484 330 L 210 330 Q 180 330 174 300 Z"
            stroke="#ffffff" stroke-width="46" stroke-linejoin="round" fill="none"/>
      <circle cx="240" cy="430" r="34"/>
      <circle cx="460" cy="430" r="34"/>
    </g>
  </g>`;
};

// iOS / store icon — full-bleed gradient background with content.
const iconSvg = () => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND_LIGHT}"/>
      <stop offset="1" stop-color="${BRAND_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${contentGroup(1)}
</svg>`;

// Android adaptive icon foreground — MUST be transparent background and content
// must sit inside the center ~66% "safe zone" (outer ~18% can get cropped by masks).
const adaptiveSvg = () => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${contentGroup(0.62)}
</svg>`;

// Splash: transparent background, centered content (background comes from splash config).
const splashSvg = () => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${contentGroup(0.7)}
</svg>`;

async function render(svg, out, size) {
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(out);
  console.log('✓', out);
}

await render(iconSvg(), path.join(outDir, 'icon.png'), 1024);
await render(adaptiveSvg(), path.join(outDir, 'adaptive-icon.png'), 1024);
await render(splashSvg(), path.join(outDir, 'splash-icon.png'), 1024);
await render(iconSvg(), path.join(outDir, 'favicon.png'), 48);

console.log('\nAll icons generated.');
