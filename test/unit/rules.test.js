"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRules, seeded } = require("../helpers/load-rules");

const R = loadRules();
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const HOUR = 3600 * 1000;

function fresh() { return R.freshState(NOW); }
function withRes(s, res) { const n = R.clone(s); Object.assign(n.res, res); return n; }
function at(s, fields) { const n = R.clone(s); Object.assign(n, fields); return n; }
function near(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)); }

test("rules are exposed from index.html and frozen", () => {
  assert.equal(typeof R.advance, "function");
  assert.ok(Object.isFrozen(R));
  assert.equal(R.SAVE_VERSION, 2);
});

test.describe("costs and spending", () => {
  test("placing a hut costs exactly its first cost and grants prosperity once", () => {
    const s = fresh();
    const r = R.place(s, 17, "hut");
    assert.equal(r.ok, true);
    assert.equal(r.state.res.wood, s.res.wood - 14);
    assert.equal(r.state.grid[17].type, "hut");
    assert.equal(r.granted, R.PLACE_GRANT);
    assert.equal(r.state.run, s.run + R.PLACE_GRANT);
    assert.equal(s.grid[17], null, "input state is not changed");
  });

  test("unaffordable actions are refused and leave the state untouched", () => {
    const s = withRes(fresh(), { wood: 13 });
    const r = R.place(s, 17, "hut");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "cost");
    assert.equal(r.state, s);
    assert.deepEqual(R.shortfall(s, { wood: 14 }), { wood: 1 });
  });

  test("upgrade pays the next level cost; maxed buildings refuse", () => {
    let s = withRes(R.place(fresh(), 17, "hut").state, { wood: 70, stone: 50, food: 55, ink: 20 });
    const r = R.upgrade(s, 17);
    assert.equal(r.ok, true);
    assert.equal(r.state.res.wood, 70 - 30);
    assert.equal(r.state.res.stone, 50 - 14);
    assert.equal(r.level, 2);
    assert.equal(r.granted, R.upgradeGrant(2));
    s = R.clone(r.state);
    s.grid[17].level = 5;
    assert.equal(R.upgrade(s, 17).reason, "maxed");
    assert.equal(R.upgrade(s, 16).reason, "empty");
  });

  test("place is refused on occupied, locked, or out-of-range plots and for unknown types", () => {
    const s = R.place(fresh(), 17, "hut").state;
    assert.equal(R.placeCheck(s, 17, "hut"), "occupied");
    assert.equal(R.placeCheck(s, 0, "hut"), "locked");
    assert.equal(R.placeCheck(s, 20, "hut"), "bad-plot");
    assert.equal(R.placeCheck(s, 1.5, "hut"), "bad-plot");
    assert.equal(R.placeCheck(s, 16, "constructor"), "unknown-type");
    assert.equal(R.placeCheck(s, 16, "__proto__"), "unknown-type");
  });

  test("clearing returns half the first cost, capped by storage after the plot is gone", () => {
    let s = withRes(fresh(), { wood: 70, stone: 50 });
    s = R.place(s, 17, "store").state; // -22 wood, -16 stone
    const caps = R.caps(s);
    assert.equal(caps.wood, 70 + 90);
    s = withRes(s, { wood: 150, stone: 30 });
    const r = R.clearPlot(s, 17);
    assert.equal(r.ok, true);
    assert.equal(r.state.grid[17], null);
    assert.equal(r.state.res.wood, 70, "wood above the base cap spills");
    assert.equal(r.state.res.stone, 30 + 8);
    assert.equal(r.lost, true);
  });

  test("place and clear cannot be cycled to farm prosperity", () => {
    // Raising grants are paid at most once per building slot (8 huts) per settlement:
    // cycling one plot earns no more than raising all eight huts would.
    let s = withRes(fresh(), { wood: 70 });
    const run0 = s.run;
    for (let k = 0; k < 30; k++) {
      s = withRes(s, { wood: 70 });
      s = R.place(s, 17, "hut").state;
      s = R.clearPlot(s, 17).state;
    }
    assert.equal(s.run, run0 + R.BUILDINGS.hut.max * R.PLACE_GRANT);
    s = withRes(s, { wood: 70 });
    assert.equal(R.place(s, 17, "hut").granted, 0);
  });

  test("upgrade grants are bounded per level in a settlement", () => {
    let s = at(fresh(), { run: 40 });
    let paid = 0;
    for (let k = 0; k < 6; k++) {
      s = withRes(s, { wood: 70, stone: 50, food: 55, ink: 20 });
      s = R.place(s, 17, "training").state;
      s = withRes(s, { wood: 70, stone: 50, food: 55, ink: 20 });
      const r = R.upgrade(s, 17);
      paid += r.granted;
      s = R.clearPlot(r.state, 17).state;
    }
    assert.equal(paid, R.BUILDINGS.training.max * R.upgradeGrant(2));
  });
});

