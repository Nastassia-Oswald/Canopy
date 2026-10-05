import type { Episode, Podcast } from './types';
import { hash } from './util';

export interface ParsedFeed {
  podcast: Omit<Podcast, 'id' | 'feedUrl' | 'categoryIds' | 'isPatreon' | 'addedAt' | 'lastFetched'>;
  episodes: Episode[];
  /** Genres the feed declares in itunes:category, used to suggest a category. */
  feedCategories: string[];
}

function text(el: Element | null | undefined): string {
  return (el?.textContent || '').trim();
}

function first(parent: Element, ...names: string[]): Element | null {
  for (const n of names) {
    // Only direct children, so an <item>'s <title> never wins over the channel's.
    for (const child of Array.from(parent.children)) {
      if (child.tagName === n || child.tagName.toLowerCase() === n.toLowerCase()) return child;
    }
  }
  return null;
}

export function parseDuration(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function stripHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+\n/g, '\n').trim();
}

export function parseFeed(xml: string, podcastId: string): ParsedFeed {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('This address did not return a podcast feed. Check that you copied the RSS link.');
  }
  const channel = doc.getElementsByTagName('channel')[0];
  if (!channel) throw new Error('This address did not return a podcast feed. Check that you copied the RSS link.');

  const channelImage =
    first(channel, 'itunes:image')?.getAttribute('href') ||
    text(first(first(channel, 'image') || channel, 'url')) ||
    '';

  const feedCategories = Array.from(channel.getElementsByTagName('itunes:category'))
    .map((c) => c.getAttribute('text') || '')
    .filter(Boolean);

  const items = Array.from(channel.getElementsByTagName('item'));
  const episodes: Episode[] = [];
  for (const item of items) {
    const enclosure = first(item, 'enclosure');
    const audioUrl = enclosure?.getAttribute('url') || '';
    if (!audioUrl) continue; // text-only posts (common in Patreon feeds) can't be played
    const guid = text(first(item, 'guid')) || audioUrl;
    const season = Number(text(first(item, 'itunes:season'))) || undefined;
    const episodeNumber = Number(text(first(item, 'itunes:episode'))) || undefined;
    const date = Date.parse(text(first(item, 'pubDate')));
    episodes.push({
      id: hash(podcastId + '|' + guid),
      podcastId,
      guid,
      title: text(first(item, 'title', 'itunes:title')) || 'Untitled episode',
      // capped so 300+ shows with long back-catalogues stay light on the phone
      description: stripHtml(text(first(item, 'content:encoded')) || text(first(item, 'description', 'itunes:summary'))).slice(0, 3000),
      audioUrl,
      audioType: enclosure?.getAttribute('type') || 'audio/mpeg',
      pubDate: Number.isNaN(date) ? 0 : date,
      duration: parseDuration(text(first(item, 'itunes:duration'))),
      image: first(item, 'itunes:image')?.getAttribute('href') || '',
      season,
      episodeNumber,
      link: text(first(item, 'link')),
    });
  }
  episodes.sort((a, b) => b.pubDate - a.pubDate);

  return {
    podcast: {
      title: text(first(channel, 'title')) || 'Untitled podcast',
      author: text(first(channel, 'itunes:author', 'author', 'managingEditor')),
      image: channelImage,
      description: stripHtml(text(first(channel, 'description', 'itunes:summary'))),
      link: text(first(channel, 'link')),
    },
    episodes,
    feedCategories,
  };
}

export function proxied(proxyUrl: string, feedUrl: string): string {
  const base = proxyUrl.replace(/\/$/, '');
  return `${base}?url=${encodeURIComponent(feedUrl)}`;
}

export async function fetchFeed(proxyUrl: string, feedUrl: string, podcastId: string): Promise<ParsedFeed> {
  let res: Response;
  try {
    res = await fetch(proxied(proxyUrl, feedUrl));
  } catch {
    throw new Error("Couldn't connect. Check your internet connection, or the proxy address in Settings.");
  }
  if (!res.ok) {
    let msg = `The feed couldn't be loaded (${res.status}).`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* not json */
    }
    if (res.status === 401 || res.status === 403) {
      msg += ' If this is a Patreon feed, copy a fresh RSS link from Patreon.';
    }
    throw new Error(msg);
  }
  return parseFeed(await res.text(), podcastId);
}

export function isPatreonUrl(url: string): boolean {
  return /patreon\.com/i.test(url);
}
