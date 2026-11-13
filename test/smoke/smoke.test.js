"use strict";
// Browser smoke test: loads index.html in headless Chromium and plays it with
// real clicks, taps and keys. The page clock is faked so time can be moved.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const INDEX = path.join(__dirname, "..", "..", "index.html");
const URL = pathToFileURL(INDEX).href;
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const KEY = "rokumon-village-v1";
const T0 = Date.UTC(2026, 10, 13, 12, 0, 0);
const HOUR = 3600 * 1000;

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); });

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESKTOP = { viewport: { width: 1280, height: 800 } };

/** Open the game. seed: {main, bak, shared} raw localStorage strings written before the first script runs. */
async function open(t, opts = {}) {
  const context = await browser.newContext({ ...(opts.device || DESKTOP), reducedMotion: opts.reducedMotion || "no-preference" });
  const page = await context.newPage();
  const problems = [];
  const requests = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(m.type() + ": " + m.text()); });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.clock.install({ time: opts.time ?? T0 });
  await page.addInitScript((seed) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    if (seed.main != null) localStorage.setItem("rokumon-village-v1", seed.main);
    if (seed.bak != null) localStorage.setItem("rokumon-village-v1-bak", seed.bak);
    if (seed.shared != null) localStorage.setItem("rokumon-shared-goods", seed.shared);
  }, opts.seed || {});
  if (opts.hub) {
    await page.addInitScript(() => {
      window.__hub = [];
      window.Hub = {
        ready: () => window.__hub.push(["ready"]),
        score: (n) => window.__hub.push(["score", n]),
        event: (name, props) => window.__hub.push(["event", name, props]),
        gameOver: (score, x) => window.__hub.push(["gameOver", score, x])
      };
    });
  }
  if (opts.audioSpy) {
    await page.addInitScript(() => {
      window.__tones = 0;
      const AC = window.AudioContext;
      if (!AC) return;
      const orig = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function () { window.__tones++; return orig.call(this); };
    });
  }
  await page.goto(URL);
  t.after(async () => { await context.close(); });
  return { page, context, problems, requests };
}

async function saved(page) { return page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY); }
async function closeGuide(page, tap) {
  if (tap) await page.tap("[data-action='guide-close']");
  else await page.click("[data-action='guide-close']");
  await page.waitForSelector("#modal", { state: "hidden" });
}
async function press(page, selector, tap) { if (tap) await page.tap(selector); else await page.click(selector); }
function saveWith(fields) {
  const grid = new Array(20).fill(null);
  return JSON.stringify(Object.assign({ version: 2, sawGuide: true, lastTick: T0, grid, res: { wood: 18, stone: 8, food: 12, ink: 2 } }, fields));
}

/** Play the opening with real input until founding is open. Returns the seconds of game time it took. */
async function playOpening(page, tap) {
  let seconds = 0;
  for (let round = 0; round < 120; round++) {
    const tier = await page.textContent("#tier-name");
    if (!(await page.isDisabled("#found-btn"))) return { seconds, tier };
    // try to raise on each open plot, preferring training grounds, then huts, then a storehouse
    const open = await page.$$eval(".plot.open", (els) => els.map((e) => e.dataset.index));
    let acted = false;
    for (const i of open.slice(0, 3)) {
      await press(page, `.plot[data-index="${i}"]`, tap);
      for (const type of ["training", "hut", "store"]) {
        const sel = `#sheet [data-action="place"][data-type="${type}"]`;
        if (await page.isEnabled(sel)) { await press(page, sel, tap); acted = true; break; }
      }
      if (acted) break;
    }
    if (!acted) { await page.clock.runFor(5000); seconds += 5; }
  }
  throw new Error("founding never opened");
}