test.describe("unlock conditions", () => {
  test("tiers open plots and building types at the documented prosperity", () => {
    assert.deepEqual(R.TIERS.map((t) => t.need), [0, 40, 160, 700, 2200]);
    const camp = fresh();
    assert.equal(R.PLOT_ORDER.filter((i) => R.plotOpen(camp, i)).length, 8);
    assert.equal(R.placeCheck(withRes(camp, { wood: 70, food: 55, ink: 20 }), 16, "training"), "tier");
    const hamlet = withRes(at(camp, { run: 40 }), { wood: 70, food: 55, ink: 20, stone: 50 });
    assert.equal(R.PLOT_ORDER.filter((i) => R.plotOpen(hamlet, i)).length, 12);
    assert.equal(R.placeCheck(hamlet, 16, "training"), null);
    assert.equal(R.placeCheck(hamlet, 16, "tower"), "tier");
    const village = at(hamlet, { run: 160 });
    assert.equal(R.placeCheck(village, 16, "tower"), null);
    assert.equal(R.placeCheck(village, 16, "shrine"), null);
    assert.equal(R.placeCheck(village, 16, "forge"), "tier");
    const hold = R.clone(at(village, { run: 700 }));
    hold.res = { wood: 100, stone: 100, food: 0, ink: 28 };
    assert.equal(R.PLOT_ORDER.filter((i) => R.plotOpen(hold, i)).length, 20);
    // forge needs 28 ink and 100 wood: base caps hold 20 ink and 70 wood, so a storehouse is required
    assert.equal(R.placeCheck(hold, 16, "forge"), null);
  });

  test("building limits are enforced", () => {
    let s = at(fresh(), { run: 40 });
    for (const i of R.PLOT_ORDER.slice(0, 12)) {
      s = withRes(s, { wood: 70, stone: 50, food: 55, ink: 20 });
      if (R.countType(s, "training") < 2) s = R.place(s, i, "training").state;
    }
    assert.equal(R.countType(s, "training"), 2);
    const open = R.PLOT_ORDER.find((i) => R.plotOpen(s, i) && !s.grid[i]);
    assert.equal(R.placeCheck(withRes(s, { wood: 70, food: 55, ink: 20 }), open, "training"), "max");
  });

  test("syncTier reports every tier crossed, in order, once", () => {
    const s = at(fresh(), { run: 800 });
    const a = R.syncTier(s);
    assert.deepEqual(a.reached, [1, 2, 3]);
    assert.equal(a.state.knownTier, 3);
    assert.equal(a.state.highestTier, 3);
    assert.deepEqual(R.syncTier(a.state).reached, []);
  });

  test("the founding button opens at 160 prosperity on this settlement", () => {
    assert.equal(R.canFound(at(fresh(), { run: 159.99 })), false);
    assert.equal(R.canFound(at(fresh(), { run: 160 })), true);
    assert.equal(R.found(at(fresh(), { run: 10 }), Math.random).ok, false);
  });
});

