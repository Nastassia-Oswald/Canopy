# Tapedeck

A podcast player for your phone. Add shows by search or RSS link (including private Patreon feeds), sort them into categories, and browse each show by **series**, so you can play *The Russian Revolution* from Revolutions or *The War of the Triple Alliance* from Lions Led by Donkeys from part 1 in order.

It's a web app you install on your home screen (a PWA). Your library is stored on the phone.

## Features

- **Add podcasts** by name (Apple Podcasts directory search) or by pasting any RSS link. Import an OPML file from your current podcast app.
- **Patreon**: paste your private Patreon audio RSS link. Bonus episodes appear alongside the public ones, marked with a Patreon badge.
- **Categories**: News, History, Entertainment, Politics, Science and Culture to start with. Rename, delete or add your own. A show can be in more than one. Categories are suggested from the feed when you don't choose one.
- **Series, found automatically**:
  - numbered episodes: `11.29-Liberty, Equality, Humanity` → *The Martian Revolution* (Revolutions' series have their real names built in)
  - multi-part episodes: `Episode 310 - The Weather Underground: Part 1`, `Gallipoli Pt. II`, `(2/3)`
  - previews and bonus copies group with the full series: `*PREVIEW* The French Wars of Religion`
  - repeated title words: `Appendix 12- …`, `Rome: The Gracchi`
  - `itunes:season` tags when a feed uses them
  - **your own rules** when a show names series some other way (podcast → ⋯ → Series rules)
- **All series**: every series across all your shows, searchable and filterable by category (the list icon at the top of Topics).
- **Playlists tab**: a grid of covers. Fave, Sleep, Listen later and Offline come built in (Offline fills itself with every episode saved on the phone) (rename them, but they can't be deleted). Hold a cover to rename it, pick one of the 24 Tapedeck covers (or plain Fog), a pixel mark, or upload your own photo. Mix single episodes, whole series and whole shows; a series stays up to date as new parts come out. Any episode's menu has *Save to Listen later*.
- **No teasers in Today**: for shows you don't have the Patreon feed of, episodes titled "Patreon Preview…", "Introducing…" or "*PREVIEW*" stay out of the round-up and New episodes (they're still in the show itself).
- **Today tab**:
  - **Daily round-up**: the newest episode (from the last 30 hours) of each show you pick, played back to back in your order. It starts with your News shows; tap Edit to choose and reorder.
  - **New episodes**: every unplayed episode from the last 14 days across all your shows, newest first, filterable by category. Play all, send all to Up Next, or Clear to start fresh.
  - Both also appear at the top of the Playlists tab.
- **Sleep & Meditation stays separate**: shows in that category never appear in Today's round-up or New episodes. Any category can be kept out of Today from Settings → Categories (the moon icon). Find sleep shows under Library → Sleep & Meditation.
- **OPML import keeps categories**: a `category` attribute or the folder a show sits in becomes its Tapedeck category. Imports run six feeds at a time with a progress count.
- **Finished at 85%**: an episode you've heard more than 85% of counts as finished and drops out of Unplayed. It keeps its place, so you can still hear the end.
- **Episode filters**: All, Unplayed, In progress, Finished; **No guests** hides titles that name a guest ("… with Jane Smith", "feat. …", "con Mario Rossi"), remembered per show; sort by newest, oldest, recently played or played longest ago.
- **Search**: inside a show (series and episodes), and across every show from the Topics search.
- **Offline**: save an episode from its ⋯ menu, or a whole playlist with *Save for offline*. Saved episodes show a green arrow and play without internet (and always work with Volume boost). Settings → Offline lists them, shows the space used, and can delete each copy once you've finished it. Hosts that block direct downloads go through `/api/proxy?audio=`, which streams the file.
- **Volume boost**: Off, Boost or Max, in the player and in Settings. A compressor lifts quiet voices and tames loud bits, then gain goes past the phone's maximum. Hosts that don't allow it (no CORS) play at normal volume automatically.
- **Daily round-up**: tick an episode off with the lime check to remove it; Edit brings them back.
- **Show quick actions** (⋯ on a show's artwork in a topic): add to favourites, add to playlist (the whole show), remove show. Shows in a topic are ordered by when you last listened. The heart puts the whole show in the Fave playlist.
- **Finished episodes** fade to grey with a green check (the library's success green, #5F9349; `--done` in `src/ui/tokens.css`).
- **Sleep timer**: 3 minutes before the end (skips loud outros and ads), end of this episode, in 1 hour, or in 2 hours. It fades out over the last 20 seconds and steps back 30 seconds so you can find your place. The time left shows in the mini player.
- **Up Next** queue, resume where you stopped, played/unplayed, 0.8×–2× speed, skip 15/30 s, lock-screen and headphone controls.

## Put it on your phone

You need a free [Vercel](https://vercel.com) account (it hosts the app and the small feed proxy it needs).

1. Put this folder in a GitHub repository (github.com → New repository → upload the files, or `git push`).
2. In Vercel: **Add New → Project**, pick the repository, keep the defaults, **Deploy**.
3. Open the address Vercel gives you (e.g. `podshelf-yourname.vercel.app`) on your phone:
   - **iPhone**: Safari → Share → **Add to Home Screen**
   - **Android**: Chrome → ⋮ → **Install app**

Or from a terminal: `npm i -g vercel && vercel --prod` in this folder.

### Your Patreon RSS link

In the Patreon app, open the creator's page → **More → Add to podcast app → Copy**. On the website: **More → Your membership → Listen in other podcast apps → Other podcast apps → Copy**. Paste it in Tapedeck under **Add podcast → RSS or Patreon link**. The link has a personal key in it, so keep it to yourself. ([Patreon help](https://support.patreon.com/hc/en-us/articles/360041347732-How-to-use-your-audio-RSS))

If a Patreon show has a public feed too, you can add both, or only the Patreon one, which usually includes everything.

## Why there's a proxy

Most podcast hosts don't let web pages read their RSS directly (no CORS headers). `api/proxy.ts` fetches the feed on the server and passes it back, and also handles directory search. It runs as a Vercel function; during development Vite runs the same code. Audio is streamed straight from the podcast host, not through the proxy.

SoundCloud feeds stop at the newest 500 episodes. For those shows the app asks `?scarchive=<user id>` once for the full back-catalogue and plays the older episodes through `?sc=<track id>` (a redirect to SoundCloud's file; `&stream=1` streams it for offline saving). Episodes that drop off any feed stay in the app.

Private feed links pass through your own proxy only, and responses are marked `private` so shared caches don't keep them.

## Updates on the phone

The app checks `/version.json` when it opens and whenever you come back to it. When the live version is newer than `src/version.ts`, a green banner offers **Update**; Settings → App has **Check for updates** too. Updating swaps the app's files only: your library, progress and offline episodes stay. Bump `APP_VERSION` in `src/version.ts` with every release.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173, proxy included
npm test         # series detection tests
npm run build
```

## Look and feel

The app uses the Tapedeck component library (v3): Chill Black everywhere, Misty Lilac for anything you press, Fog panels with brushed metal and hatching, Dirtyline titles, Alef labels, Figtree text, thin square-ended icons and 7×7 pixel glyphs for topics. There is one theme, whatever the phone's setting.

Topics is the library: topic pills that scroll sideways, a Shows / Latest episodes switch and a three-column show grid.

The bottom bar has Playlists, Topics and Settings on the left and Today as the round button on the right. All series opens from the Topics top bar; Up Next opens from the player. Pixel marks are from Pixelarticons by Gerrit Halfmann (MIT).

## Using your own component library

Screens import UI only from `src/ui/index.ts`. To switch to your library, re-export your components from that file under the same names and props:

| Name | Used for |
|---|---|
| `Button` | `variant` primary / secondary / ghost / danger, `icon`, `small`, `full` |
| `IconButton` | round icon action; `size` m / l / xl, `variant` plain / filled, `badge` |
| `Chip`, `ChipRow` | category filters (horizontal scroll) |
| `Badge` | Patreon and category labels; `tone` neutral / patreon / accent |
| `Artwork` | square cover art with letter fallback |
| `ListRow` | episode, series, playlist rows: `leading`, `title`, `subtitle`, `meta`, `trailing` |
| `Section` | labelled group |
| `TextField`, `Toggle`, `Segmented` | form controls |
| `ProgressBar` | listening progress |
| `Sheet`, `MenuItem` | bottom sheets and action lists |
| `EmptyState`, `Toast`, `Spinner` | feedback |
| `Icon` | 24 px icon set (`src/ui/icons.tsx`) |

Tokens (colors, type, radius, spacing) are in `src/ui/tokens.css`; primitive styles in `src/ui/ui.css`. Screen layout lives separately in `src/screens/screens.css`.

## Project map

```
api/proxy.ts          feed + search proxy (Vercel function)
src/core/rss.ts       RSS parsing
src/core/series.ts    series detection (pure TS, tested in series.test.ts)
src/core/store.ts     library, categories, playlists, progress; saved in IndexedDB
src/core/player.ts    audio, queue, resume, lock-screen controls
src/ui/               swappable UI primitives + tokens
src/core/lists.ts     New episodes + Daily round-up
src/screens/          Today, Library, Series, Playlists, Up Next, Settings, player
```

## Limits

- Your library lives on one device. Use **Settings → Save backup** to move it, or restore it after reinstalling.
- Offline copies are saved while the app is open; iPhones pause downloads when you switch away.
- Episodes are checked for when you open the app (if it's been 30+ minutes) or tap refresh. There are no push notifications for new episodes.
- Series detection is based on titles. When it misses one, add a rule; when it names one badly, rename it from the series' ⋯ menu.
