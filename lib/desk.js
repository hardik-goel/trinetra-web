/* ================================================================
   Client for the profiles / holdings / exits / brief / sizing surface.
   Shapes: trinetra-backend/API.md § "Profiles, exits, sizing, brief".
   Transport only — every number here is computed server-side.
   ================================================================ */

const clean = (b) => String(b || "").replace(/\/$/, "");

async function call(base, path, { method = "GET", body } = {}) {
  const res = await fetch(clean(base) + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
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

    holdings:     ()                  => call(base, "/holdings"),
    hold:         (symbol)            => call(base, "/holdings", { method: "POST", body: { symbol } }), // one tap
    patchHolding: (id, body)          => call(base, `/holdings/${id}`, { method: "PATCH", body }),
    dropHolding:  (id)                => call(base, `/holdings/${id}`, { method: "DELETE" }),
    /* Silence one rule for one holding — not the rule everywhere, and not the
       holding. A trailing stop that is wrong for this position is still right
       for the next one. */
    dismiss:      (id, rule)          => call(base, `/holdings/${id}/dismiss`, { method: "POST", body: { rule } }),
    exitSignals:  ()                  => call(base, "/exit-signals"),

    brief:        ()                  => call(base, "/brief"),
    events:       ()                  => call(base, "/events"),

    sizingConfig: ()                  => call(base, "/sizing/config"),
    saveSizing:   (body)              => call(base, "/sizing/config", { method: "POST", body }),
    sizeFor:      ({ symbol, entry, stop }) => call(base, "/sizing" + qs({ symbol, entry, stop })),
    concentration:()                  => call(base, "/concentration"),
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
    return { key, label, pct: e.pct, price: e.price, rationale: e.rationale, rr: rrKey ? rr[rrKey] : null };
  };
  const stop = rung("stop", "Stop", null);
  if (exits.converged) {
    const one = rung("primary", "Target", "toPrimary") || rung("safe", "Target", "toSafe");
    return [stop, one].filter(Boolean);
  }
  return [stop, rung("safe", "Safe", "toSafe"), rung("primary", "Primary", "toPrimary"), rung("stretch", "Stretch", "toStretch")].filter(Boolean);
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
