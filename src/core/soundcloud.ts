// SoundCloud podcast feeds only list the newest 500 episodes. For those shows the app fetches the
// rest from SoundCloud once (through its own proxy) and keeps them; they play through the proxy too.
import type { Episode, Podcast } from './types';
import { hash } from './util';

const USER = /soundcloud:users:(\d+)/;

export function soundcloudUser(feedUrl: string): string | null {
  return feedUrl.match(USER)?.[1] || null;
}

interface Track { id: number; title: string; description: string; date: string; duration: number; image: string; link: string }

/** The episodes SoundCloud still has that the feed no longer lists. */
export async function olderSoundcloudEpisodes(proxyUrl: string, podcast: Pick<Podcast, 'id' | 'feedUrl'>, have: Episode[]): Promise<Episode[]> {
  const user = soundcloudUser(podcast.feedUrl);
  if (!user) return [];
  const r = await fetch(`${proxyUrl || '/api/proxy'}?scarchive=${user}`);
  if (!r.ok) throw new Error('SoundCloud archive unavailable');
  const { tracks } = (await r.json()) as { tracks: Track[] };
  const known = new Set(have.map((e) => e.guid));
  return tracks
    .map((t) => ({ t, guid: `tag:soundcloud,2010:tracks/${t.id}` }))
    .filter(({ guid }) => !known.has(guid))
    .map(({ t, guid }) => ({
      id: hash(podcast.id + '|' + guid), // the same id the feed would give it
      podcastId: podcast.id,
      guid,
      title: t.title,
      description: t.description,
      audioUrl: `${proxyUrl || '/api/proxy'}?sc=${t.id}`,
      audioType: 'audio/mpeg',
      pubDate: Date.parse(t.date) || 0,
      duration: t.duration,
      image: t.image,
      link: t.link,
    }));
}

/** Download address for a SoundCloud episode (the proxy streams the file instead of redirecting). */
export function soundcloudDownloadUrl(audioUrl: string): string | null {
  return /[?&]sc=\d+/.test(audioUrl) ? audioUrl + '&stream=1' : null;
}
