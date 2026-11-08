// Finds each album of local/my-albums.json on MusicBrainz: its release group (search), the
// official single-CD releases in it, and what the Cover Art Archive holds for each of them. Writes
// cache/resolve-report.json for review; picks nothing by itself beyond the search's top hit.
// Usage: node local/resolve-albums.mjs [album id ...]
import { readFile, writeFile } from 'node:fs/promises';
import { getJson, cacheDir } from './cached-fetch.mjs';

const root = 'C:/Users/emanuelenardi/Documents/Coding/personal/discography-prototype';
const albums = JSON.parse(await readFile(`${root}/local/my-albums.json`, 'utf8'));
const only = process.argv.slice(2);
const quote = (text) => `"${text.replace(/["\\]/g, '\\$&')}"`;

const report = [];
for (const album of albums) {
  if (only.length && !only.includes(album.id)) continue;
  const query = album.searchQuery ?? `releasegroup:${quote(album.searchTitle ?? album.title)} AND artist:${quote(album.artist)} AND primarytype:album`;
  const search = await getJson(`https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query)}&limit=5&fmt=json`);
  const groups = (search?.['release-groups'] ?? []).map((group) => ({
    id: group.id,
    title: group.title,
    artist: group['artist-credit']?.map((credit) => credit.name + (credit.joinphrase ?? '')).join(''),
    firstReleaseDate: group['first-release-date'],
    score: group.score,
  }));
  const group = groups[0];
  const entry = { id: album.id, title: album.title, artist: album.artist, groups, releases: [] };
  report.push(entry);
  console.log(`${album.id}: ${group ? `${group.title} / ${group.artist} (${group.firstReleaseDate}, score ${group.score})` : 'NOT FOUND'}`);
  if (!group) continue;
  const list = await getJson(`https://musicbrainz.org/ws/2/release?release-group=${group.id}&inc=media&limit=100&fmt=json`);
  const releases = (list?.releases ?? [])
    .filter((release) => release.status === 'Official' && release.media.length === 1 && release.media[0].format === 'CD')
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.id.localeCompare(b.id));
  for (const release of releases) {
    const art = release['cover-art-archive'];
    const item = { id: release.id, date: release.date, country: release.country, tracks: release.media[0]['track-count'], caaCount: art?.count ?? 0, images: [] };
    entry.releases.push(item);
    if (!art?.count) continue;
    // A listing the archive keeps answering 503 for is recorded as unavailable, not fatal.
    const listing = await getJson(`https://coverartarchive.org/release/${release.id}`).catch((error) => {
      console.warn(`    ${error.message}`);
      item.unavailable = true;
      return null;
    });
    item.images = (listing?.images ?? []).map((image) => ({ id: String(image.id), types: image.types, comment: image.comment, front: image.front, back: image.back }));
  }
  const withArt = entry.releases.filter((release) => release.caaCount);
  console.log(`  ${releases.length} official single-CD releases, ${withArt.length} with scans`);
  for (const release of withArt) console.log(`    ${release.id} ${release.date ?? '?'} ${release.country ?? '?'} ${release.tracks}t: ${release.images.map((image) => image.types.join('+') || '?').join(', ')}`);
}
// Merged with an earlier report, so a run for a few albums keeps the others.
const previous = JSON.parse(await readFile(`${cacheDir}/resolve-report.json`, 'utf8').catch(() => '[]'));
const merged = albums.map((album) => report.find((entry) => entry.id === album.id) ?? previous.find((entry) => entry.id === album.id)).filter(Boolean);
await writeFile(`${cacheDir}/resolve-report.json`, JSON.stringify(merged, null, 2));
