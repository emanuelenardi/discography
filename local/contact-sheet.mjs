// Contact sheet of a release's Cover Art Archive images (250 px thumbnails, cached), labelled with
// position, image ID and types, to pick booklet pages by eye. Writes cache/sheets/<release>.jpg.
// Usage: node local/contact-sheet.mjs <release id> [types filter, e.g. Booklet]
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { getFile, getJson, cacheDir } from './cached-fetch.mjs';

const [release, filter] = process.argv.slice(2);
const listing = await getJson(`https://coverartarchive.org/release/${release}`);
const images = listing.images.filter((image) => !filter || image.types.some((type) => filter.split(',').includes(type)));
const cell = { width: 360, height: 300 };
const columns = 4;
const rows = Math.ceil(images.length / columns);
const tiles = [];
for (const [index, image] of images.entries()) {
  const file = await getFile(image.thumbnails['250'] ?? image.thumbnails.small).catch(() => null);
  if (!file) {
    console.warn(`  no thumbnail for ${image.id}`);
    continue;
  }
  const thumb = await sharp(file).resize({ width: cell.width - 10, height: cell.height - 40, fit: 'inside' }).toBuffer({ resolveWithObject: true });
  const label = `${index + 1}. ${image.id} ${image.types.join('+')} ${image.comment ?? ''}`.replace(/[<&>]/g, '');
  const text = Buffer.from(`<svg width="${cell.width}" height="30"><text x="4" y="20" font-size="13" font-family="sans-serif">${label.slice(0, 52)}</text></svg>`);
  const x = (index % columns) * cell.width, y = Math.floor(index / columns) * cell.height;
  tiles.push({ input: thumb.data, left: x + 5, top: y + 34 }, { input: text, left: x, top: y });
}
await mkdir(`${cacheDir}/sheets`, { recursive: true });
const out = `${cacheDir}/sheets/${release}.jpg`;
await sharp({ create: { width: columns * cell.width, height: rows * cell.height, channels: 3, background: '#ffffff' } }).composite(tiles).jpeg({ quality: 80 }).toFile(out);
console.log(out);