test("desktop: opening with real clicks reaches the first unlocks and a founding", async (t) => {
  const { page, problems, requests } = await open(t, { hub: true });
  assert.equal(await page.isVisible("#modal .modal-card[role='dialog']"), true, "guide opens on first visit");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), "guide-close", "guide focuses its button");
  await closeGuide(page);
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains("plot")), true, "focus lands on the board after the guide");

  await page.click('.plot[data-index="17"]');
  await page.click('#sheet [data-action="place"][data-type="hut"]');
  assert.match(await page.textContent("#toasts"), /Gatherer Hut raised/);
  assert.equal(await page.textContent("#sheet h2"), "Gatherer Hut level 1 of 5");
  await page.click('#sheet [data-action="focus"][data-focus="stone"]');
  assert.equal(await page.getAttribute('#sheet [data-focus="stone"]', "aria-pressed"), "true");

  const { seconds } = await playOpening(page, false);
  t.diagnostic("founding opened after " + seconds + "s of game time");
  assert.ok(seconds <= 600, "founding within ten minutes of game time");
  assert.equal(await page.textContent("#tier-name"), "Village", "the Village tier is shown when founding opens");
  assert.equal(await page.textContent("#found-btn"), "Found a new settlement");

  await page.click("#found-btn");
  assert.match(await page.textContent("#modal h2"), /Leave this slope/);
  await page.click("[data-action='prestige-confirm']");
  await page.waitForSelector("#modal", { state: "hidden" });
  const s = await saved(page);
  assert.equal(s.seals, 1);
  assert.equal(s.run, 0);
  assert.ok(s.grid.every((b) => b === null));
  assert.match(await page.textContent("#seal-line"), /Settlement 2 · 1 seal/);

  await page.clock.runFor(3000);
  const hub = await page.evaluate(() => window.__hub);
  const names = hub.map((h) => h[0] === "event" ? h[1] : h[0]);
  assert.ok(names.includes("ready"));
  assert.ok(names.includes("score"));
  assert.ok(names.includes("tier-reached"));
  assert.ok(names.includes("settlement-founded"));
  assert.ok(names.includes("gameOver"));
  const tiers = hub.filter((h) => h[1] === "tier-reached").map((h) => h[2].tier);
  assert.deepEqual(tiers.slice(0, 2), [1, 2], "tier events in order, once each");
  assert.deepEqual(problems, []);
  assert.ok(requests.every((u) => u.startsWith("file:") || u.startsWith("data:")), "no network requests: " + requests.filter((u) => !u.startsWith("file:")).join(" "));
});

test("phone: taps play the opening, no horizontal scroll, targets at least 24px", async (t) => {
  const { page, problems } = await open(t, { device: PHONE });
  await closeGuide(page, true);
  await page.tap('.plot[data-index="17"]');
  await page.tap('#sheet [data-action="place"][data-type="hut"]');
  const { seconds } = await playOpening(page, true);
  assert.ok(seconds <= 600);
  const layout = await page.evaluate(() => {
    const de = document.documentElement;
    const wide = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (el.closest("svg") || el.classList.contains("sr-only")) return;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > innerWidth + 0.5 || r.left < -0.5)) wide.push(el.id || el.className);
    });
    const small = [];
    document.querySelectorAll("button, summary, a[href], input, select").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && (r.width < 24 || r.height < 24)) small.push((el.id || el.className) + " " + r.width + "x" + r.height);
    });
    return { scroll: de.scrollWidth - de.clientWidth, wide, small };
  });
  assert.equal(layout.scroll, 0, "no horizontal scroll");
  assert.deepEqual(layout.wide, [], "nothing wider than the viewport");
  assert.deepEqual(layout.small, [], "no tap target under 24px");
  assert.deepEqual(problems, []);
});

test("phone: late-game numbers fit their cards", async (t) => {
  const grid = new Array(20).fill(null);
  [17, 16, 18].forEach((i) => { grid[i] = { type: "store", level: 5, focus: "wood" }; });
  const { page, problems } = await open(t, { device: PHONE, seed: { main: saveWith({ seals: 40, settlement: 41, run: 2600, lifetime: 987654321, grid, res: { wood: 9000, stone: 9000, food: 9000, ink: 9000 } }) } });
  const clipped = await page.evaluate(() => [...document.querySelectorAll(".res, .score, .status-copy")]
    .filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className + " " + el.scrollWidth + ">" + el.clientWidth));
  assert.deepEqual(clipped, []);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  assert.deepEqual(problems, []);
});

