# Local experiment notes

A local clone of https://github.com/dmtrbrl/discography, run first as published and then with my
own albums (the `type: album` items of `portfolio/content/spotify.yml`).

**Licence: PolyForm Noncommercial 1.0.0.** Local and noncommercial use only. The licence doesn't
cover the artwork, scans or previews either. Never publish, deploy or push this: `origin`'s push
URL is set to `no-push` on purpose, and `.github/workflows/deploy.yml` would publish to GitHub
Pages if this were ever pushed.

## Running it

```bash
npm install
npm run dev            # the published demo (public/albums/), http://127.0.0.1:5173/
npm run dev:mine       # my collection (public/my-albums/), same URL
npm run build          # typecheck + build of the demo into dist/
npm run build:mine     # the same for my collection
npm run preview        # serve the last build (after build or build:mine)
```

`dev:mine` and `build:mine` are `vite --mode mine`, which reads `.env.mine`
(`VITE_COLLECTION=my-albums`). The change to the app is minimal:

- `src/collection.ts`: `albumsUrl` reads the folder from `VITE_COLLECTION` (default `albums`).
- `vite.config.ts`: the `preloadArtwork` plugin reads `public/<folder>/collection.json`, writes the
  artwork preloads for that folder, and points `index.html`'s `collection.json` preload at it.
- `package.json`: the three `:mine` scripts.

## Rebuilding my collection's data

```bash
node local/resolve-albums.mjs        # search MusicBrainz, list each group's single-CD releases and their CAA images (cache/resolve-report.json)
node local/contact-sheet.mjs <release> # contact sheet of a release's scans, to pick booklets by eye (cache/sheets/)
bash local/build-my-collection.sh    # artwork, tracks, Apple covers, AVIF/WebP into public/my-albums/
```

`local/my-albums.json` is the input (title, artist, Spotify ID from `spotify.yml`); the hand
picks (pinned releases, booklet pages, the skipped album) are in `local/my-picks.json`.
`build-my-collection.sh` runs:

1. `local/build-my-collection.mjs`: reproduces `scripts/download-covers.sh` in Node. The shell
   script needs macOS's `sips` to crop booklet halves and shrink scans, and caches nothing; the
   Node version uses `sharp`, follows the same rules (CAA release-group front at 1200 px, else
   500; disc = first `Medium` image preferring one not tagged `Matrix/Runout`; back = first
   `Back`; both from the earliest official single-CD release that has both unless a release is
   pinned), and takes the booklet only from the hand picks.
2. `scripts/fetch-tracks.mjs` with `COLLECTION=my-albums APPLE_COUNTRY=it` (patched, below).
3. `local/apple-covers.mjs`: where the archive's front is missing or under 1000 px, the official
   Apple Music artwork of the matched album at 1200 px (the published demo's fronts are Apple's
   too).
4. `scripts/optimize-images.mjs` with `COLLECTION=my-albums` (patched to read the folder).

## My albums

16 of 17 made it. "Release" is the CD edition the scans and tracklist come from (for albums with
no scans: the earliest official single-CD release, which only gives the tracklist).

