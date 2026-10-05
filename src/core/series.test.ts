// Run with: npm test
import { detectSeries, presetNumberedNames } from './series.ts';
import type { Episode } from './types';

let t = Date.UTC(2015, 0, 1);
const ep = (title: string, extra: Partial<Episode> = {}): Episode => ({
  id: title, podcastId: 'p', guid: title, title, description: '', audioUrl: 'x', audioType: 'audio/mpeg',
  pubDate: (t += 86400000 * 7), duration: 0, image: '', link: '', ...extra,
});

function show(name: string, eps: Episode[], title = '') {
  const s = detectSeries('p', eps, { numberedNames: presetNumberedNames(title) });
  console.log(`\n== ${name}`);
  for (const x of s) console.log(`  [${x.source}] ${x.name}: ${x.episodeIds.join(' | ')}`);
  const claimed = new Set(s.flatMap((x) => x.episodeIds));
  console.log('  (not in a series):', eps.filter((e) => !claimed.has(e.id)).map((e) => e.title).join(' | '));
  return s;
}

const rev = show('Revolutions', [
  ep('10.1- The Russian Empire', { season: 11 }), ep('10.2- Autocracy', { season: 11 }), ep('10.2a- Bonus', { season: 11 }),
  ep('11.1- The Beginning', { season: 12 }), ep('11.2- Mars', { season: 12 }), ep('11.29-Liberty, Equality, Humanity', { season: 12 }),
  ep('Frauncis Tavern July 5, Patreon Q&A July 14', { season: 12 }), ep('Live Event in NYC Thursday May 14', { season: 13 }), ep('Appendix 1- Coming Full Circle'), ep('Appendix 2- The Ancien Regime'),
], 'Revolutions');

const ll = show('Lions Led by Donkeys', [
  ep('Episode 208 - The Siege of Kut'),
  ep('Episode 210 - The War of the Triple Alliance Part 1: Night Demons'),
  ep('Episode 211 - The War of the Triple Alliance Part 2: The Marshal'),
  ep('Episode 212 - The War of the Triple Alliance Part 3'),
  ep('Episode 310 - The Weather Underground: Part 1'),
  ep('Episode 311 - The Weather Underground: Part 2'),
  ep('*PREVIEW* The French Wars of Religion Part 1'), ep('The French Wars of Religion Part 2'), ep('Episode 312 - Gallipoli Pt. 1'), ep('Patreon Bonus - Gallipoli Pt. II'),
]);

const misc = show('Prefix show', [
  ep('Rome: The Gracchi'), ep('Rome: Sulla'), ep('Rome: Caesar'), ep('Interview: Someone'), ep('Random chat'),
]);

const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
console.log();
assert(rev.find((s) => s.name === 'Appendix')?.episodeIds.length === 2, 'Appendix N-');
assert(ll.find((s) => s.name === 'The French Wars of Religion')?.episodeIds.length === 2, 'preview merges');
assert(rev.find((s) => s.key === 'num:10')?.name === 'The Russian Revolution', 'Revolutions numbered name');
assert(rev.find((s) => s.key === 'num:10')?.episodeIds.join() === '10.1- The Russian Empire,10.2- Autocracy,10.2a- Bonus', 'Revolutions order');
assert(!rev.some((s) => s.source === 'season'), 'no season noise when numbered');
assert(ll.find((s) => s.name === 'The War of the Triple Alliance')?.episodeIds.length === 3, 'LLBD triple alliance');
assert(ll.find((s) => s.name === 'The Weather Underground')?.episodeIds.length === 2, 'LLBD weather underground');
assert(ll.find((s) => s.name === 'Gallipoli')?.episodeIds.length === 2, 'Pt. roman');
assert(misc.find((s) => s.name === 'Rome')?.episodeIds.length === 3, 'prefix');

// Behind the Bastards style: "Part One: <topic>", "Part Two: <topic>"; group by the topic, never by "Part One"
const btb = show('Behind the Bastards', [
  ep('Part One: King Leopold II: The First Modern Bastard'), ep('Part Two: King Leopold II: The First Modern Bastard'),
  ep('Part One: It Takes A Village of Bastards to Make a Weinstein'), ep('Part Two: It Takes A Village of Bastards to Make a Weinstein'),
  ep('Part One: Rebecca Felton: The First Female Senator (was also a pro-lynching white supremacist)'),
  ep('Part Two: Rebecca Felton: The First Female Senator (was also a pro-lynching white supremacist)'),
  ep('Part Three: How The Navy SEALs Lost Their Mind'), ep('Part Four: How The Navy SEALs Lost Their Mind'),
  ep('It Could Happen Here Weekly 241'), ep('Part One: Qaddafi: His Bizarre Sci-Fi Stories'),
]);
assert(!btb.some((s) => /^part\b/i.test(s.name)), 'no series named "Part One"');
assert(btb.find((s) => s.name === 'King Leopold II')?.episodeIds.length === 2, 'Part One: <name> groups by name');
assert(btb.find((s) => s.name === 'Rebecca Felton')?.episodeIds.length === 2, 'Part One: <name>: subtitle');
assert(btb.find((s) => s.name === 'How The Navy SEALs Lost Their Mind')?.episodeIds.length === 2, 'Part Three/Four');
assert(btb.find((s) => s.name.startsWith('It Takes A Village'))?.episodeIds.length === 2, 'whole remainder as name');
