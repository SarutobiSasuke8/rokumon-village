"use strict";
// A simple greedy player that uses only the game's own rule functions.
// Every simulated second it spends on whatever it can afford, preferring
// prosperity buildings, then the cheapest raising or upgrade.

const PRIORITY = { training: 0, forge: 0, shrine: 1, store: 1, hut: 1, tower: 2 };
const FOCUS_CYCLE = ["wood", "stone", "wood", "food", "wood", "stone", "food", "wood"];

function costSum(c) {
  return (c.wood || 0) + (c.stone || 0) + (c.food || 0) + (c.ink || 0);
}

function checkValues(R, s) {
  const bad = [];
  const nums = { run: s.run, lifetime: s.lifetime, bestRun: s.bestRun, starIron: s.starIron, moonLacquer: s.moonLacquer };
  for (const k of R.RES) nums["res." + k] = s.res[k];
  const caps = R.caps(s);
  for (const [k, v] of Object.entries(nums)) {
    if (!Number.isFinite(v) || v < 0) bad.push(k + "=" + v);
  }
  for (const k of R.RES) if (s.res[k] > caps[k] + 1e-6) bad.push("res." + k + " over cap");
  const r = R.rates(s);
  for (const [k, v] of Object.entries(r)) if (!Number.isFinite(v) || v < 0) bad.push("rate." + k + "=" + v);
  return bad;
}

function candidates(R, s) {
  const out = [];
  for (const i of R.PLOT_ORDER) {
    if (!R.plotOpen(s, i)) continue;
    const b = s.grid[i];
    if (!b) {
      for (const type of R.ORDER) {
        if (R.placeCheck(s, i, type) === null) out.push({ kind: "place", i, type, cost: costSum(R.BUILDINGS[type].costs[0]) });
      }
    } else if (R.upgradeCheck(s, i) === null) {
      out.push({ kind: "upgrade", i, cost: costSum(R.BUILDINGS[b.type].costs[b.level]) });
    }
  }
  // one place per type is enough to rank: keep the first open plot for each
  const seen = new Set();
  return out.filter((c) => {
    if (c.kind !== "place") return true;
    if (seen.has(c.type)) return false;
    seen.add(c.type);
    return true;
  });
}

/**
 * Play from `start` for up to `limitS` seconds.
 * options.foundAt: found a new settlement as soon as run >= this (null = never).
 * options.stopWhenComplete: stop once every building is placed at max count and max level.
 */
function play(R, start, options = {}) {
  const limitS = options.limitS ?? 6 * 3600;
  const rng = options.rng || (() => 0.5);
  let s = start;
  let t = 0;
  let lastAction = 0;
  let hutN = 0;
  const report = {
    tierAt: { [R.TIERS[0].name]: 0 },
    firstPlaced: {},
    maxedAt: null,
    foundings: [],
    actions: 0,
    longestWait: 0,
    longestWaitFirst10Min: 0,
    deadEnd: null,
    bad: []
  };
  const note = () => {
    const w = t - lastAction;
    if (w > report.longestWait) report.longestWait = w;
    if (t <= 600 && w > report.longestWaitFirst10Min) report.longestWaitFirst10Min = w;
    lastAction = t;
    report.actions++;
  };
  function complete() {
    return R.ORDER.every((type) => {
      const def = R.BUILDINGS[type];
      const list = s.grid.filter((b) => b && b.type === type);
      return list.length === def.max && list.every((b) => b.level === def.maxLevel);
    });
  }
  while (t < limitS) {
    s = R.advance(s, 1, 1);
    t += 1;
    const sync = R.syncTier(s);
    s = sync.state;
    for (const ti of sync.reached) {
      const name = R.TIERS[ti].name;
      if (report.tierAt[name] == null) report.tierAt[name] = t;
    }
    if (options.foundAt != null && s.run >= options.foundAt) {
      const f = R.found(s, rng);
      s = f.state;
      report.foundings.push({ t, runProsperity: f.runProsperity, tier: f.tier });
      note();
      if (options.maxFoundings && report.foundings.length >= options.maxFoundings) break;
      continue;
    }
    for (let guard = 0; guard < 50; guard++) {
      const list = candidates(R, s);
      if (!list.length) break;
      list.sort((a, b) => (a.kind === "place" ? PRIORITY[a.type] : 3) - (b.kind === "place" ? PRIORITY[b.type] : 3) || a.cost - b.cost);
      const c = list[0];
      if (c.kind === "place") {
        const r = R.place(s, c.i, c.type);
        s = r.state;
        if (report.firstPlaced[c.type] == null) report.firstPlaced[c.type] = t;
        if (c.type === "hut") s = R.setFocus(s, c.i, FOCUS_CYCLE[hutN++ % FOCUS_CYCLE.length]).state;
      } else {
        s = R.upgrade(s, c.i).state;
      }
      note();
    }
    if (t % 10 === 0) {
      const bad = checkValues(R, s);
      if (bad.length && report.bad.length < 5) report.bad.push({ t, bad });
    }
    if (options.stopWhenComplete && complete()) { report.maxedAt = t; break; }
  }
  if (!report.maxedAt && complete()) report.maxedAt = t;
  // A dead end: something not yet complete whose next cost exceeds the best cap reachable.
  report.finalRun = s.run;
  report.lifetime = s.lifetime;
  report.seconds = t;
  report.state = s;
  return report;
}

module.exports = { play, checkValues, candidates };
