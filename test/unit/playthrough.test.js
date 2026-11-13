"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRules, seeded } = require("../helpers/load-rules");
const { play } = require("../helpers/greedy");

const R = loadRules();
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);

test("a greedy player reaches every tier and raises every building to its limit", (t) => {
  const rep = play(R, R.freshState(NOW), { limitS: 6 * 3600, stopWhenComplete: true });
  for (const t of R.TIERS) assert.notEqual(rep.tierAt[t.name], undefined, "tier " + t.name + " reached");
  for (const type of R.ORDER) assert.notEqual(rep.firstPlaced[type], undefined, type + " placed");
  assert.ok(rep.maxedAt, "every building at max count and level (no dead end)");
  assert.deepEqual(rep.bad, [], "no negative, NaN, Infinity or over-cap value at any check");
  assert.ok(rep.longestWaitFirst10Min <= 60, "no wait over a minute in the first ten minutes (was " + rep.longestWaitFirst10Min + "s)");
  assert.ok(rep.tierAt.Village <= 600, "founding is open within ten minutes");
  t.diagnostic(JSON.stringify({ tierAt: rep.tierAt, firstPlaced: rep.firstPlaced, maxedAt: rep.maxedAt, longestWaitFirst10Min: rep.longestWaitFirst10Min, longestWait: rep.longestWait }));
});

test("founding at every opportunity keeps getting faster and never breaks the state", (t) => {
  const rep = play(R, R.freshState(NOW), { limitS: 3 * 3600, foundAt: R.PRESTIGE_AT, maxFoundings: 6, rng: seeded(3) });
  assert.equal(rep.foundings.length, 6);
  const gaps = rep.foundings.map((f, i) => f.t - (i ? rep.foundings[i - 1].t : 0));
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] <= gaps[0], "settlement " + (i + 1) + " is not slower than the first");
  assert.deepEqual(rep.bad, []);
  assert.equal(rep.state.seals, 6);
  assert.ok(rep.state.lifetime >= 6 * R.PRESTIGE_AT);
  t.diagnostic("seconds per settlement: " + gaps.join(", "));
});

test("a player who never builds still progresses on the camp alone", () => {
  const s = R.advance(R.freshState(NOW), 600, 1);
  assert.ok(s.run >= R.TIERS[1].need, "Hamlet within ten minutes from the camp fire");
  for (const k of R.RES) assert.ok(s.res[k] > 0);
});

test("a long offline stretch after a full slope stays finite", () => {
  const rep = play(R, R.freshState(NOW), { limitS: 6 * 3600, stopWhenComplete: true });
  let s = R.touch(rep.state, NOW);
  for (let k = 0; k < 100; k++) s = R.offline(s, s.lastTick + 8 * 3600 * 1000).state;
  assert.ok(Number.isFinite(s.lifetime) && s.lifetime > 0);
  assert.ok(s.lifetime <= 1e15);
});
