"use client";
import React from "react";

/* ================================================================
   SHORTING — the parts of a short that are not symmetrical with a long.

   Two asymmetries drive everything here:

   · A long can lose what you put in. A short has no ceiling, because
     there is no upper bound on a price. So the risk note is not a
     disclosure to be acknowledged once and hidden — it stays on screen
     for as long as the short does.

   · A long can always be held. A short cannot: in the Indian cash
     market it must be closed the same session, and only F&O stocks can
     be carried overnight, in whole lots. A "3–5 day short" on a
     cash-only stock is not a cautious trade, it is an unplaceable one.

   The third case is the one that invites a guess: when the F&O list
   could not be fetched, `known` is false. "Cash only" would fabricate a
   restriction; "F&O" would fabricate permission. Both are wrong, in
   opposite directions, so this renders "unknown" and says why.
   ================================================================ */

const T = {
  card: "#1A1C13", raised: "#20221799", line: "#2A2D1F",
  ink: "#EAE7DB", mute: "#9C9F8B", dimSolid: "#636653",
  brass: "#C9A961",
  red: "#DC6A58", redSoft: "#DC6A5814",
  amber: "#D8B25C", green: "#86C08A", blue: "#7FA6CE",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

/* The contract requires this sentence on every short. When the payload carries
   its own wording that is what shows — the backend owns the phrasing. This
   fallback exists because the rule is "always visible on every short", not
   "visible when the field happens to be populated": playbook rows currently
   arrive with riskNote null, and silence there would be the one failure mode
   this feature cannot have. */
export const DEFAULT_RISK_NOTE =
  "Loss on a short is unbounded. The stop is the risk control, not a formality.";

export const isShort = (r) => (r?.direction || "").toLowerCase() === "sell";

/** Always visible. Never behind a tap, a tooltip, or an expander. */
export function RiskNote({ text, count }) {
  return (
    <div style={{ fontFamily: T.sans, display: "flex", gap: 9, alignItems: "baseline",
      background: T.redSoft, border: "1px solid " + T.red + "4A", borderLeft: "3px solid " + T.red,
      borderRadius: 9, padding: "9px 12px", marginBottom: 10 }}>
      <span style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: 1.3, color: T.red, whiteSpace: "nowrap" }}>
        UNBOUNDED LOSS
      </span>
      <span style={{ fontSize: 12, color: T.ink, lineHeight: 1.55 }}>
        {text || DEFAULT_RISK_NOTE}
        {count > 1 && <span style={{ color: T.mute }}> Applies to all {count} shorts below.</span>}
      </span>
    </div>
  );
}

/** Compact enough for a table cell: can this be held, and in what increment. */
export function ShortabilityChip({ s, clamped }) {
  if (!s) return <span style={{ color: T.dimSolid, fontSize: 10.5 }}>—</span>;

  if (!s.known) {
    return (
      <span title="The F&O list could not be fetched, so whether this can be carried overnight is unverified. It is not a statement that it cannot."
        style={{ fontFamily: T.mono, fontSize: 9.5, color: T.amber,
          border: "1px solid " + T.amber + "55", borderRadius: 4, padding: "1px 5px" }}>
        unknown
      </span>
    );
  }
  if (!s.fno) {
    return (
      <span title={clamped?.why || "Cash-market shorts must be closed the same session."}
        style={{ fontFamily: T.mono, fontSize: 9.5, color: T.blue,
          border: "1px solid " + T.blue + "55", borderRadius: 4, padding: "1px 5px" }}>
        intraday only
      </span>
    );
  }
  return (
    <span title={s.note || ""} style={{ fontFamily: T.mono, fontSize: 9.5, color: T.green,
      border: "1px solid " + T.green + "55", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}>
      F&amp;O{s.lotSize ? ` · lot ${s.lotSize}` : ""}
    </span>
  );
}

/** The lot beside a sizing number — because the lot, not the budget, sets size. */
export function LotNote({ s }) {
  if (!s?.known || !s.fno || !s.lotSize) return null;
  return (
    <div style={{ fontFamily: T.mono, fontSize: 10, color: T.brass, marginTop: 4, lineHeight: 1.6 }}>
      Lot {s.lotSize} — a short here trades in whole lots, so the lot sets the position size, not the risk budget.
    </div>
  );
}

/** The full picture, for a detail drawer. */
export function ShortabilityBlock({ s, clamped, loading }) {
  if (loading) return <div style={{ fontSize: 11.5, color: T.dimSolid, fontFamily: T.sans }}>Checking whether this can be shorted…</div>;
  if (!s) return null;

  const tone = !s.known ? T.amber : s.fno ? T.green : T.blue;
  const heading = !s.known ? "Shortability unknown" : s.fno ? "F&O — can be carried overnight" : "Cash only — same session";

  return (
    <div style={{ fontFamily: T.sans, background: T.raised, border: "1px solid " + T.line,
      borderLeft: "3px solid " + tone, borderRadius: 9, padding: "10px 12px", marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: 1.2, color: tone }}>{heading.toUpperCase()}</span>
        {s.known && s.fno && s.lotSize != null && (
          <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.ink }}>lot {s.lotSize}</span>
        )}
      </div>

      {/* The server's own wording. It explains the consequence, not just the flag. */}
      {s.note && <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: 5 }}>{s.note}</div>}

      {!s.known && (
        <div style={{ fontSize: 11.5, color: T.amber, lineHeight: 1.6, marginTop: 5 }}>
          The F&amp;O list could not be fetched, so this is unverified either way — not a finding that the stock is
          cash-only. Check with your broker before placing anything overnight.
        </div>
      )}

      {/* The clamp is a server decision, and the reason belongs on screen with
          it: otherwise a horizon that silently shrank looks like a bug. */}
      {clamped && (
        <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid " + T.line }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.blue }}>
            HORIZON {String(clamped.from || "").toUpperCase()} → {String(clamped.to || "").toUpperCase()}
          </div>
          {clamped.why && <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: 4 }}>{clamped.why}</div>}
        </div>
      )}

      {s.known && s.fno && s.maxHorizon && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 6 }}>
          max horizon {s.maxHorizon}
        </div>
      )}
    </div>
  );
}

/* The timeframe a short can actually be held. A clamp overrides the profile's
   horizon outright — showing the profile's would describe a trade that cannot
   be placed. */
export function shortHorizon(row, timeframeLabel) {
  const c = row?.horizonClamped;
  if (c?.to) return timeframeLabel(c.to) || c.to;
  return null;
}