test.describe("production", () => {
  test("a fresh camp produces the camp trickle only", () => {
    const r = R.rates(fresh());
    assert.ok(near(r.wood, 0.45) && near(r.stone, 0.28) && near(r.food, 0.32) && near(r.ink, 0.045) && near(r.prosperity, 0.32));
  });

  test("hut focus decides the main yield", () => {
    let s = R.place(fresh(), 17, "hut").state;
    assert.ok(near(R.rates(s).wood, 0.45 + 0.9));
    s = R.setFocus(s, 17, "stone").state;
    assert.ok(near(R.rates(s).stone, 0.28 + 0.9));
    assert.ok(near(R.rates(s).wood, 0.45 + 0.06));
    assert.equal(R.setFocus(s, 17, "ink").ok, false);
    assert.equal(R.setFocus(s, 16, "wood").ok, false);
  });

  test("watchtower aura boosts adjacent huts and is capped at +100%", () => {
    const s = at(fresh(), { run: 2200 });
    s.grid[12] = { type: "hut", level: 1, focus: "wood" };
    s.grid[7] = { type: "tower", level: 4, focus: "wood" };
    s.grid[11] = { type: "tower", level: 4, focus: "wood" };
    s.grid[13] = { type: "tower", level: 4, focus: "wood" };
    assert.equal(R.auraAt(s, 12), 1);
    assert.ok(near(R.buildingYield(s, 12, "hut", 1, "wood").wood, 0.9 * 2));
    assert.equal(R.auraAt(s, 0), 0);
  });

  test("training is weaker when food is below half the cap", () => {
    const s = at(fresh(), { run: 40 });
    s.grid[17] = { type: "training", level: 1, focus: "wood" };
    s.res.food = 0;
    assert.ok(near(R.buildingYield(s, 17, "training", 1).prosperity, 0.65 * 0.45));
    s.res.food = R.caps(s).food;
    assert.ok(near(R.buildingYield(s, 17, "training", 1).prosperity, 0.65));
  });

  test("seals, tempers and lacquer multiply as documented", () => {
    const s = at(fresh(), { seals: 2, tempers: 3, lacquerOffered: 1 });
    const m = R.multipliers(s);
    assert.ok(near(m.global, 1.3 * 1.12));
    assert.ok(near(m.ink, 1.3 * 1.12 * 1.12));
    assert.equal(R.caps(s).wood, Math.floor(70 * 1.16));
  });

  test("storage caps stop production; prosperity has no cap", () => {
    const s = R.advance(fresh(), 3600, 1);
    const c = R.caps(s);
    for (const k of R.RES) assert.equal(s.res[k], c[k]);
    assert.ok(near(s.run, 0.32 * 3600, 1e-6));
  });
});

test.describe("elapsed time", () => {
  test("progress depends on elapsed time, not on how it is sliced", () => {
    const s = fresh();
    const one = R.advance(s, 60, 1);
    const tenths = R.advance(s, 60, 0.1);
    let frames = s;
    for (let k = 0; k < 600; k++) frames = R.advance(frames, 0.1, 0.1);
    assert.ok(near(one.run, tenths.run, 1e-9));
    assert.ok(near(frames.run, one.run, 1e-9));
    for (const k of R.RES) assert.ok(near(frames.res[k], one.res[k], 1e-9), k);
  });

  test("advance ignores negative, NaN and infinite time", () => {
    const s = fresh();
    for (const v of [-5, NaN, Infinity, -Infinity, "x", undefined]) {
      assert.equal(R.advance(s, v, 1).run, 0, String(v));
    }
    assert.ok(near(R.advance(s, 1e9, 60).run, 0.32 * 8 * 3600, 1e-9), "one call is capped at eight hours");
  });
});

