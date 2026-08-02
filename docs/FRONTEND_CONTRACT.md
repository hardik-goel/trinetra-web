# What the dashboard needs from Part A

Written from the Part B spec (profiles, exit signals, morning brief, events, sizing) by
the frontend side, so whoever builds the backend has a target and the two halves meet on
the first try — the way `API.md` made the track-record cycle converge.

Nothing below can be computed honestly in the browser. The snapshot carries ~60 price
points per symbol; deriving "n=24 analogs" or a confidence score from that would be
inventing a statistic, which is the one thing this app's rules forbid. **These are server
computations.** The dashboard renders them and refuses to print what is missing.

Status: **proposed**. Not implemented anywhere yet.

---

## 1. Profiles

```
GET  /profiles            → { profiles: { swing: {...}, positional: {...},
                                          longterm: {...}, intraday: {...} }, active: "swing" }
POST /profiles/:id/criteria  { criteria: [...] }      → same shape as /config criteria
```

Each profile owns a criteria array of the existing shape. Rules the UI depends on:

- `intraday.locked: true` with `lockedReason: "Needs live market data — unlocks with Kite."`
  The UI shows it, greys it, and states the reason — the Oracle-parked pattern.
- Existing `/config.criteria` migrates into `swing` so nothing silently changes meaning.
- `/snapshot` rows gain `profiles: ["swing", "longterm"]` — which profiles that symbol
  currently satisfies — so "All profiles" needs no extra call.

## 2. Holdings and exit signals

```
GET    /holdings                  → { holdings: [...] }
POST   /holdings                  { symbol }            ← ONE TAP: price/date filled server-side
PATCH  /holdings/:id              { qty?, stop?, target?, exitPrice?, exitReason?, status? }
POST   /holdings/:id/dismiss      { rule }               ← silence one rule for one holding
GET    /exit-signals              → { signals: [...] }
```

The user does not fill forms. `POST /holdings {symbol}` must be sufficient: entry price =
current mark, entry date = now, qty/stop/target null and editable later.

An exit signal is useless as a bare verdict. Each one needs:

```json
{ "holdingId": "hld_…", "symbol": "POLYCAB", "rule": "trend-break",
  "severity": "high",
  "headline": "Trend structure broke",
  "reasoning": "Closed below the 20-day high that triggered the entry, on 2.4x average volume — the breakout that justified this position has failed.",
  "action": "consider exiting",
  "evidence": { "entryPrice": 6420, "currentPrice": 6180, "triggerLevel": 6250,
                "fromEntryPct": -3.7, "daysHeld": 12,
                "criterionAtEntry": "B · above 20-day high", "criterionNow": "B · failed" },
  "armed": true, "distanceToTriggerPct": null }
```

- `reasoning` is a full sentence with the numbers in it. The UI renders it whole and never
  truncates it into a chip.
- `action` ∈ `consider exiting | review | watch`. Never "sell".
- For rules that are armed but not fired, `distanceToTriggerPct` drives the row status
  ("trailing stop 1.2% away").

## 3. Decision surface — potential, confidence, exit ladder

Attached to each signal (and available per symbol for the detail drawer):

```json
{ "movedPct": 3.1,
  "potential": { "lowPct": 4, "highPct": 9, "n": 24, "basis": "analogs",
                 "insufficientHistory": false, "exhausted": false },
  "confidence": { "score": 61, "band": "Moderate",
                  "components": [ { "label": "Criteria confluence", "contribution": 28 },
                                  { "label": "Volume confirmation", "contribution": 15 },
                                  { "label": "Delayed feed", "contribution": -12,
                                    "cap": "capped at 65 on a delayed feed" } ] },
  "ladder": [ { "level": "stop",    "pricePoint": 6180, "pct": -3.7, "rr": null,
                "rationale": "Below the breakout base — the thesis is wrong here." },
              { "level": "safe",    "pricePoint": 6750, "pct": 5.2, "rr": 1.4, "…": "" },
              { "level": "primary", "pricePoint": 7020, "pct": 9.4, "rr": 2.1, "…": "" },
              { "level": "stretch", "pricePoint": 7400, "pct": 15.3, "rr": 3.0, "…": "" } ],
  "suggestion": "The safe exit at +5.2% carries the better risk-reward than holding for +9.4%.",
  "lagDisclosure": "~15 min delayed — part of this move may already be gone." }
```

UI contract, all enforced in the rendering:

- `potential` prints as a **range with its n**, never a lone number, always with the word
  "estimate" or "typically". When `insufficientHistory` is true the UI prints "not enough
  history to estimate — showing volatility bounds only" and no percentages.
- `confidence.score` is never shown without `band`, and `components` is one tap away with
  every `cap` listed.
- `exhausted: true` renders as a prominent amber line, above the fold.
- Any ladder rung with `rr < 1` renders red.
- `lagDisclosure` is a visible line on intraday-dependent cards, not a tooltip.

## 4. Events

```
GET /events?symbols=A,B    → { events: [ { symbol, type: "results", date, sessionsAway: 2,
                                           source, fetchedAt } ], stale: false }
```

`/snapshot` rows gain `nextEvent: { type, date, sessionsAway }` so a row chip costs no
extra call. Scraped dates break when a source changes its markup: the payload must carry
`source` and `fetchedAt`, and say `stale: true` rather than serve silence, so the UI can
label the chip instead of quietly dropping the warning.

## 5. Sizing and concentration

```
GET  /settings/sizing   → { capital: 500000, riskPerTradePct: 1 }
POST /settings/sizing   { capital, riskPerTradePct }
GET  /concentration     → { bySector: [ { sector, pct, symbols: [] } ],
                            largestPositionPct, flags: [ { level, message } ] }
```

Quantity maths can run client-side once capital, risk% and the stop are known — that is
arithmetic, not a statistic. Sector exposure comes from the server because it needs the
holdings book.

## 6. Morning brief

```
GET /brief   → { asOf, dataHealth: { provider, delayed, lastRefresh },
                 exits: [...], newSignals: [...], ipos: [...],
                 events: [...], concentration: [...] }
```

One call, already ordered by urgency. `dataHealth` is rendered as a quiet line so a stale
brief is never mistaken for a live one. Everything may be empty — the UI prints "Nothing
needs your attention this morning" rather than a blank screen.

---

## Degradation

Every endpoint here is optional at runtime. A 404 must leave the rest of the dashboard
working: the tab renders its own "not available from this backend yet" state, exactly as
the Track Record tab does in demo mode. No feature in this list may break the criteria
engine, alerts, Pravesh, Track Record, watchlists or fundamentals.
