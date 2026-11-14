// Deterministic random numbers, so a screenshot seed replays the same yard.
// mulberry32: small, fast, and good enough for bot jitter and spread rolls.
export function mulberry32(initial) {
  let a = initial >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one entry from a list with a seeded roll.
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}