test.describe("offline progress", () => {
  test("an hour away gives the same result as an hour of play", () => {
    const s = R.place(fresh(), 17, "hut").state;
    const off = R.offline(s, NOW + HOUR);
    const live = R.advance(s, 3600, 1);
    assert.equal(off.simulatedMs, HOUR);
    assert.equal(off.limited, false);
    assert.ok(near(off.state.run, live.run, 1e-9));
    assert.equal(off.state.lastTick, NOW + HOUR);
  });

  test("offline gain is capped at eight hours", () => {
    const s = fresh();
    const ten = R.offline(s, NOW + 10 * HOUR);
    const eight = R.offline(s, NOW + 8 * HOUR);
    assert.equal(ten.simulatedMs, 8 * HOUR);
    assert.equal(ten.limited, true);
    assert.ok(near(ten.state.run, eight.state.run, 1e-9));
    assert.equal(ten.state.lastTick, NOW + 10 * HOUR);
  });

  test("moving the clock back gives nothing and keeps the saved time", () => {
    const s = fresh();
    const r = R.offline(s, NOW - 5 * HOUR);
    assert.equal(r.simulatedMs, 0);
    assert.equal(r.clockBack, true);
    assert.equal(r.state.lastTick, NOW);
    assert.equal(r.state.run, 0);
  });

  test("clock forward, back, forward again pays only once", () => {
    let s = fresh();
    const a = R.offline(s, NOW + 8 * HOUR); // jump forward
    s = a.state;
    const afterJump = s.run;
    s = R.offline(s, NOW).state; // clock back to real time
    s = R.touch(s, NOW); // live play saves at the real time
    assert.equal(s.lastTick, NOW + 8 * HOUR, "touch never moves the saved time back");
    const again = R.offline(s, NOW + 8 * HOUR); // jump forward again
    assert.equal(again.simulatedMs, 0);
    assert.equal(again.state.run, afterJump);
  });

  test("missing, ancient or absurd timestamps reset without a gain", () => {
    for (const lt of [0, 123, NaN, NOW + 50 * 365 * 24 * HOUR]) {
      const r = R.offline(at(fresh(), { lastTick: lt }), NOW);
      assert.equal(r.simulatedMs, 0);
      assert.equal(r.reset, true);
      assert.equal(r.state.lastTick, NOW);
    }
  });

  test("short gaps are simulated but flagged as below the notice threshold", () => {
    const r = R.offline(fresh(), NOW + 5000);
    assert.equal(r.simulatedMs, 5000);
    assert.ok(r.simulatedMs < R.AWAY_NOTICE_MS);
  });
});

test.describe("random events (seeded)", () => {
  test("founding picks a new slope name from the seeded source, never the current one", () => {
    const s = at(fresh(), { run: 300, lifetime: 300 });
    const a = R.found(s, seeded(42));
    const b = R.found(s, seeded(42));
    assert.equal(a.state.name, b.state.name);
    assert.notEqual(a.state.name, s.name);
    for (let seed = 1; seed < 200; seed++) assert.notEqual(R.found(s, seeded(seed)).state.name, s.name);
    for (const bad of [() => 1, () => NaN, () => -3, null]) {
      const n = R.found(s, bad).state.name;
      assert.ok(R.NAMES.includes(n) && n !== s.name);
    }
  });

  test("founding keeps the score and permanent goods and resets the slope", () => {
    let s = at(fresh(), { run: 300, lifetime: 900, starIron: 3, moonLacquer: 2, tempers: 1, lacquerOffered: 1 });
    s.grid[17] = { type: "hut", level: 3, focus: "stone" };
    const r = R.found(s, seeded(7));
    assert.equal(r.ok, true);
    assert.equal(r.runProsperity, 300);
    assert.equal(r.tier, 2);
    const n = r.state;
    assert.equal(n.seals, 1);
    assert.equal(n.settlement, 2);
    assert.equal(n.lifetime, 900);
    assert.equal(n.run, 0);
    assert.equal(n.knownTier, 0);
    assert.ok(n.grid.every((b) => b === null));
    assert.deepEqual([n.starIron, n.moonLacquer, n.tempers, n.lacquerOffered], [3, 2, 1, 1]);
    assert.deepEqual(n.res, { wood: 28, stone: 14, food: 18, ink: 3 });
    assert.equal(R.place(withRes(n, { wood: 70 }), 17, "hut").granted, R.PLACE_GRANT, "grants reset per settlement");
  });
});

