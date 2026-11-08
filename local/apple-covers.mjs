// For albums of public/my-albums/collection.json with no front cover on the Cover Art Archive, or
// only one smaller than the 1024 px the page draws, takes
// the official artwork of the Apple Music album fetch-tracks.mjs matched (the published demo's
// fronts come from Apple Music too), at 1200 px. Albums left without a cover are dropped, since
// the page needs one (AlbumConfig.cover). Run after scripts/fetch-tracks.mjs.
// Usage: node local/apple-covers.mjs
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getFile, getJson } from './cached-fetch.mjs';

const root = 'C:/Users/emanuelenardi/Documents/Coding/personal/discography-prototype';
const jsonPath = `${root}/public/my-albums/collection.json`;
const config = JSON.parse(await readFile(jsonPath, 'utf8'));

for (const album of config.albums) {
  if (!album.appleMusic) continue;
  if (album.cover && (await sharp(`${root}/public/my-albums/${album.id}/${album.cover}`).metadata()).width >= 1000) continue;
  const lookup = await getJson(`https://itunes.apple.com/lookup?id=${album.appleMusic}&country=${album.appleMusicCountry ?? 'us'}`);
  const artwork = lookup?.results?.[0]?.artworkUrl100;
  if (!artwork) continue;
  const file = await getFile(artwork.replace(/\/\d+x\d+bb\./, '/1200x1200bb.'));
  if (!file) continue;
  await copyFile(file, `${root}/public/my-albums/${album.id}/cover.jpg`);
  album.cover = 'cover.jpg';
  album.sources.cover = `https://music.apple.com/${album.appleMusicCountry ?? 'us'}/album/${album.appleMusic}`;
  const { dominant } = await sharp(file).stats();
  album.color = `#${[dominant.r, dominant.g, dominant.b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  console.log(`${album.id}: cover from Apple Music`);
}
const dropped = config.albums.filter((album) => !album.cover).map((album) => album.id);
if (dropped.length) console.log(`No cover anywhere, dropped: ${dropped.join(', ')}`);
config.albums = config.albums.filter((album) => album.cover);
await writeFile(jsonPath, `${JSON.stringify(config, null, 2)}\n`);
