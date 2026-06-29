// FinTrack — PWA icon generator
// Run: node scripts/generate-icons.js
'use strict';

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

// SVG designed at 512×512, sharp resizes to each target size.
// Design: dark circle · subtle green border · bold "F" with integrated rising trend line.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Green glow applied to the main letter elements -->
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="blur"/>
      <feColorMatrix in="blur" type="matrix"
        values="0 0 0 0 0  0 0.9 0 0 0  0 0 0.63 0 0  0 0 0 1 0"
        result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <!-- Softer glow for the border ring -->
    <filter id="ring-glow" x="-6%" y="-6%" width="112%" height="112%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="blur"/>
      <feColorMatrix in="blur" type="matrix"
        values="0 0 0 0 0  0 0.9 0 0 0  0 0 0.63 0 0  0 0 0 0.7 0"
        result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background circle -->
  <circle cx="256" cy="256" r="250" fill="#0d0f14"/>

  <!-- Border: outer glow layer -->
  <circle cx="256" cy="256" r="243" fill="none" stroke="#00e5a0" stroke-width="10" opacity="0.12"/>
  <!-- Border: crisp ring with glow filter -->
  <circle cx="256" cy="256" r="243" fill="none" stroke="#00e5a0" stroke-width="3.5"
    filter="url(#ring-glow)"/>

  <!-- Rising trend line — drawn first so the F sits on top -->
  <!-- Polyline rises from lower-left to upper-right across the bottom of the icon -->
  <polyline
    points="192,368 228,338 264,354 306,304 348,316 396,258"
    fill="none" stroke="#00e5a0" stroke-width="11"
    stroke-linecap="round" stroke-linejoin="round"
    opacity="0.45"/>

  <!-- Trend line dots at key vertices -->
  <circle cx="228" cy="338" r="8" fill="#00e5a0" opacity="0.5"/>
  <circle cx="306" cy="304" r="8" fill="#00e5a0" opacity="0.5"/>
  <circle cx="396" cy="258" r="8" fill="#00e5a0" opacity="0.5"/>

  <!-- ─── Bold "F" letter ─── -->
  <!-- Vertical stroke -->
  <rect x="146" y="132" width="54" height="248" rx="9" fill="#00e5a0" filter="url(#glow)"/>
  <!-- Top horizontal bar -->
  <rect x="146" y="132" width="186" height="50" rx="9" fill="#00e5a0" filter="url(#glow)"/>
  <!-- Middle horizontal bar (shorter) -->
  <rect x="146" y="228" width="152" height="44" rx="9" fill="#00e5a0" filter="url(#glow)"/>
</svg>`;

const SIZES = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 180, name: 'icon-180.png' },
  { size:  32, name: 'icon-32.png'  },
];

async function generate() {
  const buf = Buffer.from(svg);
  for (const { size, name } of SIZES) {
    const out = path.join(ICONS_DIR, name);
    await sharp(buf)
      .resize(size, size)
      .png()
      .toFile(out);
    console.log(`✓  ${name.padEnd(16)} ${size}×${size}`);
  }
  console.log('\nDone — icons written to public/icons/');
}

generate().catch(err => { console.error('Error:', err.message); process.exit(1); });
