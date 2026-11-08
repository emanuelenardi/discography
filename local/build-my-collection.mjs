// Builds public/my-albums/: collection.json and each album's JPEGs, reproducing what
// scripts/download-covers.sh does (that script needs macOS's sips to crop and shrink, and caches
// nothing), from local/my-albums.json and the hand-checked picks in local/my-picks.json. Every
// request goes through local/cached-fetch.mjs. Afterwards run, with COLLECTION=my-albums,
// scripts/fetch-tracks.mjs and scripts/optimize-images.mjs (see NOTES.md).
// Usage: node local/build-my-collection.mjs
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getFile, getJson } from './cached-fetch.mjs';

const root = 'C:/Users/emanuelenardi/Documents/Coding/personal/discography-prototype';
const outDir = `${root}/public/my-albums`;
const albums = JSON.parse(await readFile(`${root}/local/my-albums.json`, 'utf8'));
const picks = JSON.parse(await readFile(`${root}/local/my-picks.json`, 'utf8'));
// The release group is the search's top hit (local/resolve-albums.mjs) unless a pick names one.
const report = JSON.parse(await readFile(`${root}/cache/resolve-report.json`, 'utf8'));
for (const [id, pick] of Object.entries(picks)) {
  if (!pick.skip && !pick.releaseGroup) pick.releaseGroup = report.find((entry) => entry.id === id)?.groups[0]?.id;
}
const https = (url) => url?.replace(/^http:/, 'https:');

// As find_scans in download-covers.sh: the earliest official single-CD release with both a disc
// scan and a back insert, else each from the earliest release that has it; a pinned release wins.
async function findScans(group, pinned, backImage) {
  let releases = pinned ? [pinned] : [];
  if (!pinned) {
    const list = await getJson(`https://musicbrainz.org/ws/2/release?release-group=${group}&inc=media&limit=100&fmt=json`);
    releases = (list?.releases ?? [])
      .filter((release) => release.status === 'Official' && release.media.length === 1 && release.media[0].format === 'CD' && release['cover-art-archive']?.count > 0)
      .sort((a, b) => ((a.date || '9999').localeCompare(b.date || '9999')) || a.id.localeCompare(b.id))
      .map((release) => release.id);
  }
  let disc = null, back = null;
  for (const release of releases) {
    const listing = await getJson(`https://coverartarchive.org/release/${release}`).catch((error) => console.warn(`  ${error.message}`));
    if (!listing) continue;
    const media = listing.images.filter((image) => image.types.includes('Medium'))
      .sort((a, b) => a.types.includes('Matrix/Runout') - b.types.includes('Matrix/Runout'));
    const foundDisc = media[0] && { release, id: String(media[0].id), url: https(media[0].thumbnails['1200'] ?? media[0].image) };
    const backPick = listing.images.find((image) => (backImage ? String(image.id) === backImage : image.types.includes('Back')));
    const foundBack = backPick && { release, id: String(backPick.id), url: https(backPick.thumbnails['1200'] ?? backPick.image) };
    if (foundDisc && foundBack) return { disc: foundDisc, back: foundBack };
    disc ??= foundDisc;
    back ??= foundBack;
  }
  return { disc, back };
}

// One panel of a scan: left/right of a spread, or n/m of a foldout (as take_part in the script).
async function savePart(source, target, part) {
  if (!part) return copyFile(source, target);
  const column = part === 'left' ? '1/2' : part === 'right' ? '2/2' : part;
  const [n, m] = column.split('/').map(Number);
  const { width, height } = await sharp(source).metadata();
  const size = Math.floor(width / m);
  await sharp(source).extract({ left: (n - 1) * size, top: 0, width: size, height }).jpeg({ quality: 92 }).toFile(target);
}

// A download that keeps failing (the archive answers 500 for some files) counts as missing.
const fileOrNull = (url) => getFile(url).catch((error) => {
  console.warn(`  ${error.message}`);
  return null;
});

// A CAA image by release and image ID at 1200 px, falling back to the original.
async function caaImage(release, image) {
  return await fileOrNull(`https://coverartarchive.org/release/${release}/${image}-1200.jpg`)
    ?? await fileOrNull(`https://coverartarchive.org/release/${release}/${image}.jpg`);
}