| Album | Release used | Cover | Disc | Back | Booklet | Tracks / previews |
| --- | --- | --- | --- | --- | --- | --- |
| Parachutes, Coldplay | 435fc965 (GB 2000) | yes (CAA) | yes | yes | yes, 8 pages + back page | 10 / 10 |
| Isles, Bicep | 862c6370 (XE 2021) | yes (CAA) | yes | yes (plain digipak back) | no | 10 / 10 |
| A Louder Silence, Leifur James | c5c62954 (no scans) | yes (CAA) | no | no | no | 10 / 10 |
| What Went Down, Foals | 0d4bca24 (US 2015) | yes (CAA) | no | yes | no | 10 / 10 |
| † (Justice), Justice | 3627095b (CA 2007) | yes (CAA) | yes | yes | no (see below) | 12 / 11 |
| Discovery, Daft Punk | d073287b (FR 2001) | yes (CAA) | yes | yes | no (see below) | 14 / 14 |
| DIE, Iosonouncane | 38a06da8 (no disc/back scans) | yes (CAA) | no | no | no | 6 / 6 |
| Uomo Donna, Andrea Laszlo De Simone | eb49ad37 (no disc/back scans) | yes (CAA) | no | no | no | 12 / 12 |
| Californication, Red Hot Chili Peppers | be580d1c (US 1999) | yes (CAA) | yes | yes | no (see below) | 15 / 15 |
| Black Sands, Bonobo | fe2e0d9e (GB 2025 reissue) | yes (CAA) | yes | yes | no | 12 / 12 |
| A Rush of Blood to the Head, Coldplay | 2b980684 (XE 2002) | yes (CAA) | yes | yes | yes, 8 pages + back page | 11 / 11 |
| Blurred, Kiasmos (EP) | 0074b61a (no scans) | yes (CAA) | no | no | no | 10 / 6 |
| Kiasmos, Kiasmos | 73e4a3e9 (GB 2014) | yes (CAA) | yes | yes | no | 8 / 8 |
| Beauty In Simplicity, Kai Schumacher | b45d8fc9 (no disc/back scans) | yes (CAA) | no | no | no | 11 / 11 |
| Turbe Giovanili, Fabri Fibra | 939af005 (XE 2002) | yes (Apple; CAA's is 600 px) | no | yes | no | 17 / 17 |
| Natura Viva, Eugenio in Via Di Gioia | fa92e4e6 (no disc/back scans) | yes (Apple; CAA's is 466 px) | no | no | no | 10 / 10 |

Skipped: **Selected Works, Tom Day**. MusicBrainz has the release group
(93eecc03-6d3e-455a-8fe4-1324477e2d4d) but no official CD release, and the app only shows
single-CD jewel cases.

Missing artwork follows what the code does (`scene.ts`, `DECISIONS.md`): no disc scan, so the
disc prints the cover; no back insert, so a generated insert; no booklet back page, so a
generated one; no booklet scans, so the booklet has the cover, two blank inside pages and the
generated back page. Nothing was invented.

Booklets left out on purpose (the scans exist, but the page order or completeness isn't certain):
- Justice (3627095b): seven single-page scans; the art pages pair into spreads, but the order of
  the spreads and the credits isn't clear.
- Discovery (d073287b): a folded poster and lyric panels, not a stapled booklet.
- Californication: be580d1c has 8 booklet images and 31249763 has 15 single pages, but the
  archive kept answering 500 for several thumbnails, so the scans couldn't be checked.
- A Rush of Blood to the Head and Parachutes: only 3 inside spreads each are archived, so their
  8-page booklets may be shorter than the real ones.

Previews missing on Apple (no track ID in the `it` storefront): Justice "Tthhee Ppaarrttyy"
(Apple matched the Anniversary Edition); Blurred "Drawn", "Gaunt", "Swept", "Swept (Tale of Us
remix)" (the CD has remixes that Apple's version doesn't).

Spotify links are the album IDs from `spotify.yml`. Californication's is the Deluxe Edition, so
the CD's 15 tracks differ from Spotify's longer list.

## How the services were queried

From the docs read before the first request: MusicBrainz allows about 1 request a second per IP,
answers 503 past that, and wants a User-Agent of the form `App/version ( contact )`. The Cover
Art Archive has no published rate limit but may answer 503. Apple's iTunes Search API allows
about 20 calls a minute, asks large users to cache lookups, and says previews may only be
streamed, never saved.

- Every request goes through `local/cached-fetch.mjs`: one at a time, at least 1.1 s apart for
  MusicBrainz, 3.2 s for iTunes and 1 s for the Cover Art Archive. It backs off exponentially on
  429/503/5xx (5, 10, 20... s, or `Retry-After`), then gives up. A URL that gave up is not retried
  for six hours.
- User-Agent: `discography-prototype/0.1 ( https://github.com/dmtrbrl/discography )`.
- Every raw JSON response and image is cached in `cache/` (gitignored), with 404s noted, so a
  rerun fetches only what is new. Preview audio is never downloaded: as in the original, the page
  fetches fresh preview URLs from Apple at runtime.
- The upstream scripts didn't comply as published: both sent `discography-demo/0.1 (local demo)`
  with no contact, `fetch-tracks.mjs` cached nothing, and `download-covers.sh` cached nothing and
  retried 503s every 5 s. Patched locally: `fetch-tracks.mjs` now uses the cached client and reads
  `COLLECTION`/`APPLE_COUNTRY`; it also looks the artist up by name on iTunes when MusicBrainz has
  no Apple link, and logs instead of throwing. `download-covers.sh` gets the compliant User-Agent
  and `COLLECTION`, but isn't used here because of `sips`. `optimize-images.mjs` reads
  `COLLECTION`.
- The Cover Art Archive was flaky during the run: one listing
  (bdd44b9c, a What Went Down release) and several Californication thumbnails answered 500/503
  through every retry and were skipped.
