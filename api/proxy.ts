// Shared proxy logic. Used by the Vercel functions in /api and by the Vite dev server.
// Browsers can't read most podcast RSS feeds directly (no CORS headers), so the app
// asks this proxy to fetch the feed and hand the XML back.

const MAX_BYTES = 40 * 1024 * 1024; // big back-catalogues (Revolutions, LLBD) are several MB

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === '0.0.0.0' ||
    h.startsWith('[')
  );
}

function error(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export async function proxyFeed(requestUrl: string): Promise<Response> {
  const target = new URL(requestUrl).searchParams.get('url');
  if (!target) return error(400, 'Missing ?url=');
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return error(400, 'That is not a valid web address.');
  }
  if (!/^https?:$/.test(parsed.protocol)) return error(400, 'Only http and https feeds are supported.');
  if (isBlockedHost(parsed.hostname)) return error(400, 'That address is not allowed.');

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Tapedeck/1.0 (+personal podcast player)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
  } catch {
    return error(502, 'Could not reach the feed. Check the address and try again.');
  }
  if (!upstream.ok) {
    return error(upstream.status === 404 ? 404 : 502, `The feed answered with ${upstream.status}.`);
  }
  const len = Number(upstream.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return error(413, 'Feed is too large.');
  const body = await upstream.text();
  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/xml; charset=utf-8',
      // Private feeds (Patreon) carry a token in the URL: never cache them on shared CDNs.
      'Cache-Control': 'private, max-age=300',
    },
  });
}

export async function proxySearch(requestUrl: string): Promise<Response> {
  const q = new URL(requestUrl).searchParams.get('q')?.trim();
  if (!q) return error(400, 'Missing ?q=');
  const api = `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=20&term=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(api);
    if (!r.ok) return error(502, 'Search is unavailable right now.');
    const data = (await r.json()) as { results?: Array<Record<string, unknown>> };
    const seen = new Set<string>();
    const results = (data.results || [])
      .filter((x) => typeof x.feedUrl === 'string' && !seen.has(x.feedUrl) && !!seen.add(x.feedUrl))
      .map((x) => ({
        title: x.collectionName,
        author: x.artistName,
        feedUrl: x.feedUrl,
        image: x.artworkUrl600 || x.artworkUrl100,
        genre: x.primaryGenreName,
      }));
    return new Response(JSON.stringify({ results }), {
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return error(502, 'Search is unavailable right now.');
  }
}

/**
 * Episode audio for offline downloads, for hosts that don't let the app fetch it directly.
 * The file is streamed straight through (never held in memory), so size isn't a problem.
 */
export async function proxyAudio(requestUrl: string): Promise<Response> {
  const target = new URL(requestUrl).searchParams.get('audio');
  if (!target) return error(400, 'Missing ?audio=');
  return streamAudio(target);
}

async function streamAudio(target: string): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return error(400, 'That is not a valid web address.');
  }
  if (!/^https?:$/.test(parsed.protocol)) return error(400, 'Only http and https audio is supported.');
  if (isBlockedHost(parsed.hostname)) return error(400, 'That address is not allowed.');
  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), { redirect: 'follow', headers: { 'User-Agent': 'Tapedeck/1.0 (+personal podcast player)' } });
  } catch {
    return error(502, 'Could not reach the episode.');
  }
  if (!upstream.ok || !upstream.body) return error(502, `The episode answered with ${upstream.status}.`);
  const type = upstream.headers.get('content-type') || 'audio/mpeg';
  if (/text\/html|json|xml/i.test(type)) return error(415, 'That is not an audio file.');
  const headers: Record<string, string> = { ...cors, 'Content-Type': type, 'Cache-Control': 'private, no-store', 'Access-Control-Expose-Headers': 'Content-Length' };
  const len = upstream.headers.get('content-length');
  if (len) headers['Content-Length'] = len;
  return new Response(upstream.body, { status: 200, headers });
}

// ---------- SoundCloud back-catalogue ----------
// SoundCloud's podcast feeds stop at the newest 500 episodes. The older ones are still on
// SoundCloud, so the app can list them (?scarchive=<user id>) and play them (?sc=<track id>).
// SoundCloud's web player uses a public key that changes now and then; it's read from their site.
let clientId = '';

async function readClientId(): Promise<string> {
  const home = await (await fetch('https://soundcloud.com/', { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const scripts = home.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g) || [];
  for (const src of scripts.reverse()) {
    const js = await (await fetch(src)).text();
    const m = js.match(/client_id:"([A-Za-z0-9]{20,40})"/);
    if (m) return m[1];
  }
  throw new Error('no key');
}

async function scApi(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!clientId) clientId = await readClientId();
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'client_id=' + clientId, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.status !== 401 && r.status !== 403) return r;
    clientId = ''; // the key changed: read it again
  }
  throw new Error('SoundCloud refused');
}

export async function proxySoundcloudArchive(userId: string): Promise<Response> {
  if (!/^\d+$/.test(userId)) return error(400, 'Bad SoundCloud user');
  try {
    const out: unknown[] = [];
    let next: string | null = `https://api-v2.soundcloud.com/users/${userId}/tracks?limit=200&linked_partitioning=1`;
    for (let page = 0; next && page < 15; page++) {
      const r = await scApi(next);
      if (!r.ok) return error(502, `SoundCloud answered with ${r.status}.`);
      const d = (await r.json()) as { collection: Array<Record<string, any>>; next_href?: string | null };
      for (const t of d.collection) {
        out.push({
          id: t.id,
          title: t.title,
          description: String(t.description || '').slice(0, 3000),
          date: t.display_date || t.created_at,
          duration: Math.round((t.full_duration || t.duration || 0) / 1000),
          image: t.artwork_url ? String(t.artwork_url).replace('-large.', '-t500x500.') : '',
          link: t.permalink_url,
        });
      }
      next = d.next_href || null;
    }
    return new Response(JSON.stringify({ tracks: out }), { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } });
  } catch {
    return error(502, 'SoundCloud is unavailable right now.');
  }
}