test("reload restores the village", async (t) => {
  const { page, problems } = await open(t);
  await closeGuide(page);
  await page.click('.plot[data-index="17"]');
  await page.click('#sheet [data-action="place"][data-type="hut"]');
  await page.click('#sheet [data-action="focus"][data-focus="food"]');
  await page.clock.runFor(4000);
  const before = await saved(page);
  await page.reload();
  const after = await saved(page);
  assert.deepEqual(after.grid[17], { type: "hut", level: 1, focus: "food" });
  assert.ok(after.lifetime >= before.lifetime);
  assert.equal(await page.isVisible("#modal .modal-card"), false, "no guide or away notice after a quick reload");
  assert.equal(await page.textContent('.plot[data-index="17"] .nm'), "Hut 1");
  assert.deepEqual(problems, []);
});

test("a fast-forwarded clock gives capped offline progress", async (t) => {
  const { page, problems } = await open(t, { seed: { main: saveWith({ lastTick: T0 - 30 * HOUR }) } });
  assert.equal(await page.isVisible("#modal .modal-card"), true);
  const text = await page.textContent("#modal");
  assert.match(text, /For 8h 0m/);
  assert.match(text, /Only eight hours count/);
  const s = await saved(page);
  // a bare camp makes 0.32 prosperity a second
  assert.ok(Math.abs(s.lifetime - 0.32 * 8 * 3600) < 5, "gain equals eight hours, got " + s.lifetime);
  await page.click("[data-action='modal-close']");

  // moving the page clock forward while it is open goes through the same cap
  const life0 = (await saved(page)).lifetime;
  await page.clock.fastForward(20 * HOUR);
  await page.clock.runFor(500);
  await page.waitForSelector("#modal .modal-card");
  assert.match(await page.textContent("#modal"), /For 8h 0m/);
  const life1 = (await saved(page)).lifetime;
  assert.ok(life1 - life0 <= 0.32 * 8 * 3600 + 5, "second jump is capped too");
  assert.deepEqual(problems, []);
});

test("a clock moved back gives nothing and does not reopen the offline exploit", async (t) => {
  const { page, problems } = await open(t, { seed: { main: saveWith({ lastTick: T0 + 5 * HOUR, lifetime: 100, run: 100 }) } });
  assert.equal(await page.isVisible("#modal .modal-card"), false);
  await page.clock.runFor(2500);
  const s = await saved(page);
  assert.ok(s.lifetime < 105, "only live seconds count, got " + s.lifetime);
  assert.equal(s.lastTick, T0 + 5 * HOUR, "saved time is not moved back");
  assert.deepEqual(problems, []);
});

test("malformed and tampered saves reset safely", async (t) => {
  const bad = await open(t, { seed: { main: "{oops" } });
  assert.match(await bad.page.textContent("#toasts"), /could not be read/);
  assert.equal(await bad.page.evaluate(() => localStorage.getItem("rokumon-village-v1-unreadable")), "{oops", "the unreadable save is kept aside");
  assert.equal((await saved(bad.page)).version, 2);
  assert.deepEqual(bad.problems, []);

  const grid = new Array(20).fill(null);
  grid[17] = { type: "constructor", level: 3 };
  grid[16] = { type: "forge", level: 99 };
  const tampered = await open(t, { seed: { main: saveWith({ selected: 17, grid, run: "1e999", res: { wood: 1e308, stone: -1, food: "x", ink: 5 }, starIron: 5000 }) } });
  await tampered.page.click('.plot[data-index="17"]');
  const s = await saved(tampered.page);
  assert.equal(s.grid[17], null);
  assert.equal(s.grid[16], null);
  assert.equal(s.starIron, 99);
  assert.ok(s.res.wood <= 70 && s.res.stone >= 0 && Number.isFinite(s.res.food));
  assert.equal(await tampered.page.textContent("#sheet h2"), "Raise a building");
  assert.deepEqual(tampered.problems, []);

  const good = saveWith({ lifetime: 777, run: 50 });
  const fallback = await open(t, { seed: { main: "[]", bak: good } });
  assert.match(await fallback.page.textContent("#toasts"), /restored from its backup/);
  assert.ok((await saved(fallback.page)).lifetime >= 777);
  assert.deepEqual(fallback.problems, []);
});

