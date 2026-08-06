/* ================================================================
   Client for the profiles / holdings / exits / brief / sizing surface.
   Shapes: trinetra-backend/API.md § "Profiles, exits, sizing, brief".
   Transport only — every number here is computed server-side.
   ================================================================ */

const clean = (b) => String(b || "").replace(/\/$/, "");

async function call(base, path, { method = "GET", body, token } = {}) {
  const res = await fetch(clean(base) + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      // Only ever sent on /backup and /restore, and only from a value the user
      // typed on this device. It must NOT come from NEXT_PUBLIC_*: that is
      // inlined into the bundle, which would publish the secret to anyone who
      // opens the page — the exact exposure the token exists to close.
      ...(token ? { "X-Backup-Token": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}
const qs = (o) => {
  const p = Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return p.length ? "?" + p.join("&") : "";
};

export function deskApi(base) {
  return {
    profiles:     ()                  => call(base, "/profiles"),
    patchProfile: (id, body)          => call(base, `/profiles/${id}`, { method: "PATCH", body }),
    restoreDefaults: (profile)        => call(base, "/criteria/restore-defaults", { method: "POST", body: { profile } }),
    restoreOriginalFour: (profile)    => call(base, "/criteria/restore-original-four", { method: "POST", body: { profile } }),

    holdings:     ()                  => call(base, "/holdings"),
    hold:         (symbol)            => call(base, "/holdings", { method: "POST", body: { symbol } }), // one tap
    /* Same endpoint, but carrying the levels the signal showed — entryPrice,
       stopLoss, target, profileId, purchaseDate — so the exit rules run
       against the plan that justified the trade. */
    hold2:        (body)               => call(base, "/holdings", { method: "POST", body }),
    patchHolding: (id, body)          => call(base, `/holdings/${id}`, { method: "PATCH", body }),
    dropHolding:  (id)                => call(base, `/holdings/${id}`, { method: "DELETE" }),
    /* Silence one rule for one holding — not the rule everywhere, and not the
       holding. A trailing stop that is wrong for this position is still right
       for the next one. */
    dismiss:      (id, rule)          => call(base, `/holdings/${id}/dismiss`, { method: "POST", body: { rule } }),
    exitSignals:  ()                  => call(base, "/exit-signals"),
    /* Kept separate from /exit-signals on purpose: a fired exit rule means
       "the thesis broke, consider leaving"; these mean "take some off" or
       "put some back". Confusing them costs a position meant to be kept. */
    cycleSignals: ()                  => call(base, "/cycle-signals"),
    /* Development only. Runs the real cycle path with the criteria lock
       bypassed, so the sell rendering can be checked against server output
       instead of a stub. It carries preview:true and notASignal — nothing
       that comes out of here may enter the signal list. */
    cyclePreview: ({ symbol, kind })  => call(base, "/cycle-signals/preview" + qs({ symbol, kind })),
    sold:         (id, body)          => call(base, `/holdings/${id}/sold`, { method: "POST", body: body || {} }),
    boughtBack:   (id, body)          => call(base, `/holdings/${id}/bought-back`, { method: "POST", body: body || {} }),

    brief:        ()                  => call(base, "/brief"),
    /* Answers whether or not the profile has locked — asking "what would this
       be worth" deserves an answer before it fires. */
    decision:     ({ symbol, profile }) => call(base, "/decision" + qs({ symbol, profile })),
    events:       ()                  => call(base, "/events"),
    /* Why the channel is quiet. Without this, a closed market and a broken
       backend look identical from the dashboard. */
    liveSignals:  ()                  => call(base, "/signals"),
    alertsStatus: ()                  => call(base, "/alerts/status"),
    /* Playbook — shapes in trinetra-backend/docs/PLAYBOOK_CONTRACT.md */
    playbookAll:  (profile)           => call(base, "/playbook/all" + qs({ profile })),
    playbook:     ({ symbol, profile }) => call(base, "/playbook" + qs({ symbol, profile })),
    analysts:     (symbol)            => call(base, "/analysts" + qs({ symbol })),
    /* Whether a short can actually be placed, and for how long. Standalone
       because the playbook rows do not carry it — see SHORT_CONTRACT notes. */
    shortability: (symbol)            => call(base, "/shortability" + qs({ symbol })),
    /* Scraping is blocked, so hand-entered calls are what makes broker
       evidence real — and they feed the convergence clustering. */
    addAnalystCall: (body)            => call(base, "/analysts", { method: "POST", body }),

    sizingConfig: ()                  => call(base, "/sizing/config"),
    saveSizing:   (body)              => call(base, "/sizing/config", { method: "POST", body }),
    sizeFor:      ({ symbol, entry, stop }) => call(base, "/sizing" + qs({ symbol, entry, stop })),
    concentration:()                  => call(base, "/concentration"),

    /* Data safety. Render these as a deliberate settings action, never a
       routine button: restore overwrites records that cannot be reconstructed,
       which is why the backend demands confirm: true. */
    backup:       (token)             => call(base, "/backup", { token }),
    restore:      (payload, token)    => call(base, "/restore", { method: "POST", body: { ...payload, confirm: true }, token }),

    /* Whether anything the user accrues actually survives a redeploy. Polled
       rather than read once: a store can be healthy at load and have stopped
       persisting by the time they type an analyst call into it. */
    storage:      (token)             => call(base, "/storage", { token }),
    flushStorage: (token)             => call(base, "/storage/flush", { method: "POST", token }),
  };
}

/* ── presentation helpers shared by the desk views ── */

export const BAND_ORDER = { high: 3, moderate: 2, low: 1, speculative: 0 };
export const SEVERITY_ORDER = { high: 3, medium: 2, low: 1 };

/** Title-case the band without pretending it is a different word. */
export const bandLabel = (b) => (b ? String(b).charAt(0).toUpperCase() + String(b).slice(1) : "—");

export const pctText = (v, sign = true) =>
  v == null || Number.isNaN(+v) ? "—" : `${sign && +v > 0 ? "+" : ""}${(+v).toFixed(1)}%`;

export const rupee = (v, digits = 2) =>
  v == null || Number.isNaN(+v) ? "—" : "₹" + (+v).toLocaleString("en-IN", { maximumFractionDigits: digits });

/* ── the two fields every level must be read against ───────────────
   Both were added in backend a3d2cd1 and both change what an existing
   number means, so they are resolved in one place rather than at each
   call site.
   ────────────────────────────────────────────────────────────────── */

/** The price every percentage in a levels block is measured from.

    It is the trigger for a setup still waiting on its breakout and spot
    otherwise. Dividing a percentage by `price` instead is what produced
    targets underneath their own entry — the entry rule forbids buying at
    spot, so spot is not the price the percentage describes.

    Falls back to spot only because a payload without it has no other
    basis to offer; when that happens the caller should say which price
    it measured from rather than let the number pass as the entry's. */
export const basisOf = (x) =>
  x?.potential?.basisPrice ?? x?.basisPrice ?? x?.price ?? null;

/** True when a target was computed and REJECTED for sitting closer than
    the stop — not when none could be found.

    The distinction is the whole point of the field: "no target offered,
    less to gain than to lose" is a finding, and "potential not
    established" says the opposite of what happened. Both the analog and
    the structure path set it and both mean the same thing.

    The boolean is authoritative wherever it is sent. `/playbook/all`
    rows drop it today (only the detail carries it), so a row that has a
    server-written riskRewardWarning and no target level anywhere is read
    as the same conclusion — that pair cannot arise any other way, since
    the warning is only written when a ratio was actually computed. */
export function noRoomOf(x) {
  if (x?.exits?.noRoom === true || x?.noRoom === true) return true;
  if (x?.exits?.noRoom === false || x?.noRoom === false) return false;
  const warning = x?.exits?.riskRewardWarning ?? x?.riskRewardWarning;
  if (!warning) return false;
  const target = x?.exits?.primary ?? x?.primary;
  const safe = x?.exits?.safe ?? x?.safe;
  const stretch = x?.exits?.stretch ?? x?.stretch;
  return !target && !safe && !stretch;
}

/** The prices that were computed and then rejected, for inspection only.
    Never promote one of these into the target slot — the reason it is
    here is that acting on it loses money on the arithmetic alone. */
export const withheldOf = (x) => x?.exits?.withheld ?? x?.withheld ?? null;

/** The four exit tiers in ladder order, as an array the UI can walk.
    `converged` collapses safe/primary/stretch into one rung, because the
    backend found resistance close overhead and three identical numbers would
    imply a choice that does not exist. */
export function ladderOf(exits) {
  if (!exits) return [];
  const rr = exits.riskReward || {};
  const rung = (key, label, rrKey) => {
    const e = exits[key];
    if (!e || e.price == null) return null;
    return { key, label, pct: e.pct, movePct: e.movePct, downward: e.downward, above: e.above,
             price: e.price, rationale: e.rationale, rr: rrKey ? rr[rrKey] : null };
  };
  // Labels travel with the payload — a sell's rungs are "Sell at" / "Buy back".
  const stop = rung("stop", "Stop", null);
  const targetLabel = exits.targetLabel || "Target";
  if (exits.converged) {
    const one = rung("primary", targetLabel, "toPrimary") || rung("safe", targetLabel, "toSafe");
    return [stop, one].filter(Boolean);
  }
  return [stop, rung("safe", "Safe", "toSafe"), rung("primary", targetLabel, "toPrimary"), rung("stretch", "Stretch", "toStretch")].filter(Boolean);
}

/** Remaining upside as a range, or an explicit refusal. Never a lone number. */
export function potentialText(potential, horizon) {
  if (potential === null || potential === undefined) {
    return { kind: "none", text: horizon === "longterm"
      ? "No % estimate for this horizon — a target over years would be invented, so the engine does not produce one."
      : "No estimate available for this signal." };
  }
  if (potential.insufficientHistory) {
    return { kind: "thin", text: "not enough history to estimate — showing volatility bounds only", bounds: potential.bounds, basis: potential.basis };
  }
  const r = potential.remainingPct || {};
  if (r.low == null && r.high == null) return { kind: "none", text: "No remaining-move estimate for this signal." };
  return { kind: "range", low: r.low, high: r.high, median: r.median, n: potential.analogs?.n ?? 0, basis: potential.basis };
}
