/* ================================================================
   The manual — one source, rendered both in the Help tab and at /docs.
   Written for the person using it, not as a feature list: what each
   surface is for, what it refuses to do, and what to distrust.
   ================================================================ */

export const GUIDE = [
  {
    id: "start",
    title: "Start here",
    lede: "Trinetra watches a list of NSE stocks and stays silent until one satisfies every criterion you set. It is decision support: it never says buy or sell, and every number it shows carries where it came from.",
    items: [
      ["The eye", "Each stock has a lock meter — one bar per enabled criterion. The eye \"opens\" when all of them lock at once. That moment is a signal, and it is recorded server-side so it can be graded later."],
      ["Live vs demo", "The chip in the header says Demo or Live. Live means a deployed backend is feeding real delayed NSE prices and running the scan 24/7, alerts included, with this tab closed. Demo is simulated ticks for learning the instrument — nothing in demo is real."],
      ["~15 minutes behind", "The free feed is delayed. Every screen that depends on it says so at the point of use, and intraday confidence is capped because of it. Connecting Zerodha Kite removes the lag and lifts the cap with no code change."],
    ],
  },
  {
    id: "profiles",
    title: "Profiles — four horizons",
    lede: "One criteria set forced one answer to four different questions. The engine now evaluates Intraday, Swing, Positional and Long term independently, and the chips above the watchlist choose which one the lock meters answer for.",
    items: [
      ["All profiles", "Tags each row with the horizons it currently satisfies, so you can see a stock that is a long-term hold but a poor swing entry."],
      ["Intraday is not locked", "It runs on the delayed feed on purpose: if the estimated remaining move is larger than the move already gone, the tail is still tradeable. The honesty mechanism is a hard confidence cap of 55, shown beside every score, plus a lag line on the card."],
      ["Editing criteria", "Criteria → pick a profile → edit its checks → Save. Each horizon saves to itself. A breakout that matters over five sessions is noise over five years, so they do not share thresholds."],
    ],
  },
  {
    id: "watchlist",
    title: "The watchlist",
    lede: "Everything the backend scans, sliced how you want to look at it right now.",
    items: [
      ["Groups", "Named lists — Default, Momentum, whatever you make. The engine scans the union, so a symbol in two lists is still watched once. Create, rename, delete and multi-select → Move to… in the Universe panel."],
      ["Sort", "By criteria met, symbol, price, day change, volume multiple, any fundamental the backend scrapes, and — when a single profile is selected — confidence, remaining potential and risk:reward. Missing values sort last in both directions, because absent is not a low value."],
      ["Filter", "Group, minimum criteria met, sector, and signal-fired-today. They compose, show as chips, and clear in one tap."],
      ["One tap to hold", "+ I'm holding this on any row. No form: entry price, levels and the criteria locked at that moment are captured server-side, because \"the reason you bought no longer holds\" cannot be detected later without a record of what that reason was."],
    ],
  },
  {
    id: "decision",
    title: "Potential, confidence, exits",
    lede: "Open any stock for the decision surface. These are estimates from that stock's own history — never predictions.",
    items: [
      ["Potential", "Always a range with its sample size, phrased as what similar setups typically did. Long term shows no estimate at all, by design: a percentage target over years would be invented. Under 8 analogs it says so and shows no range."],
      ["Exhausted", "When the typical move has already happened, an amber line leads the card. The app is meant to be as loud about a spent setup as an attractive one."],
      ["Confidence", "A score with a band word, and a tap opens the components that built it — including every cap. If nothing ever scores high, the caps tell you why."],
      ["Exit ladder", "Stop → safe → primary → stretch with the current price marked, a rationale per rung, and risk:reward on each. Sub-1:1 renders red. When resistance sits close overhead the tiers converge and one target is shown instead of three identical ones."],
      ["Sizing", "Enter or confirm entry and stop and it returns quantity, rupee risk and position size against your capital. If it had to assume a stop, it says so — an invented stop produces an invented quantity. Set capital in Positions → Capital & risk."],
    ],
  },
  {
    id: "playbook",
    title: "The Playbook",
    lede: "Where to get in, where it is now, where to get out, and what is left — one row per stock, each level clustered from independent methods rather than picked from one.",
    items: [
      ["Six fields, depth on tap", "The table shows entry, current, exit, potential left, timeframe and confidence — nothing else. Tap the confidence score (or the row) for the evidence, exit ladder, candlesticks and broker calls behind it. Two things stay on the row because burying them would make the app quieter about danger than opportunity: a chase warning, and risk-reward below 1:1."],
      ["Convergence is the point", "A level is only as good as the number of independent methods that agree on it. Four methods within a narrow band is a real level; four scattered across 20% is not, and the tab says so instead of manufacturing one. Confidence measures that agreement — not whether the trade will work."],
      ["Zones, not prices", "Every level is a band sized by volatility. A single rupee figure would invent precision the engine never claimed."],
      ["Reliability takes months", "Broker hit rates need calls to resolve, and candlestick follow-through needs 8 occurrences in that stock's own history. Until then it reads \"not yet measurable\" — which is the honest state, not a broken one. It will never be filled with a textbook number."],
      ["Both sides shown", "Evidence that opposes a level is rendered at the same weight as evidence that supports it. Patterns confirm or contradict a level; they are never a reason on their own."],
      ["Chasing", "If price has run past the trigger by more than the stock's own volatility, a warning leads the card — entering there changes the risk-reward, whatever the level says."],
    ],
  },
  {
    id: "brief",
    title: "Morning Brief",
    lede: "The landing view before 11:00 IST on weekdays, ordered by what needs deciding soonest. Dashboard → leaves at any time and it will not reappear that session.",
    items: [
      ["Order is deliberate", "Exit signals on open holdings first — that money is already committed. Then new signals by profile, IPOs closing, events inside three sessions, concentration flags."],
      ["Data health", "The quiet line at the top names the provider, the delay, and how long ago it refreshed. A stale brief must never read as a live one."],
      ["Silence is a result", "\"Nothing needs your attention this morning\" is an outcome, not a failure — the scan still ran."],
    ],
  },
  {
    id: "positions",
    title: "Positions and exit signals",
    lede: "What is at risk now. Seven rules run per holding on every refresh: stop-loss, target, trailing stop, structure break, volume dry-up, thesis break and time stop.",
    items: [
      ["Reasoning in full", "Every exit signal states its case in a sentence with the numbers in it — what you marked, at what price, on what criterion, and what has changed. An alert that says only SELL demands the most consequential action in the app while withholding the evidence."],
      ["Fired vs armed", "Fired rules are cards with actions. Armed rules — \"trailing stop 2% away\" — sit in a quieter strip with no close button, because nothing has broken yet."],
      ["Actions", "Mark closed records the exit price and reason. Dismiss silences one rule for one holding, not that rule everywhere."],
      ["Concentration", "Sector bars across open holdings, the largest position as a share of capital, and flags when one bet is wearing four names. Read the caveats — they state what the numbers cannot see."],
    ],
  },
  {
    id: "track",
    title: "Track Record — is this worth paying for?",
    lede: "The module exists to answer that before a ₹2,000/month Kite subscription, and to be capable of answering no.",
    items: [
      ["Signals", "Every signal in the range with forward returns at 1, 3, 7 and 30 days, max gain and max drawdown, split by criteria combination and per criterion — so you learn which of your criteria actually earns its place."],
      ["Paper trades", "Log, close, and compare. The number that matters is your picks against taking every signal: a negative edge means the raw screener beat your selection of it, and the honest response is to take more of its signals, not fewer."],
      ["Sample size", "Below 20 closed trades, 15 resolved IPOs or 20 matured signals per horizon, it prints \"insufficient sample (n=…)\" instead of a percentage. That is the answer, not a gap."],
      ["The verdict", "States plainly whether the sample supports a conclusion, then compares the paper book against the subscription cost for the window. Paper excludes slippage, brokerage, STT and the psychology of real money — live results are typically worse."],
    ],
  },
  {
    id: "other",
    title: "The rest",
    items: [
      ["Fundamentals", "The whole scraped matrix — a row per symbol, a column per metric, colour-coded against your Fundamentals criterion. Build a filter here to add a check like ROCE ≥ 20. New metrics added on the backend appear automatically."],
      ["Pravesh", "IPO intelligence: what each named source said, its own accuracy with n, and a My Take clearly labelled as opinion. Read-only — the engine runs elsewhere."],
      ["Why alerts are quiet", "The Alerts panel names the reason: outside market hours (with the next open), a cooldown, the per-symbol daily cap, or no credentials on the backend. Alerts fire once when a stock becomes locked, not every minute it stays locked, and the ledger survives a restart. Holidays are only partly seeded — moving ones like Diwali fall back to weekday logic, so alerts can fire on a closed market until the NSE list is added."],
    ["Alerts", "Telegram is the backbone and fires with everything closed. The panel shows the backend's armed state with masked credentials; typing new values replaces them. Push notifications are not available in the installed app."],
      ["Oracle", "Parked. The forecast feed is rate-limited from the server, so the criterion is off and cannot be switched on — a criterion with no data would silence every signal."],
      ["Install it", "iPhone: Safari → Share → Add to Home Screen (Chrome on iOS cannot install PWAs — Apple's restriction). Android: the Install prompt or menu → Install app. Desktop: the install icon in the address bar."],
    ],
  },
  {
    id: "rules",
    title: "What the app will not do",
    lede: "These are enforced in code, not left to the copy.",
    items: [
      ["It will not say buy or sell", "Only \"consider entering\", \"consider exiting\", \"review\" or \"watch\" — with the reasoning attached and the note that the call is yours."],
      ["It will not print a percentage it cannot support", "Every rate carries its n, and below the sample thresholds it refuses the number outright."],
      ["It will not hide the bad news", "Exhausted setups, sub-1:1 risk:reward, unverified seed fundamentals, degraded scrapes, stale data and a paper book that fails to cover the subscription are all shown at the same volume as the wins."],
      ["It will not cache a price", "The installed app caches the shell only. Market data always goes to the network and fails visibly, because a cached price is a price from an unknown moment."],
    ],
  },
];

export const GUIDE_INTRO =
  "Trinetra is a vigilance instrument for NSE swing and positional setups, with an IPO desk and a track record that measures whether any of it works.";
