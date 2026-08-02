"use client";
import React, { useState } from "react";

/* ================================================================
   THE DECISION SURFACE — potential, confidence, exit ladder.

   Presentational only: every number arrives from the backend, which is
   the only place an analog sample or a confidence component can be
   computed honestly. What this file owns is the refusal to mis-state
   them — a range never collapses to a single number, a score never
   appears without its band and its breakdown, an exhausted setup and a
   sub-1:1 rung are as loud as an attractive one.

   Shapes: docs/FRONTEND_CONTRACT.md § 3.
   ================================================================ */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dim: "#63665381", dimSolid: "#636653",
  brass: "#C9A961", brassDeep: "#A8863F", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", amber: "#D8B25C", blue: "#7FA6CE",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

const BAND_COLOR = { High: T.green, Moderate: T.brass, Low: T.amber, Speculative: T.red };
const pct = (v, sign = true) => (v == null || Number.isNaN(+v) ? "—" : `${sign && +v > 0 ? "+" : ""}${(+v).toFixed(1)}%`);
const rupee = v => (v == null ? "—" : "₹" + (+v).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

/* ── confidence ────────────────────────────────────────────────────
   The score is never the whole story: the band names it in words, and
   the breakdown — including every cap the backend applied — is one tap
   away. A bare 61 tells the user nothing about why. */
export function ConfidenceDial({ confidence, compact }) {
  const [open, setOpen] = useState(false);
  if (!confidence) return null;
  const { score, band, components = [] } = confidence;
  const colour = BAND_COLOR[band] || T.mute;
  const caps = components.filter(c => c.cap);

  return (
    <div style={{ minWidth: compact ? 0 : 150 }}>
      <button onClick={() => setOpen(o => !o)}
        title="Tap for the component breakdown"
        style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: T.mono, fontSize: compact ? 12 : 14, color: colour }}>{score}</span>
          <span style={{ fontSize: 11, color: colour }}>{band}</span>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, marginLeft: "auto" }}>
            {open ? "hide ▴" : "why ▾"}
          </span>
        </div>
        {/* the bar is decoration for the number, never a substitute for it */}
        <div style={{ height: 4, borderRadius: 3, background: T.lineSoft, marginTop: 5, overflow: "hidden" }}>
          <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: "100%", background: colour, opacity: .8 }} />
        </div>
        {caps.length > 0 && !open && (
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.amber, marginTop: 4 }}>⚑ {caps[0].cap}</div>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 8, background: T.raised, border: "1px solid " + T.line, borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.dimSolid, marginBottom: 6 }}>
            WHAT MAKES UP {score}
          </div>
          {components.map(c => (
            <div key={c.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0" }}>
              <span style={{ fontSize: 11.5, color: T.mute }}>{c.label}</span>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: c.contribution >= 0 ? T.green : T.red, whiteSpace: "nowrap" }}>
                {c.contribution > 0 ? "+" : ""}{c.contribution}
              </span>
            </div>
          ))}
          {caps.map(c => (
            <div key={"cap" + c.label} style={{ fontSize: 10.5, color: T.amber, marginTop: 6, lineHeight: 1.5 }}>⚑ {c.cap}</div>
          ))}
          {!components.length && <div style={{ fontSize: 11, color: T.dimSolid }}>The backend sent no breakdown for this score.</div>}
        </div>
      )}
    </div>
  );
}

/* ── potential ─────────────────────────────────────────────────────
   Always a range, always with n, always hedged as an estimate. When the
   backend says the history is too thin, no percentage is printed at all. */
export function PotentialLine({ movedPct, potential }) {
  if (!potential) return null;
  const { lowPct, highPct, n, insufficientHistory, exhausted, basis } = potential;
  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: movedPct >= 0 ? T.green : T.red }}>
          moved {pct(movedPct)}
        </span>
        {insufficientHistory ? (
          <span style={{ fontSize: 11.5, color: T.dimSolid }}>
            not enough history to estimate — showing volatility bounds only
          </span>
        ) : (
          <>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>
              est. {pct(lowPct)}–{pct(highPct, false)} remaining
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>
              n={n ?? 0}{basis ? ` ${basis}` : " analogs"} · typical, not a target
            </span>
          </>
        )}
      </div>
      {exhausted && (
        <div style={{ marginTop: 7, background: T.amber + "14", border: "1px solid " + T.amber + "55",
          borderLeft: "3px solid " + T.amber, borderRadius: 7, padding: "8px 11px", fontSize: 12, color: T.amber, lineHeight: 1.5 }}>
          This setup&apos;s typical move has already happened — little estimated upside remains.
        </div>
      )}
    </div>
  );
}

