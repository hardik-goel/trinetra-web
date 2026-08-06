/* ================================================================
   TRACK RECORD — client for the backend's validation endpoints, plus
   the honesty rules the views share.

   The backend (trinetra-backend/lib/{history,paper,ipo}.js) owns every
   number. This file only transports them and decides when a number is
   too thin to print. Nothing here recomputes a statistic the server
   already reported — two implementations of "win rate" is how a
   dashboard ends up flattering itself.
   ================================================================ */

const clean = (base) => String(base || "").replace(/\/$/, "");

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

/* One object per backend URL. Every method resolves to the server's own
   payload shape — see trinetra-backend/README.md → "Track record". */
export function trackApi(base) {
  return {
    // watchlists
    watchlists:   ()                    => call(base, "/watchlists"),
    createList:   (name)                => call(base, "/watchlists", { method: "POST", body: { name } }),
    renameList:   (from, name)          => call(base, `/watchlists/${encodeURIComponent(from)}`, { method: "PATCH", body: { name } }),
    deleteList:   (name)                => call(base, `/watchlists/${encodeURIComponent(name)}`, { method: "DELETE" }),
    addTo:        (name, symbols)       => call(base, `/watchlists/${encodeURIComponent(name)}/add`, { method: "POST", body: { symbols } }),
    removeFrom:   (name, symbols)       => call(base, `/watchlists/${encodeURIComponent(name)}/remove`, { method: "POST", body: { symbols } }),
    moveTo:       (from, to, symbols)   => call(base, `/watchlists/${encodeURIComponent(from)}/move`, { method: "POST", body: { to, symbols } }),

    // signals + outcomes
    signals:      ({ from, to })        => call(base, "/signals/history" + qs({ from, to })),
    signalStats:  (days)                => call(base, "/signals/stats" + qs({ days })),

    // paper trades
    trades:       ()                    => call(base, "/paper-trades"),
    openTrade:    (body)                => call(base, "/paper-trades", { method: "POST", body }),
    patchTrade:   (id, body)            => call(base, `/paper-trades/${id}`, { method: "PATCH", body }),
    deleteTrade:  (id)                  => call(base, `/paper-trades/${id}`, { method: "DELETE" }),
    tradeStats:   (days, horizon)       => call(base, "/paper-trades/stats" + qs({ days, horizon })),

    // ipo applications
    ipos:         ()                    => call(base, "/ipo-applications"),
    addIpo:       (body)                => call(base, "/ipo-applications", { method: "POST", body }),
    patchIpo:     (id, body)            => call(base, `/ipo-applications/${id}`, { method: "PATCH", body }),
    deleteIpo:    (id)                  => call(base, `/ipo-applications/${id}`, { method: "DELETE" }),
    ipoStats:     (days)                => call(base, "/ipo-applications/stats" + qs({ days })),
  };
}

/* ── sample-size rules ─────────────────────────────────────────────
   The whole module exists to answer "is this worth paying for", so the
   thresholds below are the difference between an answer and a guess.
   Under them, a percentage is not printed at all — a rounded number is
   read as a finding no matter how small the n beside it.           */
export const MIN_TRADES = 20;   // closed paper trades before a win rate means anything
export const MIN_IPOS = 15;     // resolved applications before an accuracy does
export const MIN_SIGNALS = 20;  // matured signals per horizon

export const enough = (n, min) => (n ?? 0) >= min;

/** A percentage, or an explicit refusal to state one. Always carries n. */
export function pctOrThin(value, n, min) {
  if (!enough(n, min) || value == null) return { text: `insufficient sample (n=${n ?? 0})`, thin: true, n };
  return { text: `${Math.round(value * 10) / 10}% (n=${n})`, thin: false, n };
}

export const KITE_MONTHLY = 2000; // ₹/month — the decision this module informs

/* ── formatting ── */
export const inr = (v, digits = 0) =>
  v == null || Number.isNaN(+v) ? "—" : (v < 0 ? "-₹" : "₹") + Math.abs(+v).toLocaleString("en-IN", { maximumFractionDigits: digits });

export const signed = (v, digits = 1, suffix = "%") =>
  v == null || Number.isNaN(+v) ? "—" : `${+v > 0 ? "+" : ""}${(+v).toFixed(digits)}${suffix}`;

export const dayISO = (d) => new Date(d).toISOString().slice(0, 10);
export const shortDate = (d) => {
  if (!d) return "—";
  const t = new Date(d);
  return Number.isNaN(+t) ? "—" : t.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};
/** Whole days between two instants, floor — used for "n days in range". */
export const daysBetween = (from, to) =>
  Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);

/* Presets are ranges, not just day counts: every view is driven by from/to so
   a custom range behaves exactly like a preset. */
export const RANGE_PRESETS = [[7, "7 days"], [30, "30 days"], [90, "90 days"]];
export function presetRange(days) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: dayISO(from), to: dayISO(to) };
}

/* ── client-side summaries ─────────────────────────────────────────
   The server's /signals/stats takes a day count; a custom range needs the
   same arithmetic over an explicit window. These mirror history.js exactly
   — pending is never counted as zero, and n travels with every figure. */
export const HORIZONS = [1, 3, 7, 30];

const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const mean = (xs) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function summariseHorizons(signals) {
  const out = {};
  for (const d of HORIZONS) {
    const rets = signals.map((s) => s.outcome?.[`ret${d}d`]).filter((v) => Number.isFinite(v));
    const wins = rets.filter((v) => v > 0).length;
    out[`ret${d}d`] = {
      n: rets.length,
      pending: signals.length - rets.length,
      winRate: rets.length ? round2((wins / rets.length) * 100) : null,
      avg: mean(rets),
      best: rets.length ? round2(Math.max(...rets)) : null,
      worst: rets.length ? round2(Math.min(...rets)) : null,
    };
  }
  return out;
}

/** Group signals by the criteria combination that fired them — the only way to
    see whether 3/3 actually beats 2/3, or whether one criterion carries it. */
export function byCombo(signals) {
  const map = {};
  for (const s of signals) (map[s.combo || "none"] ||= []).push(s);
  return Object.entries(map)
    /* Carry the readable names through the grouping. combo stays the key —
       it is a stable join value — but nothing downstream should have to render
       initials that look like criteria they are not. */
    .map(([combo, rs]) => ({ combo, n: rs.length, count: rs[0]?.count ?? 0,
      profileName: rs[0]?.profileName || null, profileId: rs[0]?.profileId || null,
      lockedOn: rs[0]?.lockedOn || null,
      horizons: summariseHorizons(rs) }))
    .sort((a, b) => b.count - a.count || b.n - a.n);
}

/** Per-criterion: how signals that included criterion K did, versus those that
    did not. A criterion that does not separate the two is not earning its slot. */
export function byCriterion(signals) {
  const keys = [...new Set(signals.flatMap((s) => (s.criteria || []).filter((c) => c.pass).map((c) => c.key || c.id)))];
  return keys.map((key) => {
    const withK = signals.filter((s) => (s.criteria || []).some((c) => c.pass && (c.key || c.id) === key));
    const without = signals.filter((s) => !(s.criteria || []).some((c) => c.pass && (c.key || c.id) === key));
    return { key, with: summariseHorizons(withK), without: summariseHorizons(without), nWith: withK.length, nWithout: without.length };
  });
}