test.describe("cross-game goods", () => {
  test("grants are clamped, capped at 99 and de-duplicated by id", () => {
    let s = fresh();
    let r = R.applyGrant(s, { resource: "star-iron", amount: 500, id: "a" });
    assert.equal(r.applied, 20);
    s = r.state;
    r = R.applyGrant(s, { resource: "starIron", amount: 1, id: "a" });
    assert.equal(r.duplicate, true);
    assert.equal(r.state, s);
    s = at(s, { starIron: 98 });
    r = R.applyGrant(s, { resource: "Star Iron", amount: 5, id: "b" });
    assert.equal(r.applied, 1);
    assert.equal(r.state.starIron, 99);
    assert.equal(R.applyGrant(s, { resource: "gold", amount: 1 }).error, "unknown-resource");
    assert.equal(R.applyGrant(s, { resource: "moon-lacquer", amount: -1 }).error, "bad-amount");
    assert.equal(R.applyGrant(s, { resource: "moon-lacquer", amount: "NaN" }).error, "bad-amount");
    assert.equal(R.applyGrant(s, { resource: "moon-lacquer" }).applied, 1, "missing amount means one");
    assert.equal(R.applyGrant(s, null).ok, false);
  });

  test("seen grant ids are bounded", () => {
    let s = fresh();
    for (let k = 0; k < R.SEEN_MAX + 30; k++) s = R.applyGrant(at(s, { starIron: 0 }), { resource: "star-iron", id: "g" + k }).state;
    assert.equal(s.seenGrants.length, R.SEEN_MAX);
  });

  test("tempering and offering need the building, a good, and room", () => {
    let s = at(fresh(), { run: 700, starIron: 1, moonLacquer: 1 });
    assert.equal(R.temper(s).reason, "no-forge");
    assert.equal(R.offer(s).reason, "no-shrine");
    s.grid[17] = { type: "forge", level: 1, focus: "wood" };
    s.grid[16] = { type: "shrine", level: 1, focus: "wood" };
    const t = R.temper(s);
    assert.equal(t.ok, true);
    assert.equal(t.state.tempers, 1);
    assert.equal(t.state.starIron, 0);
    assert.equal(R.temper(t.state).reason, "empty");
    assert.equal(R.temper(at(s, { tempers: 12 })).reason, "maxed");
    assert.equal(R.offer(s).state.lacquerOffered, 1);
    assert.equal(R.offer(at(s, { lacquerOffered: 8 })).reason, "maxed");
  });
});

