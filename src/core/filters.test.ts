import { hasGuest } from './filters.ts';
const yes = ['The Age of Imperialist Realism feat. Daniel Bessner (E39)', 'Interview with Jane Smith', 'Episode 12 - Rome with Mary Beard', 'Ep 4: w/ John Doe', 'La guerra fredda con Mario Rossi', 'Talking Tarot with Dr. Ana Lopez'];
const no = ['Life with cats', 'The Weather Underground: Part 1', 'Living with the dead', '10.3- The July Days', 'Episode 310 - The Winter War Part 1'];
let bad = 0;
for (const t of yes) if (!hasGuest(t)) { console.log('MISSED', t); bad++; }
for (const t of no) if (hasGuest(t)) { console.log('FALSE', t); bad++; }
console.log(bad ? 'guest detection: ' + bad + ' problems' : 'ok guest detection');
