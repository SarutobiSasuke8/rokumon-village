# Rokumon Village

A small incremental settlement builder for the Rokumon catalogue. You keep a clan camp on a cedar slope, raise a handful of buildings, and, when the settlement is prosperous enough, found the next one. The whole game is `index.html`: no build step, no server, no external images, fonts or scripts, and no network requests.

Everything else in this repository (`package.json`, `test/`, `.github/`) is dev-only tooling for the checks. None of it is needed to play.

## How to play

1. The camp fire already gathers **wood**, **stone**, **food**, and a thread of **spirit-ink**.
2. Choose open ground on the board, then raise a building. Gatherer huts can be focused on timber, stone, or food.
3. Stores fill up to a cap. Storehouses raise the cap. Watchtowers make adjacent huts and shrines work harder.
4. **Clan prosperity** ticks upward. That lifetime total is the score.
5. At 160 prosperity on the current slope you may **found a new settlement**. The slope resets. A clan seal remains and makes every later settlement faster.
6. Close the tab whenever you like. On return, the game applies up to eight hours of offline progress and shows a short summary.

The first hut can be raised immediately. With steady building, founding opens in about one to two minutes of play; a simulated greedy player gets there in 60 seconds. Raising every building to its limit takes a greedy player about 23 minutes.

### Controls

- **Mouse or touch:** tap a plot to choose it, then tap a building or an upgrade in the panel.
- **Keyboard:** Tab moves between areas. The board is one tab stop: arrow keys move between plots, Home and End jump along a terrace, Enter or Space chooses a plot. After raising or upgrading, focus stays on the next useful button. `?` opens the guide, Escape closes dialogs.
- Builds, upgrades, new tiers, arrivals and offline summaries are announced to screen readers through a polite live region. Ticking numbers are not announced.
- `prefers-reduced-motion` turns off the flame and build animations.

## Resources

| Resource | Role |
| --- | --- |
| Wood | Main building material. Camp and timber-focused huts. |
| Stone | Storehouses, towers, the forge. |
| Food | Training is stronger while food stores are at least half full. |
| Spirit-ink | Shrines draw it. Training, towers, and the forge spend it to be raised. |
| Star-iron | Rare. Not gathered here. Tempered at the forge annex. |
| Moon-lacquer | Rare. Not gathered here. Offered at a shrine. |

Basic resources reset when you found a new settlement. Star-iron, moon-lacquer, tempers, and lacquer offerings do not.

Production pauses at the storage cap. Prosperity does not have a cap.

## Buildings

Plots open as the current settlement's prosperity crosses each tier. Higher terraces stay misted until then.

| Building | Limit | Opens | What it does |
| --- | --- | --- | --- |
| Gatherer Hut | 8, level 5 | Camp | Focus: timber, stone, or food. A small side trickle of the other two. Focus can be changed for free. |
| Storehouse | 3, level 5 | Camp | Raises wood, stone, food, and ink caps. Does not gather. |
| Training Grounds | 2, level 5 | Hamlet (40) | The main prosperity engine. Full strength at half food stores; 45% strength if food is empty. |
| Watchtower | 3, level 4 | Village (160) | Adds output to gatherer huts and shrines on the four adjacent plots. Bonuses add, and cap at +100%. |
| Shrine | 2, level 5 | Village (160) | Draws spirit-ink. A small prosperity rite. Each shrine level adds 2.5% to all prosperity. Moon-lacquer is offered here. |
| Forge Annex | 1, level 5 | Hold (700) | A side hall of the Rokumon forge. Adds prosperity. Star-iron is tempered here. |

Raising a building, and each upgrade, adds a one-off prosperity grant (14 for a new building, 8 + 6 x level for an upgrade). Each grant is paid at most once per building slot and level in a settlement, so clearing a plot and raising it again does not pay twice.

Clearing a plot returns half the cost of the first raising. If the stores cannot hold it (for example after clearing a storehouse), the excess is lost and the toast says so.

### Tiers

| Tier | Prosperity on this settlement | Open plots |
| --- | --- | --- |
| Camp | 0 | 8 |
| Hamlet | 40 | 12 |
| Village | 160 | 16 |
| Hold | 700 | 20 |
| Seat | 2,200 | 20 |