test.describe("save round trip and validation", () => {
  test("a played state survives serialize and parse unchanged", () => {
    let s = withRes(fresh(), { wood: 70, stone: 50, food: 55, ink: 20 });
    s = R.place(s, 17, "hut").state;
    s = R.setFocus(s, 17, "food").state;
    s = R.syncTier(R.advance(s, 120, 1)).state;
    s = at(s, { starIron: 4, seenGrants: ["x", "y"], sawGuide: true, sound: false, selected: 16 });
    const back = R.parse(R.serialize(s), NOW);
    assert.equal(back.ok, true);
    assert.deepEqual(back.state, s);
  });

  test("corrupt saves are rejected, never thrown", () => {
    for (const raw of ["", "{oops", "null", "5", "[]", '"text"', "true", JSON.stringify({ version: 3 }), JSON.stringify({}), null, undefined, 42]) {
      const r = R.parse(raw, NOW);
      assert.equal(r.ok, false, String(raw));
      assert.equal(r.state, null);
    }
    assert.equal(R.parse("x".repeat(300000), NOW).ok, false);
  });

  test("tampered numbers are clamped to finite, sane ranges", () => {
    const raw = JSON.stringify({
      version: 2, run: 1e300, lifetime: "Infinity", bestRun: -4,
      res: { wood: 1e308, stone: -5, food: "NaN", ink: "12" },
      seals: 1e9, settlement: -3, tempers: 7.5, lacquerOffered: 99, starIron: 1e9, moonLacquer: -1,
      highestTier: 77, knownTier: -2, selected: 3.7, lastTick: "soon", sound: 0, sawGuide: "yes",
      seenGrants: [{ a: 1 }, "ok", 5]
    });
    const r = R.parse(raw, NOW);
    assert.equal(r.ok, true);
    const s = r.state;
    const c = R.caps(s);
    assert.equal(s.run, 1e15);
    assert.equal(s.lifetime, 1e15);
    assert.equal(s.bestRun, 1e15);
    assert.equal(s.res.wood, c.wood);
    assert.equal(s.res.stone, 0);
    assert.equal(s.res.food, 12, "invalid falls back to the starting stores");
    assert.equal(s.res.ink, 12);
    assert.equal(s.seals, 999);
    assert.equal(s.settlement, 1);
    assert.equal(s.tempers, 7);
    assert.equal(s.lacquerOffered, 8);
    assert.equal(s.starIron, 99);
    assert.equal(s.moonLacquer, 0);
    assert.equal(s.highestTier, 4);
    assert.equal(s.knownTier, 0);
    assert.equal(s.selected, 3);
    assert.equal(s.lastTick, NOW);
    assert.equal(s.sound, true);
    assert.equal(s.sawGuide, false);
    assert.deepEqual(s.seenGrants, ["ok", "5"]);
    const walk = (o) => Object.values(o).forEach((v) => {
      if (typeof v === "number") assert.ok(Number.isFinite(v) && v >= 0, String(v));
      else if (v && typeof v === "object") walk(v);
    });
    walk(s);
  });

  test("tampered buildings are dropped: unknown or prototype types, locked plots, over the limit", () => {
    const grid = new Array(20).fill(null);
    grid[17] = { type: "constructor", level: 3 };
    grid[16] = { type: "__proto__", level: 3 };
    grid[18] = { type: "toString", level: 1 };
    grid[15] = { type: "forge", level: 99 };
    grid[19] = { type: "hut", level: 99, focus: "gold" };
    grid[0] = { type: "hut", level: 1 }; // Summit plot, locked at Camp
    const r = R.parse(JSON.stringify({ version: 1, run: 0, grid }), NOW);
    assert.equal(r.ok, true);
    const s = r.state;
    assert.equal(s.grid[17], null);
    assert.equal(s.grid[16], null);
    assert.equal(s.grid[18], null);
    assert.equal(s.grid[15], null, "forge needs the Hold");
    assert.deepEqual(s.grid[19], { type: "hut", level: 5, focus: "wood" });
    assert.equal(s.grid[0], null);
    const many = R.parse(JSON.stringify({ version: 2, run: 5000, grid: new Array(20).fill({ type: "forge", level: 5 }) }), NOW).state;
    assert.equal(R.countType(many, "forge"), 1);
  });

  test("version 1 saves migrate and rebuild the claimed raising grants", () => {
    const grid = new Array(20).fill(null);
    grid[17] = { type: "hut", level: 3, focus: "stone" };
    grid[16] = { type: "hut", level: 1, focus: "wood" };
    const r = R.parse(JSON.stringify({ version: 1, run: 50, lifetime: 50, grid, res: { wood: 10 } }), NOW);
    assert.equal(r.ok, true);
    assert.equal(r.migrated, true);
    assert.deepEqual(r.state.raised.hut, [2, 1, 1, 0, 0]);
    assert.equal(r.state.version, 2);
  });

  test("a saved timestamp slightly in the future is kept (clock moved back)", () => {
    const s = R.parse(JSON.stringify({ version: 2, lastTick: NOW + HOUR }), NOW).state;
    assert.equal(s.lastTick, NOW + HOUR);
  });
});