/** Plays (or, with stream=1, downloads) one SoundCloud track by sending the app to its file. */
export async function proxySoundcloudTrack(trackId: string, stream: boolean): Promise<Response> {
  if (!/^\d+$/.test(trackId)) return error(400, 'Bad SoundCloud track');
  try {
    const r = await scApi(`https://api-v2.soundcloud.com/tracks/${trackId}`);
    if (!r.ok) return error(r.status === 404 ? 404 : 502, `SoundCloud answered with ${r.status}.`);
    const t = (await r.json()) as { media?: { transcodings?: Array<{ url: string; format: { protocol: string; mime_type: string } }> } };
    const prog = t.media?.transcodings?.find((x) => x.format.protocol === 'progressive');
    if (!prog) return error(415, 'This SoundCloud episode has no playable file.');
    const signed = (await (await scApi(prog.url)).json()) as { url?: string };
    if (!signed.url) return error(502, 'SoundCloud didn’t hand over the file.');
    if (stream) return streamAudio(signed.url);
    return new Response(null, { status: 302, headers: { ...cors, Location: signed.url, 'Cache-Control': 'no-store' } });
  } catch {
    return error(502, 'SoundCloud is unavailable right now.');
  }
}

// Vercel function entry: /api/proxy?url=<feed>, ?q=<search terms>, ?audio=<episode file>,
// ?scarchive=<SoundCloud user id> or ?sc=<SoundCloud track id>
export function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  if (params.has('sc')) return proxySoundcloudTrack(params.get('sc')!, params.get('stream') === '1');
  if (params.has('scarchive')) return proxySoundcloudArchive(params.get('scarchive')!);
  if (params.has('audio')) return proxyAudio(request.url);
  return params.has('q') ? proxySearch(request.url) : proxyFeed(request.url);
}

