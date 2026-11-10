// Quotes shown on the game-over screen every time the pilot goes down.
// Three sets to choose from (CONFIG.deathQuotes); Q on the game-over screen
// cycles through them so the team can compare.
// Only public-domain texts, traditional pilot sayings and our own lines:
// no modern copyrighted books or documentaries.

// A: classic war books and famous wartime words.
const WAR = [
  { q: 'Let your plans be dark and impenetrable as night, and when you move, fall like a thunderbolt.', by: 'Sun Tzu, The Art of War' },
  { q: 'All warfare is based on deception.', by: 'Sun Tzu, The Art of War' },
  { q: 'He will win who knows when to fight and when not to fight.', by: 'Sun Tzu, The Art of War' },
  { q: 'If you know the enemy and know yourself, you need not fear the result of a hundred battles.', by: 'Sun Tzu, The Art of War' },
  { q: 'Everything is very simple in War, but the simplest thing is difficult.', by: 'Carl von Clausewitz, On War' },
  { q: 'War is the province of uncertainty.', by: 'Carl von Clausewitz, On War' },
  { q: 'No plan of operations extends with any certainty beyond the first contact with the main hostile force.', by: 'Helmuth von Moltke the Elder' },
  { q: 'It is well that war is so terrible, or we should grow too fond of it.', by: 'Robert E. Lee, Fredericksburg, 1862' },
  { q: 'Nothing except a battle lost can be half so melancholy as a battle won.', by: 'Duke of Wellington, 1815' },
  { q: 'Never in the field of human conflict was so much owed by so many to so few.', by: 'Winston Churchill, 1940' },
  { q: 'Oh! I have slipped the surly bonds of Earth.', by: 'John Gillespie Magee Jr., High Flight' },
  { q: 'The old Lie: Dulce et decorum est pro patria mori.', by: 'Wilfred Owen, Dulce et Decorum Est' },
];

// B: traditional pilot sayings (old aviation folklore, no single author).
const PILOT = [
  { q: 'There are old pilots and there are bold pilots, but there are no old, bold pilots.', by: 'Pilot saying' },
  { q: 'Any landing you can walk away from is a good landing.', by: 'Pilot saying' },
  { q: 'Takeoffs are optional. Landings are mandatory.', by: 'Pilot saying' },
  { q: 'Speed is life. Altitude is life insurance.', by: 'Fighter pilot saying' },
  { q: 'Lose sight, lose fight.', by: 'Fighter pilot saying' },
  { q: 'Check six.', by: 'Fighter pilot saying' },
  { q: 'Aviate, navigate, communicate.', by: 'Flight training rule' },
  { q: 'The most useless things to a pilot: the altitude above you, the runway behind you and a tenth of a second ago.', by: 'Pilot saying' },
  { q: 'Never let an aircraft take you somewhere your brain didn\'t get to five minutes earlier.', by: 'Pilot saying' },
];

// C: our own lines, read like an 80s TV war-documentary narrator.
// Some only fit one way the run ends (crash / shot / red / won).
const DOC = [
  { q: 'By 0300 hours the swarm had tripled. Radio contact was lost shortly after.', by: 'Night Ace: The Untold Story' },
  { q: 'Nobody had told them the drones didn\'t sleep.', by: 'Night Ace: The Untold Story' },
  { q: 'Of the pilots who flew that night, few saw the sunrise. This was not one of them.', by: 'Night Ace: The Untold Story' },
  { q: 'Command would later call it a tactical withdrawal. The pilot called it a very long walk home.', by: 'Night Ace: The Untold Story' },
  { q: 'Somewhere above the treeline, the Mothership was still waiting for dawn.', by: 'Night Ace: The Untold Story' },
  { q: 'The parachute was the last part of the aircraft that worked as designed.', by: 'Night Ace: The Untold Story' },
  { q: 'The forest kept its secrets. It kept the wreckage too.', by: 'Night Ace: The Untold Story', only: 'crash' },
  { q: 'The trees, as ever, did not move.', by: 'Night Ace: The Untold Story', only: 'crash' },
  { q: 'Investigators found the button clearly labelled. It had been pressed anyway.', by: 'Night Ace: The Untold Story', only: 'red' },
  { q: 'The manual gave the red button a whole page. The page said: don\'t.', by: 'Night Ace: The Untold Story', only: 'red' },
  { q: 'The night was won. The ground crew had been saving those fireworks since sunset.', by: 'Night Ace: The Untold Story', only: 'won' },
  { q: 'The flak came up from the forest like sparks from a campfire. One spark was enough.', by: 'Night Ace: The Untold Story', only: 'shot' },
];

const SETS = { war: ['WAR BOOKS', WAR], pilot: ['PILOT SAYINGS', PILOT], doc: ['DOCUMENTARY', DOC] };
const ORDER = ['war', 'pilot', 'doc', 'mix'];
let last = null;

export const quotes = {
  order: ORDER,
  label: (set) => (set === 'mix' ? 'MIX' : SETS[set][0]),
  next: (set) => ORDER[(ORDER.indexOf(set) + 1) % ORDER.length],
  // reason: 'crash' | 'shot' | 'red' | 'won'. Never the same quote twice in a row.
  pick(set, reason) {
    const pool = (set === 'mix' ? [...WAR, ...PILOT, ...DOC] : SETS[set][1])
      .filter((x) => !x.only || x.only === reason);
    const options = pool.length > 1 ? pool.filter((x) => x !== last) : pool;
    last = options[Math.floor(Math.random() * options.length)];
    return last;
  },
};
