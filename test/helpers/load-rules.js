"use strict";
// Loads the rules block straight out of index.html into a fresh VM context,
// so the game stays a single file and the tests exercise the shipped code.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX = path.join(__dirname, "..", "..", "index.html");

function rulesSource() {
  const html = fs.readFileSync(INDEX, "utf8");
  const m = html.match(/<script id="village-rules">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('index.html has no <script id="village-rules"> block');
  return m[1];
}

function loadRules() {
  // compileFunction runs in this realm, so objects the rules return compare
  // cleanly with assert.deepStrictEqual. The block sees its own globalThis.
  const sandbox = {};
  const fn = vm.compileFunction(rulesSource(), ['globalThis'], { filename: 'index.html#village-rules' });
  fn.call(sandbox, sandbox);
  if (!sandbox.RokumonVillageRules) throw new Error('rules block did not define RokumonVillageRules');
  return sandbox.RokumonVillageRules;
}

// Small seeded random source (mulberry32) for deterministic tests.
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { loadRules, seeded, INDEX };
