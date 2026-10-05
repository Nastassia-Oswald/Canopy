import { isTeaser } from './lists.ts';
const yes = ['Patreon Preview: The Siege of Paris', 'PATREON PREVIEW - Bonus episode', 'Introducing: A New Show', 'Introducing The Bunker', 'INTRODUCING...Blood Sugar', '*PREVIEW* The French Wars of Religion', 'Preview from our Patreon: Rome', 'Ep 12 - Introducing Season 3', '[Patreon Exclusive Preview] Nixon'];
const no = ['10.3- The July Days', 'Reintroducing the Gracchi', 'The Weather Underground: Part 1', 'A preview of the election', 'Interview with Jane Smith', 'Episode 310 - Patreon supporters Q&A'];
let bad = 0;
for (const t of yes) if (!isTeaser(t)) { console.log('MISSED', t); bad++; }
for (const t of no) if (isTeaser(t)) { console.log('FALSE', t); bad++; }
console.log(bad ? 'teaser detection: ' + bad + ' problems' : 'ok teaser detection');
