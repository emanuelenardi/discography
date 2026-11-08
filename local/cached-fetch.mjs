// Polite, cached HTTP for the local data scripts: one request at a time, a minimum pause per
// service, backoff on 429/503 (honouring Retry-After), and every raw response kept under cache/ so
// a rerun never refetches. Used by local/*.mjs and the patched scripts/fetch-tracks.mjs.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const USER_AGENT = 'discography-prototype/0.1 ( https://github.com/dmtrbrl/discography )';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const cacheDir = path.join(root, 'cache');

// MusicBrainz: about 1 request a second per IP. iTunes Search API: about 20 calls a minute. The
// Cover Art Archive has no published limit; one request a second keeps it gentle all the same.
const PAUSE = { musicbrainz: 1100, itunes: 3200, coverart: 1000 };
const last = { musicbrainz: 0, itunes: 0, coverart: 0 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let queue = Promise.resolve();

const serviceOf = (url) => {
  const host = new URL(url).hostname;
  if (host.endsWith('musicbrainz.org')) return 'musicbrainz';
  if (host.endsWith('apple.com')) return 'itunes';
  return 'coverart';
};

const cachePath = (url, extension) => {
  const service = serviceOf(url);
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 20);
  return path.join(cacheDir, service, `${hash}${extension}`);
};

const exists = async (file) => Boolean((await stat(file).catch(() => null))?.size);

async function request(url) {
  const service = serviceOf(url);
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(Math.max(0, last[service] + PAUSE[service] - Date.now()));
    last[service] = Date.now();
    let response;
    try {
      response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
    } catch (error) {
      if (attempt === 5) throw error;
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (response.ok) return response;
    if (response.status === 404) return null;
    if (response.status !== 429 && response.status !== 503 && response.status < 500) throw new Error(`${response.status} for ${url}`);
    const retryAfter = Number(response.headers.get('retry-after')) * 1000;
    const wait = Math.max(retryAfter || 0, 5000 * 2 ** attempt);
    console.warn(`  ${response.status} from ${service}; waiting ${wait / 1000} s`);
    await sleep(wait);
  }
  throw new Error(`Gave up on ${url}`);
}

// A URL that exhausted its retries is remembered for six hours, so a rerun doesn't hammer it again.
const FAILURE_TTL = 6 * 3600 * 1000;
const guarded = (file, url, task) => async () => {
  const marker = `${file}.failed`;
  const failed = await stat(marker).catch(() => null);
  if (failed && Date.now() - failed.mtimeMs < FAILURE_TTL) throw new Error(`Failed recently, not retried: ${url}`);
  try {
    return await task();
  } catch (error) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(marker, String(error.message));
    throw error;
  }
};

// Serialises every call, so only one request is ever in flight.
const serial = (task) => {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
};

// JSON, from the cache when present. A 404 is cached as null.
export function getJson(url) {
  const file = cachePath(url, '.json');
  return serial(async () => {
    if (await exists(file)) return JSON.parse(await readFile(file, 'utf8')).body;
    return guarded(file, url, async () => {
      const response = await request(url);
      const body = response ? await response.json() : null;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({ url, fetched: new Date().toISOString(), body }));
      return body;
    })();
  });
}

// A binary file (an image), from the cache when present; returns its cached path, or null on 404.
export function getFile(url) {
  const file = cachePath(url, '.bin');
  return serial(async () => {
    if (await exists(file)) return file;
    if (await exists(`${file}.404`)) return null;
    return guarded(file, url, async () => {
      const response = await request(url);
      await mkdir(path.dirname(file), { recursive: true });
      if (!response) {
        await writeFile(`${file}.404`, url);
        return null;
      }
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      await writeFile(`${file}.url`, url);
      return file;
    })();
  });
}