/* ── exit ladder ───────────────────────────────────────────────────
   A scale from stop to stretch with the current price marked, so where a
   position sits in its own range is obvious without reading numbers.
   Sub-1:1 rungs are red: the app has to be as loud about a bad reward
   for the risk as about a good one. */
const LEVEL_COLOR = { stop: T.red, safe: T.green, primary: T.brass, stretch: T.blue };

export function ExitLadder({ ladder, currentPrice, inline }) {
  const [openRung, setOpenRung] = useState(null);
  if (!ladder?.length) return null;

  const prices = ladder.map(l => l.pricePoint).filter(Number.isFinite);
  const lo = Math.min(...prices, currentPrice ?? Infinity);
  const hi = Math.max(...prices, currentPrice ?? -Infinity);
  const at = p => (hi === lo ? 50 : ((p - lo) / (hi - lo)) * 100);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.dimSolid, marginBottom: 8 }}>EXIT LADDER</div>

      {/* the scale */}
      <div style={{ position: "relative", height: 26, marginBottom: 10 }}>
        <div style={{ position: "absolute", top: 11, left: 0, right: 0, height: 2, background: T.lineSoft, borderRadius: 2 }} />
        {ladder.map(l => (
          <div key={l.level} title={`${l.level} · ${rupee(l.pricePoint)}`}
            style={{ position: "absolute", top: 6, left: `calc(${at(l.pricePoint)}% - 4px)`, width: 8, height: 12,
              borderRadius: 2, background: LEVEL_COLOR[l.level] || T.mute }} />
        ))}
        {Number.isFinite(currentPrice) && (
          <div title={`now ${rupee(currentPrice)}`}
            style={{ position: "absolute", top: 0, left: `calc(${at(currentPrice)}% - 1px)`, width: 2, height: 24, background: T.ink }} />
        )}
      </div>

      {/* the rungs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {ladder.map(l => {
          const poor = l.rr != null && l.rr < 1;
          const show = inline || openRung === l.level;
          return (
            <div key={l.level} style={{ background: T.card, border: "1px solid " + (poor ? T.red + "44" : T.line), borderRadius: 8, padding: "8px 10px" }}>
              <button onClick={() => setOpenRung(o => (o === l.level ? null : l.level))}
                style={{ all: "unset", cursor: inline ? "default" : "pointer", width: "100%", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1, color: LEVEL_COLOR[l.level] || T.mute, minWidth: 54 }}>
                  {String(l.level).toUpperCase()}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>{rupee(l.pricePoint)}</span>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: l.pct >= 0 ? T.green : T.red }}>{pct(l.pct)}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10.5, color: poor ? T.red : T.dimSolid, marginLeft: "auto" }}>
                  {l.rr == null ? "" : `R:R ${l.rr.toFixed(1)}${poor ? " · risk exceeds reward" : ""}`}
                </span>
                {!inline && <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid }}>{show ? "▴" : "▾"}</span>}
              </button>
              {show && l.rationale && (
                <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: 6 }}>{l.rationale}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── the whole strip ───────────────────────────────────────────────
   What the user opens the app to read, in the order they need it. */
export function DecisionStrip({ decision, currentPrice, inline }) {
  if (!decision) return null;
  const { movedPct, potential, confidence, ladder, suggestion, lagDisclosure } = decision;
  return (
    <div style={{ fontFamily: T.sans }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: "1 1 260px" }}><PotentialLine movedPct={movedPct} potential={potential} /></div>
        <ConfidenceDial confidence={confidence} />
      </div>

      {/* Delayed-feed lag is a line on the card, never a tooltip: a move
          that already happened is the most expensive thing to miss. */}
      {lagDisclosure && (
        <div style={{ marginTop: 8, fontFamily: T.mono, fontSize: 10.5, color: T.amber }}>⏱ {lagDisclosure}</div>
      )}

      <ExitLadder ladder={ladder} currentPrice={currentPrice} inline={inline} />

      {suggestion && (
        <div style={{ marginTop: 10, background: T.raised, borderLeft: "3px solid " + T.brass, borderRadius: 7, padding: "10px 12px" }}>
          <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.65 }}>{suggestion}</div>
          <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 6 }}>
            Decision support — not an instruction. The call is yours.
          </div>
        </div>
      )}
    </div>
  );
}

export const DECISION_T = T;
