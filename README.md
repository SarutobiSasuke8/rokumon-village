# Rokumon Village

A small incremental settlement builder for the Rokumon catalogue. You keep a clan camp on a cedar slope, raise a handful of buildings, and — when the settlement is prosperous enough — found the next one. The whole game is `index.html`. No build step, no server, no external images or fonts.

## Loop

1. The camp fire already gathers **wood**, **stone**, **food**, and a thread of **spirit-ink**.
2. Tap open ground, then raise a building. Gatherer huts can be focused on timber, stone, or food.
3. Stores fill up to a cap. Storehouses raise the cap. Watchtowers make adjacent huts and shrines work harder.
4. **Clan prosperity** ticks upward. That lifetime total is the score.
5. At 160 prosperity on the current slope you may **found a new settlement**. The slope resets. A clan seal remains and makes every later settlement faster.
6. Close the tab whenever you like. On return, the game applies up to eight hours of offline progress and shows a short summary.

The first hut can be raised immediately. A first founding is a few minutes of play if you build a training ground; pushing on to the forge takes longer, and is optional.

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

Plots open as the current settlement’s prosperity crosses each tier. Higher terraces stay misted until then.

| Building | Limit | Opens | What it does |
| --- | --- | --- | --- |
| Gatherer Hut | 8, level 5 | Camp | Focus: timber, stone, or food. A small side trickle of the other two. Focus can be changed for free. |
| Storehouse | 3, level 5 | Camp | Raises wood, stone, food, and ink caps. Does not gather. |
| Training Grounds | 2, level 5 | Hamlet (40) | The main prosperity engine. Full strength at half food stores; about 45% strength if food is empty. |
| Watchtower | 3, level 4 | Village (160) | Adds output to gatherer huts and shrines on the four adjacent plots. Bonuses add, and cap at +100%. |
| Shrine | 2, level 5 | Village (160) | Draws spirit-ink. A small prosperity rite. Moon-lacquer is offered here. |
| Forge Annex | 1, level 5 | Hold (700) | A side hall of the Rokumon forge. Adds prosperity. Star-iron is tempered here. |

Clearing a plot returns half the cost of the first raising, and only what the stores can hold.

### Tiers

| Tier | Prosperity on this settlement | Open plots |
| --- | --- | --- |
| Camp | 0 | 8 |
| Hamlet | 40 | 12 |
| Village | 160 | 16 |
| Hold | 700 | 20 |
| Seat | 2,200 | 20 |

Tiers are per settlement. They reset when you found again. The furthest tier you have ever reached is remembered as a record only.

## Prestige

**Found a new settlement** is available once this settlement’s prosperity reaches 160 (the Village tier).

Kept:

- Clan prosperity (the score)
- Clan seals: +15% to all yields and prosperity per seal
- Storage: +8% caps per seal
- A slightly richer starting camp: more wood, stone, food, and ink per seal
- Star-iron, moon-lacquer, tempers (+4% yields each, max 12), lacquer offerings (+12% ink each, max 8)
- Highest tier reached, best settlement, sound setting

Lost:

- Every building
- Wood, stone, food, and ink (replaced by the new camp’s starting stores)
- This settlement’s prosperity and tier progress

You can stay past 160 and climb toward the Hold and the forge. Founding early is a real choice: the next slope is faster, the forge is not.

Each founding picks a new slope name (Cedar Fold, Lantern Spur, Ink Terrace, and so on).

## Offline progress

The save stores a timestamp. On load, on returning to the tab, and if a frame gap is longer than a couple of seconds, the game simulates the absence in 5-second steps so caps and the training food bonus stay honest.

- Nothing is shown for gaps under 15 seconds (a refresh should not nag).
- Progress stops after **8 hours**.
- The summary lists what arrived, and mentions anything that was already full.

## Score

**Clan prosperity** is the only score. It is the lifetime total, so founding a new settlement does not wipe the leaderboard number. The current settlement’s prosperity is a separate meter used for tiers and founding.

The game reports `Math.floor(clan prosperity)`.

## Hub bridge

If the host page installs `window.Hub`, the game calls it. A missing bridge is ignored, so `index.html` still runs on its own.

- `Hub.ready()` once the village is interactive (also retried shortly after load, in case the host attaches the bridge late)
- `Hub.score(n)` on load and about every 2.5 seconds when the integer score has changed
- `Hub.event('tier-reached', { tier, name })` when this settlement crosses a tier
- `Hub.event('settlement-founded', { seals, runProsperity, lifetime, tier })` when you found a new settlement
- `Hub.event('star-iron-tempered', { tempers })` and `Hub.event('moon-lacquer-offered', { offerings })`
- `Hub.gameOver(score, 0)` when you found a new settlement. `score` is the clan prosperity total. The village keeps running into the next settlement; this is the completed-run report, not a hard stop.

## Cross-game rares

Star-iron and moon-lacquer are the hooks for the rest of Rokumon. This game never mints them. Other games, or the hub, deliver them. They survive founding.

Spend them inside the clan vault (or the matching building’s panel):

- **1 star-iron** at a standing **forge annex** tempers the clan edge: **+4%** all yields and prosperity, forever, up to 12 tempers.
- **1 moon-lacquer** at a standing **shrine** deepens the ink well: **+12%** ink, forever, up to 8 offerings.

Unspent vaults hold 99 of each. One delivery is clamped to 1–20.

### 1. Shared localStorage

Same origin as the village (the hub, if every game is embedded there). Key: `rokumon-shared-goods`.

```json
{
  "pending": [
    { "id": "pinball-2026-11-10-1", "resource": "star-iron", "amount": 1, "source": "rokumon-pinball" }
  ]
}
```

`resource` is `"star-iron"` or `"moon-lacquer"` (camel-case `starIron` / `moonLacquer` is also accepted). Entries this game does not understand are left in the list. Known entries are removed even if the vault was already full, so a queue cannot jam. Ids already applied are ignored.

The village checks the list on load, whenever the tab becomes visible, and every few seconds.

### 2. postMessage

From the hub, or any parent:

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

## Save

`localStorage` key `rokumon-village-v1`, with a version field. A previous blob is kept under `rokumon-village-v1-bak`. Corrupt data falls back to that backup, then to a new camp. The game also saves when the tab hides.

Sound on/off lives in the same save.

## Catalogue

`game-hub-manifest.json` is the embedded release descriptor.

- Runtime: iframe, entry `/games/rokumon-village/index.html`
- One HTML file, no asset requests
- Mouse and touch, one player, either orientation

Open `index.html` in a browser, or let the hub load it. No install step.

## Audio

Short tones from the Web Audio API: a place, a raising, a founding, a tier. Nothing is downloaded. The audio context starts on the first tap or key press. The sound button remembers your choice.
