const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const domains = [
  {
    name: 'tech',
    color: '#2ECC71', // Neon Green
    text: 'T',
  },
  {
    name: 'politics',
    color: '#E74C3C', // Red
    text: 'P',
  },
  {
    name: 'fit',
    color: '#FFFFFF', // White
    text: 'F',
  },
];

const sizes = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

async function generateFavicon(domain, size, name) {
  const outputDir = path.join('public', 'favicons', domain.name);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${domain.color}"/>
      <text
        x="50%"
        y="50%"
        dominant-baseline="middle"
        text-anchor="middle"
        font-family="Arial"
        font-size="${size * 0.6}"
        font-weight="bold"
        fill="${domain.name === 'fit' ? '#000000' : '#FFFFFF'}"
      >
        ${domain.text}
      </text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(outputDir, name));
}

async function generateSafariPinnedTab(domain) {
  const outputDir = path.join('public', 'favicons', domain.name);
  const svg = `
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" fill="${domain.color}"/>
      <text
        x="50%"
        y="50%"
        dominant-baseline="middle"
        text-anchor="middle"
        font-family="Arial"
        font-size="10"
        font-weight="bold"
        fill="${domain.name === 'fit' ? '#000000' : '#FFFFFF'}"
      >
        ${domain.text}
      </text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .svg()
    .toFile(path.join(outputDir, 'safari-pinned-tab.svg'));
}

async function generateWebManifest(domain) {
  const outputDir = path.join('public', 'favicons', domain.name);
  const manifest = {
    name: `${domain.name.charAt(0).toUpperCase() + domain.name.slice(1)} - Mihir Karbelkar`,
    short_name: domain.name.toUpperCase(),
    icons: [
      {
        src: '/favicons/' + domain.name + '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/favicons/' + domain.name + '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    theme_color: domain.color,
    background_color: domain.color,
    display: 'standalone',
  };

  fs.writeFileSync(
    path.join(outputDir, 'site.webmanifest'),
    JSON.stringify(manifest, null, 2)
  );
}

async function generateAllFavicons() {
  for (const domain of domains) {
    for (const { size, name } of sizes) {
      await generateFavicon(domain, size, name);
    }
    await generateSafariPinnedTab(domain);
    await generateWebManifest(domain);
  }
}

generateAllFavicons().catch(console.error); 