test("double-clicking a build spends once", async (t) => {
  const { page, problems } = await open(t, { seed: { main: saveWith({ selected: 17, res: { wood: 70, stone: 50, food: 55, ink: 20 } }) } });
  await page.dblclick('#sheet [data-action="place"][data-type="hut"]');
  const s = await saved(page);
  assert.deepEqual(s.grid[17], { type: "hut", level: 1, focus: "wood" });
  assert.ok(Math.abs(s.res.wood - 56) < 0.5, "one hut paid for, wood " + s.res.wood);
  assert.equal(s.res.stone >= 49.9, true, "no upgrade was bought");
  assert.deepEqual(problems, []);
});

test("keyboard: arrows move between plots, Enter builds, focus stays put and is visible", async (t) => {
  const { page, problems } = await open(t, { seed: { main: saveWith({ res: { wood: 70, stone: 50, food: 55, ink: 20 } }) } });
  await page.keyboard.press("Tab"); // sound
  await page.keyboard.press("Tab"); // guide
  await page.keyboard.press("Tab"); // found (disabled, skipped) -> board
  let active = await page.evaluate(() => document.activeElement.dataset.index);
  assert.equal(active, "17", "board is one tab stop and starts on the selected plot");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.index), "16");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.index), "16", "focus stays on the plot after choosing it");
  assert.equal(await page.getAttribute('.plot[data-index="16"]', "aria-current"), "true");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.type), "hut", "next tab stop is the first build");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), "upgrade", "focus moves to the new building's upgrade button");
  const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle + " " + cs.outlineColor + " " + cs.outlineWidth; });
  assert.equal(ring, "solid rgb(28, 25, 21) 3px", "dark focus ring on the light sheet");
  await page.keyboard.press("Enter");
  assert.equal((await saved(page)).grid[16].level, 2);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), "upgrade");
  await page.keyboard.press("Shift+?");
  assert.equal(await page.isVisible("#modal .modal-card"), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), "upgrade", "focus returns after closing the guide");
  assert.deepEqual(problems, []);
});

test("accessibility scan finds no serious issues (desktop and phone)", async (t) => {
  for (const device of [DESKTOP, PHONE]) {
    const grid = new Array(20).fill(null);
    grid[17] = { type: "hut", level: 2, focus: "wood" };
    grid[12] = { type: "tower", level: 1, focus: "wood" };
    const { page } = await open(t, { device, seed: { main: saveWith({ run: 200, lifetime: 200, knownTier: 2, highestTier: 2, grid, selected: 16, res: { wood: 10, stone: 4, food: 30, ink: 1 } }) } });
    await page.addScriptTag({ content: AXE });
    const run = () => page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }))
      .violations.filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id + ": " + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")));
    assert.deepEqual(await run(), [], "build list");
    await page.click('.plot[data-index="17"]');
    assert.deepEqual(await run(), [], "upgrade sheet");
    await page.click("#found-btn");
    assert.deepEqual(await run(), [], "founding dialog");
  }
});

test("reduced motion stops the animations", async (t) => {
  const { page } = await open(t, { reducedMotion: "reduce", seed: { main: saveWith({}) } });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".flame")).animationName), "none");
});

test("sound off means no tones; the bridge is optional; same-window grants arrive", async (t) => {
  const { page, problems } = await open(t, { audioSpy: true, seed: { main: saveWith({ sound: false, res: { wood: 70, stone: 50, food: 55, ink: 20 } }) } });
  assert.equal(await page.evaluate(() => typeof window.Hub), "undefined");
  await page.click('.plot[data-index="17"]');
  await page.click('#sheet [data-action="place"][data-type="hut"]');
  await page.click('#sheet [data-action="upgrade"]');
  assert.equal(await page.evaluate(() => window.__tones), 0);
  await page.evaluate(() => window.postMessage({ type: "rokumon-grant", resource: "star-iron", amount: 2, id: "smoke-1", source: "smoke" }, "*"));
  await page.clock.runFor(100);
  assert.equal((await saved(page)).starIron, 2);
  assert.equal(await page.evaluate(() => window.RokumonVillage.grant({ resource: "star-iron", id: "smoke-1" }).duplicate), true);
  assert.equal(await page.evaluate(() => window.RokumonVillage.getScore()) >= 0, true);
  assert.deepEqual(problems, []);
});