Tiers are per settlement. They reset when you found again. The Seat is a milestone only: it opens no new plots or buildings. The furthest tier you have ever reached is remembered as a record.

## Prestige

**Found a new settlement** is available once this settlement's prosperity reaches 160 (the Village tier).

Kept:

- Clan prosperity (the score)
- Clan seals: +15% to all yields and prosperity per seal
- Storage: +8% caps per seal
- A slightly richer starting camp: more wood, stone, food, and ink per seal
- Star-iron, moon-lacquer, tempers (+4% yields each, max 12), lacquer offerings (+12% ink each, max 8)
- Highest tier reached, best settlement, sound setting

Lost:

- Every building
- Wood, stone, food, and ink (replaced by the new camp's starting stores)
- This settlement's prosperity, tier progress and raising grants

You can stay past 160 and climb toward the Hold and the forge. Each founding picks a new slope name (Cedar Fold, Lantern Spur, Ink Terrace, and so on).

## Time and offline progress

- While the page is visible, progress follows real elapsed time (frame time), so a slow or fast frame rate gives the same result.
- When the page was closed, hidden, or frozen for more than a second, the game simulates the gap from the saved timestamp in one-second steps, so caps and the training food bonus stay honest.
- Offline progress is capped at **eight hours**. Longer absences count as eight hours and the summary says so.
- A summary is shown for gaps of 15 seconds or more. Shorter gaps are applied silently.
- If the device clock reads earlier than the last save (the clock was moved back), nothing is granted and the saved time is kept. Moving the clock forward again pays nothing until real time passes the saved time, so the clock cannot be used to collect the eight hours repeatedly.

## Score

**Clan prosperity** is the only score. It is the lifetime total, so founding a new settlement does not wipe the leaderboard number. The current settlement's prosperity is a separate meter used for tiers and founding. The game reports `Math.floor(clan prosperity)`.

## Save

- `localStorage` key `rokumon-village-v1`. The data inside carries `"version": 2`; version 1 saves from the first release load and are upgraded.
- What is saved: settlement name and number, stores, buildings (type, level, hut focus), raising grants claimed, prosperity (this settlement, lifetime, best), seals, tiers, rare goods, tempers, offerings, recently applied grant ids, guide seen, sound on or off, selected plot, and the last-save timestamp.
- The game saves after every action, every two seconds, and when the tab hides or closes.
- Every load is validated. Numbers are clamped to finite ranges the game can produce, unknown building types and buildings on misted plots or above their limits are dropped, and stores are clamped to the caps.
- The previous good save is kept under `rokumon-village-v1-bak`. If the main save cannot be read, the backup is used; if neither can be read, a new camp starts. An unreadable save is copied to `rokumon-village-v1-unreadable` rather than deleted, and a toast explains what happened.

## Hub bridge

The bridge is optional. If the host page installs `window.Hub`, the game calls it; if it is missing or a call throws, the game carries on.

| Call | When |
| --- | --- |
| `Hub.ready()` | Once the village is interactive (retried once after 600 ms in case the bridge attaches late). |
| `Hub.score(n)` | On load, and every 2.5 seconds when the integer score has changed. |
| `Hub.event('tier-reached', { tier, name })` | Each time this settlement crosses a tier, once per tier, in order (also for tiers crossed offline). |
| `Hub.event('settlement-founded', { seals, runProsperity, lifetime, tier })` | When you found a new settlement. |
| `Hub.event('star-iron-tempered', { tempers })` | When star-iron is tempered. |
| `Hub.event('moon-lacquer-offered', { offerings })` | When moon-lacquer is offered. |
| `Hub.gameOver(score, 0)` | When you found a new settlement. `score` is the clan prosperity total. The village keeps running into the next settlement; this is the completed-run report, not a hard stop. |

## Cross-game rares

Star-iron and moon-lacquer are the hooks for the rest of Rokumon. This game never mints them. Other games, or the hub, deliver them. They survive founding.

- **1 star-iron** at a standing **forge annex** tempers the clan edge: **+4%** all yields and prosperity, forever, up to 12 tempers.
- **1 moon-lacquer** at a standing **shrine** deepens the ink well: **+12%** ink, forever, up to 8 offerings.

The vault holds 99 of each. One delivery is clamped to 1 to 20 (a missing amount means 1). The last 200 delivery ids are remembered and repeats are ignored.

### 1. Shared localStorage

Same origin as the village (the hub, if every game is embedded there). Key: `rokumon-shared-goods`.

```json
{
  "pending": [
    { "id": "pinball-2026-11-10-1", "resource": "star-iron", "amount": 1, "source": "rokumon-pinball" }
  ]
}
```

`resource` is `"star-iron"` or `"moon-lacquer"` (camel-case `starIron` / `moonLacquer` is also accepted). Entries this game does not understand are left in the list. Known entries are removed even if the vault was already full, so a queue cannot jam. The village checks the list on load, whenever the tab becomes visible, and every four seconds.

### 2. postMessage

Accepted only from the parent frame that embeds the game, or from the game's own window. Messages from any other window are ignored.

```js
iframe.contentWindow.postMessage({
  type: "rokumon-grant",
  resource: "moon-lacquer",
  amount: 1,
  source: "rokumon-word",
  id: "word-2026-11-10"
}, targetOrigin);
```

### 3. Same-window calls

```js
window.dispatchEvent(new CustomEvent("rokumon-grant", {
  detail: { resource: "star-iron", amount: 1, source: "rokumon-pool", id: "pool-1" }
}));

window.RokumonVillage.grant({ resource: "star-iron", amount: 1, source: "hub" });
window.RokumonVillage.getScore();
```

## Audio

Short tones from the Web Audio API: a place, a raising, a founding, a tier. Nothing is downloaded. The audio context starts on the first tap or key press, and only while sound is on. The sound button remembers your choice; with sound off no tones are made.

## Catalogue

`game-hub-manifest.json` is the embedded release descriptor.

- Runtime: iframe, entry `/games/rokumon-village/index.html`
- One HTML file, no asset requests
- Mouse, touch and keyboard, one player, either orientation

## Code layout

`index.html` has two scripts:

- `<script id="village-rules">` defines `window.RokumonVillageRules`: the game's rules as deterministic functions. They take a state plus the elapsed time, the current time or a random source, and return a new state. They never touch the DOM, the clock or `Math.random`.
- `<script id="village-ui">` is the page: rendering, input, saving, audio and the hub bridge. It calls the rules for every change.

## Checks (dev only)

Needs Node 22 or later.

```sh
npm ci
npm test                          # rules, saves, simulated playthrough (node --test)
npx playwright install chromium   # once
npm run smoke                     # headless Chromium plays the real page
```

- `npm test` loads the rules block straight out of `index.html` and tests costs, production, unlocks, the seeded founding name, offline gain and its cap, clock rollback, the save round trip, corrupt and tampered saves, and a greedy simulated playthrough that must reach every tier and raise every building to its limit with no negative, NaN or infinite value.
- `npm run smoke` opens `index.html` in headless Chromium with a fake clock and plays the opening with real clicks (desktop) and taps (390 x 844 phone) to the first founding. It checks for console errors and network requests, horizontal scroll and tap target sizes on the phone, reload, capped offline gain, clock rollback, malformed and tampered saves, backup recovery, double clicks, keyboard navigation and focus, an axe-core accessibility scan, reduced motion, sound off, and grants.
- `.github/workflows/checks.yml` runs both on every pull request.

## Known limits

- Balance has only been checked by simulation, not by people. Founding opens very quickly (about a minute) and a full slope is done in about 23 minutes; the long game is prestige multipliers only.
- The save lives in this browser's `localStorage`. Anyone can edit it; validation keeps it finite and inside game limits but cannot stop a player granting themselves a large score.
- If the device clock was once set far in the future and then corrected, offline progress pauses until real time catches up with the saved time (live play is unaffected). Saved times more than ten years ahead are discarded.
- Tested in headless Chromium only. Not yet tested on physical phones, Safari or Firefox, or with a real screen reader.
- No art beyond inline SVG and no music.
