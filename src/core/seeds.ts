// One-off additions to the built-in playlists, applied once on the phone and then remembered.
import type { Episode } from './types';
import { useStore } from './store';

/** Episodes Nastassia asked to have in Sleep (September 2026), in her playlist's order. */
const SLEEP: Array<{ feed: string; titles: string[] }> = [
  { feed: "https://feeds.megaphone.fm/SGP8517078272", titles: ["A Peaceful Foraging Walk", "The Flower Farmer", "Stories of the Sun", "The Sleepy Science of Seed Dispersal", "A Peaceful Celebration of the Seasons", "A Sleepy Stay at a Ryokan: Part 1", "A Sleepy Stay at a Ryokan: Part 2", "A Peaceful Walk in a Snowy Forest"] },
  { feed: "https://feeds.simplecast.com/6_t5gokk", titles: ["Spirit of the Pumpkin Patch", "3 HOUR MIX (+music) | Snowy Sleep Stories", "The Frost Fairy", "Moonlight in the Elven Wood", "Bathhouse of the Spirits", "The Snowy Day Library", "Magic in the Moon Garden"] },
  { feed: "https://feeds.megaphone.fm/sleepmagic", titles: ["Enjoying The Privacy Of Sleep", "Soothing Yourself For Better Sleep", "Using Your Intuition", "Manifesting As We Sleep", "Getting Back To Basics", "Evolving Through The Solstice"] },
  { feed: "https://rss.pdrl.fm/38e80f/feeds.simplecast.com/iEtFYQyO", titles: ["Sleep in the Clouds | Healing Music for Deep Sleep", "Evening Thunderstorm on the Farm | Rain, Thunder, Wind & Chimes", "Rain Storm on the Island | Rain and Ocean Waves Sounds", "Summer Thunderstorm | Rain, Thunder & Cricket Sounds for Sleep", "Soothing Jazz in the Next Room", "Enchanted Fairyland in the Forest", "Alaskan Alpine Forest Ambience & Calming Music"] },
  { feed: "https://podcasts.files.bbci.co.uk/p02nrtq1.rss", titles: ["Tales of Hogmanay and New Year's Day", "A Big Garden Birdwatch Special from Mark Stephen's Bird Feeders."] },
  { feed: "https://feeds.megaphone.fm/PHTE1373658408", titles: ["Ep 141: \"We Circle-Danced with Forest Fairies\" Experiencer Stories"] },
];
/** Shows from that list that weren't in the library yet. */
const ADD_IF_MISSING = ['https://feeds.megaphone.fm/PHTE1373658408'];

const norm = (t: string) => t.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();

let running = false;

/** Adds any listed episode that isn't in Sleep yet. Each one is only ever added once, so removing it later sticks. */
export async function applySeeds() {
  if (running) return;
  running = true;
  try {
    const s = useStore.getState();
    const done = new Set(s.settings.seedsDone || []);
    const known = new Set(s.podcasts.map((p) => p.feedUrl));
    // only for a library that already has these sleep shows
    if (!SLEEP.some((g) => known.has(g.feed))) return;
    for (const feed of ADD_IF_MISSING) {
      if (!known.has(feed) && !done.has('show|' + feed)) {
        try { await s.addPodcast(feed); } catch { continue; }
      }
      done.add('show|' + feed);
    }
    const st = useStore.getState();
    const sleep = st.playlists.find((p) => p.builtin === 'sleep');
    if (!sleep) return;
    const inList = new Set(sleep.items.flatMap((i) => (i.kind === 'episode' ? [i.episodeId] : [])));
    for (const g of SLEEP) {
      const pod = st.podcasts.find((p) => p.feedUrl === g.feed);
      if (!pod) continue;
      const eps: Episode[] = st.episodes[pod.id] || [];
      for (const title of g.titles) {
        const key = g.feed + '|' + title;
        if (done.has(key)) continue;
        const ep = eps.find((e) => norm(e.title) === norm(title));
        if (!ep) continue; // not loaded yet: try again next time
        if (!inList.has(ep.id)) { useStore.getState().addToPlaylist(sleep.id, { kind: 'episode', episodeId: ep.id }); inList.add(ep.id); }
        done.add(key);
      }
    }
    useStore.getState().updateSettings({ seedsDone: [...done] });
  } finally {
    running = false;
  }
}
