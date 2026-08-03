# Sell / buy-back cycle — what the dashboard needs

Written from the Part B brief by the frontend side while Part A is being built, so the
two halves meet on the first try — the same way `FRONTEND_CONTRACT.md` and
`PLAYBOOK_CONTRACT.md` worked. Status: **proposed**, nothing bound to it yet.

The one rule underneath all of it: **a SELL must be impossible to confuse with a
CLOSE POSITION.** Partial profit-taking on a position the user means to keep, and a
broken thesis that should be exited entirely, are different situations. If the UI ever
renders them alike, this feature has made the app more dangerous rather than less.

---

## 1 · Cycle state, on the holding

`GET /holdings` rows gain a `cycle` object — on the holding, not a separate lookup, so
the Positions list and the watchlist badge need no second call:

```json
"cycle": {
  "status": "full" | "partly sold" | "restored",
  "coreQty": 100, "soldQty": 30,
  "sellPrice": 9890, "soldAt": "2026-08-01T10:12:00+05:30",
  "boughtBackQty": 0, "buyBackPrice": null, "boughtBackAt": null,
  "belowSalePct": -4.2,
  "realisedFromCycle": 4830,
  "cycleVsHold": -1240,
  "roundTrips": 2
}
```

- `belowSalePct` is what makes a buy-back legible at a glance — the UI renders
  "4.2% below your sale at ₹9,890" rather than making the user subtract.
- **`cycleVsHold` must always be present when `realisedFromCycle` is.** The UI renders
  them adjacent and at equal weight. Trading around a core position frequently
  underperforms holding it, and the number that shows that must never be the one that is
  missing. If it cannot be computed yet, send `null` — the UI will say "not yet
  comparable", never imply the trading is free.

## 2 · The signals

Either as `GET /cycle-signals` or on the existing `/exit-signals` envelope under separate
keys — the UI can take either, but they must **not** be mixed into `signals[]`, which
already means "a rule fired, consider exiting fully".

```json
{ "sell": [ {
    "id": "cyc_…", "holdingId": "hld_…", "symbol": "POLYCAB",
    "kind": "sell",
    "subtitle": "sell a portion of your holding",
    "criteria": [ { "name": "Extended", "detail": "12.4% above the 20-day average", "pass": true },
                  { "name": "At resistance", "detail": "₹9,890 — 52-week high, rejected twice", "pass": true },
                  { "name": "Candles", "detail": "shooting star at the level (2.1× volume)", "pass": false } ],
    "holding": { "entryPrice": 7240, "currentPrice": 9890, "gainPct": 36.6,
                 "heldMonths": 4, "stcg": true },
    "reasoning": "One sentence with the numbers in it.",
    "suggestion": "consider selling a portion; core stays",
    "reentryRisk": "If it keeps running, buying back may be higher.",
    "dataAge": { "delayed": true, "lagSeconds": 900 } } ],

  "buyBack": [ {
    "id": "cyc_…", "holdingId": "hld_…", "symbol": "POLYCAB",
    "kind": "buyBack",
    "subtitle": "buy back what you sold",
    "criteria": [ … ],
    "belowSalePct": -4.2, "sellPrice": 9890,
    "trendIntact": true,
    "suggestion": "consider buying back toward your core size" } ],

  "suppressed": [ { "symbol": "XYZ", "reason": "trend broken — no re-entry signal" } ] }
```

- `subtitle` is **mandatory on every item** and is rendered verbatim, never truncated.
  It is the only thing separating "sell a portion" from "close the position".
- `suppressed[]` is not noise: a buy-back withheld because the trend broke is a finding,
  and the UI shows it rather than silently omitting the symbol. Absence would read as
  "no pullback yet", which is the opposite of what happened.
- `stcg: true` renders as "held 4 months — selling realises STCG" beside the gain. The UI
  states the timing consequence and computes no tax.
- `criteria[].pass: false` items still render, greyed — a signal that fired on three of
  four is not the same as one that fired on four, and the fourth is worth seeing.

## 3 · The two one-tap actions

The user will not fill a form. Both take the symbol or holding id and nothing else
required; price defaults to the current mark server-side, quantity to a sensible default
the response states back.

```
POST /holdings/:id/sold        { qty?, price? }   → the updated holding, cycle included
POST /holdings/:id/bought-back { qty?, price? }   → the updated holding, cycle included
```

Returning the updated holding means the UI re-renders from the server's answer rather
than guessing what changed.

## 4 · Profiles

`Sell — holdings` and `Buy back — holdings` appear in `GET /profiles` like any other, so
the switcher and the per-profile criteria editor pick them up with **no frontend change**
— verified against a stub. Two things the UI needs from them:

- a flag marking them as holdings-only (`appliesTo: "holdings"` or similar), so the
  watchlist does not offer a Sell horizon for stocks the user does not own;
- `matchesCanonical` should keep describing the core three only. These two profiles are
  additions, not a change to what "the default three" means, and the drift banner must
  not start firing because they exist.

---

## What the UI will do with it

- Positions: cycle state per holding, sale price and distance from it, `realisedFromCycle`
  next to `cycleVsHold` at equal weight, and the two one-tap actions.
- Active SELL / BUY cards at the top of Positions, above holdings, below fired exit
  signals — a broken thesis outranks profit-taking.
- Watchlist: a small badge on held symbols that are partly sold.
- Nothing anywhere renders a SELL for a symbol that is not in `holdings`.