const collection = { name: 'My albums', albums: [] };
await rm(outDir, { recursive: true, force: true });
for (const album of albums) {
  const pick = picks[album.id];
  if (!pick || pick.skip) {
    console.log(`${album.id}: skipped (${pick?.skip ?? 'no pick'})`);
    continue;
  }
  console.log(album.id);
  const folder = `${outDir}/${album.id}`;
  await mkdir(folder, { recursive: true });
  const group = await getJson(`https://musicbrainz.org/ws/2/release-group/${pick.releaseGroup}?fmt=json`);
  const entry = {
    id: album.id,
    artist: album.artist,
    title: pick.title ?? album.title,
    year: (group?.['first-release-date'] || album.releaseDate).slice(0, 4),
    kind: pick.kind ?? 'Studio album',
    spotify: album.spotify,
    musicbrainz: { releaseGroup: pick.releaseGroup, ...(pick.release ? { release: pick.release } : {}) },
    sources: {},
  };
  if (pick.appleTitle) entry.appleTitle = pick.appleTitle;

  // Cover: the release group's front (or a pinned release's), 1200 px, else 500 px.
  const coverBase = pick.coverRelease ? `release/${pick.coverRelease}` : `release-group/${pick.releaseGroup}`;
  const cover = await fileOrNull(`https://coverartarchive.org/${coverBase}/front-1200`) ?? await fileOrNull(`https://coverartarchive.org/${coverBase}/front-500`);
  if (cover) {
    await copyFile(cover, `${folder}/cover.jpg`);
    entry.cover = 'cover.jpg';
    entry.sources.cover = `https://coverartarchive.org/${coverBase}/front`;
    const { dominant } = await sharp(cover).stats();
    entry.color = `#${[dominant.r, dominant.g, dominant.b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  const { disc, back } = await findScans(pick.releaseGroup, pick.release, pick.backImage);
  const discFile = disc && !pick.noDisc && await fileOrNull(disc.url);
  if (discFile) {
    await copyFile(discFile, `${folder}/disc.jpg`);
    entry.disc = 'disc.jpg';
    entry.sources.disc = `https://coverartarchive.org/release/${disc.release}/${disc.id}.jpg`;
  }
  const backFile = back && !pick.noBack && await fileOrNull(back.url);
  if (backFile) {
    await savePart(backFile, `${folder}/back.jpg`, pick.backHalf);
    entry.back = 'back.jpg';
    entry.sources.back = `https://coverartarchive.org/release/${back.release}/${back.id}.jpg`;
    if (pick.backHalf) entry.musicbrainz.backHalf = pick.backHalf;
  }
  if (pick.backImage) entry.musicbrainz.backImage = pick.backImage;

  // Booklet, only where picked by hand: the back page and the interior spreads, in order.
  if (pick.bookletBack) {
    const [ids, part] = pick.bookletBack.split('@');
    const [release, image] = ids.split('/');
    await savePart(await caaImage(release, image), `${folder}/booklet-back.jpg`, part);
    entry.bookletBack = 'booklet-back.jpg';
    entry.musicbrainz.bookletBack = pick.bookletBack;
    entry.sources.bookletBack = `https://coverartarchive.org/release/${release}/${image}.jpg`;
  }
  // Every interior scan first: a booklet with a page missing is left out whole.
  const scanFiles = [];
  for (const scan of pick.bookletScans ?? []) {
    const [release, image] = scan.split('@')[0].split('/');
    scanFiles.push(await caaImage(release, image));
  }
  if (scanFiles.includes(null)) console.warn('  a booklet scan could not be downloaded; booklet left out');
  else if (scanFiles.length) {
    await mkdir(`${folder}/booklet`, { recursive: true });
    entry.bookletScans = [];
    let pages = 2;
    for (const [index, scan] of pick.bookletScans.entries()) {
      const part = scan.split('@')[1];
      const name = `booklet/${String(index + 2).padStart(2, '0')}.jpg`;
      await savePart(scanFiles[index], `${folder}/${name}`, part);
      const { width, height } = await sharp(`${folder}/${name}`).metadata();
      pages += width / height > 3.4 ? 4 : width / height > 1.45 ? 2 : 1;
      entry.bookletScans.push(name);
    }
    entry.bookletPageCount = pages;
    entry.bookletFit = 'contain';
    entry.sources.booklet = `https://musicbrainz.org/release/${pick.bookletScans[0].split('/')[0]}/cover-art`;
  }
  collection.albums.push(entry);
}
await writeFile(`${outDir}/collection.json`, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Wrote ${collection.albums.length} albums to public/my-albums/collection.json`);
