"use client";
import React, { useState } from "react";
import { bandLabel, ladderOf, potentialText, pctText, rupee, noRoomOf, withheldOf } from "../lib/desk";

/* ================================================================
   THE DECISION SURFACE — potential, confidence, exit ladder.

   Presentational only: every number arrives from the backend, the only
   place an analog sample or a capped confidence score can be computed
   honestly. What this file owns is the refusal to mis-state them.

   The rules API.md calls non-optional, enforced here rather than left
   to whoever writes the copy:
     · potential is a range with its n, or it is not a number at all
     · null potential (longterm) says why, instead of rendering blank
     · insufficientHistory shows bounds and basis, never a made-up range
     · exhausted leads, above the fold
     · converged renders ONE target, not three identical ones
     · a score never appears without its band and its caps
     · sub-1:1 risk-reward is as loud as an attractive setup
   ================================================================ */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dim: "#63665381", dimSolid: "#636653",
  brass: "#C9A961", green: "#86C08A", red: "#DC6A58", amber: "#D8B25C", blue: "#7FA6CE",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
export const DECISION_T = T;

const BAND_COLOR = { high: T.green, moderate: T.brass, low: T.amber, speculative: T.red };
const LEVEL_COLOR = { stop: T.red, safe: T.green, primary: T.brass, stretch: T.blue };

/* ── confidence ──────────────────────────────────────────────────── */
export function ConfidenceDial({ confidence }) {
  const [open, setOpen] = useState(false);
  if (!confidence) return null;
  const { score, band, components = [], caps = [], summary } = confidence;
  const colour = BAND_COLOR[String(band).toLowerCase()] || T.mute;

  return (
    <div style={{ minWidth: 168 }}>
      <button onClick={() => setOpen(o => !o)} title="What makes up this score"
        style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: T.mono, fontSize: 14, color: colour }}>{score}</span>
          <span style={{ fontSize: 11.5, color: colour }}>{bandLabel(band)}</span>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, marginLeft: "auto" }}>{open ? "hide ▴" : "why ▾"}</span>
        </div>
        <div style={{ height: 4, borderRadius: 3, background: T.lineSoft, marginTop: 5, overflow: "hidden" }}>
          <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: "100%", background: colour, opacity: .85 }} />
        </div>
        {/* A cap is why nothing ever scores high — it belongs beside the score,
            not hidden behind the expander. */}
        {caps.length > 0 && (
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.amber, marginTop: 4, lineHeight: 1.5 }}>
            ⚑ {caps.join(" · ")}
          </div>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 8, background: T.raised, border: "1px solid " + T.line, borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.dimSolid, marginBottom: 6 }}>WHAT MAKES UP {score}</div>
          {components.map((c, i) => (
            <div key={(c.name || i) + i} style={{ padding: "3px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 11.5, color: T.mute }}>{c.name}</span>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: c.contribution >= 0 ? T.green : T.red, whiteSpace: "nowrap" }}>
                  {c.contribution > 0 ? "+" : ""}{c.contribution}
                </span>
              </div>
              {c.note && <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.5 }}>{c.note}</div>}
            </div>
          ))}
          {!components.length && <div style={{ fontSize: 11, color: T.dimSolid }}>No breakdown was sent for this score.</div>}
          {summary && <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: 7, borderTop: "1px solid " + T.lineSoft, paddingTop: 7 }}>{summary}</div>}
        </div>
      )}
    </div>
  );
}

/* ── potential ───────────────────────────────────────────────────── */
export function PotentialLine({ potential, horizon, signalPrice }) {
  const p = potentialText(potential, horizon);
  const moved = potential?.movedAlreadyPct;
  const basis = potential?.basisPrice;
  /* Only worth saying when it is not the price the analysis ran at. On an
     untriggered setup the percentages describe a move from the trigger, and
     read against spot they describe a trade the entry rule forbids.

     Compared against the payload's own price, not a live one: a tick of drift
     is not a different basis, and a line that fires on drift trains the reader
     to ignore it on the day it matters. */
  const basisDiffers = basis != null && Number.isFinite(signalPrice)
    && Math.abs(basis - signalPrice) / signalPrice > 0.0025;

  return (
    <div>
      {/* exhausted leads — the user must meet it before the numbers */}
      {potential?.exhausted && (
        <div style={{ marginBottom: 8, background: T.amber + "14", border: "1px solid " + T.amber + "55",
          borderLeft: "3px solid " + T.amber, borderRadius: 7, padding: "8px 11px", fontSize: 12, color: T.amber, lineHeight: 1.5 }}>
          This setup&apos;s typical move has already happened — little estimated upside remains.
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        {moved != null && (
          <span style={{ fontFamily: T.mono, fontSize: 12, color: moved >= 0 ? T.green : T.red }}>moved {pctText(moved)}</span>
        )}
        {p.kind === "range" ? (
          <>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>
              est. {pctText(p.low)}–{pctText(p.high, false)} remaining
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>
              n={p.n} analogs · typically, not a target
            </span>
          </>
        ) : (
          <span style={{ fontSize: 11.5, color: T.dimSolid, lineHeight: 1.5 }}>{p.text}</span>
        )}
      </div>

      {/* Only when real numbers came back — the backend often states the bounds
          inside `basis` instead, and "—–—" is worse than saying nothing. */}
      {p.kind === "thin" && Number.isFinite(p.bounds?.low) && Number.isFinite(p.bounds?.high) && (
        <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.mute, marginTop: 4 }}>
          volatility bounds {pctText(p.bounds.low)}–{pctText(p.bounds.high, false)}
        </div>
      )}
      {/* Which price the percentages above are measured from. Stated, not
          assumed: reading them against spot on an untriggered setup describes
          buying now, which is the trade the entry rule exists to prevent. */}
      {basisDiffers && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 4 }}>
          measured from {rupee(basis)} — the price this trade starts at, not the {rupee(signalPrice)} it is trading at
        </div>
      )}

      {(p.basis || potential?.basis) && (
        <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.55, marginTop: 5 }}>{p.basis || potential.basis}</div>
      )}

      {/* `cappedBy` is "atr" or null and never a resistance level any more.
          Naming the mechanism matters: the analog percentiles already contain
          every wall that existed on those days, so truncating them with a
          structural level double-counted it and collapsed all three tiers onto
          one pivot. Only the volatility ceiling still trims the estimate. */}
      {potential?.cappedBy === "atr" && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 3 }}>
          trimmed to the volatility ceiling (1 ATR) — the analogs reached further than this stock typically moves in the window
        </div>
      )}
      {potential?.cappedBy && potential.cappedBy !== "atr" && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 3 }}>capped by {potential.cappedBy}</div>
      )}

      {/* Context, deliberately NOT a ceiling on the estimate. The engine stopped
          truncating at this level; rendering it as a cap would put back the
          double-count in the reader's head that the backend removed from the
          numbers. */}
      {potential?.resistance?.price != null && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 3 }}>
          {potential.resistance.level || "resistance"} at {rupee(potential.resistance.price)} sits overhead
          <span style={{ color: T.dim }}> · context, not a limit on the estimate</span>
        </div>
      )}
    </div>
  );
}

/* ── a target computed and rejected ──────────────────────────────── */
/* The reason this is a component and not a line of copy: the empty target slot
   and the "no estimate" empty state look identical, and they are opposite
   claims. One means the engine could not measure; this one means it measured
   and the answer was that the trade loses on arithmetic. The server's sentence
   carries both distances, so it is rendered verbatim rather than summarised. */
function NoTargetFinding({ exits }) {
  const [open, setOpen] = useState(false);
  const withheld = withheldOf({ exits });
  const rejected = withheld
    ? ["safe", "primary", "stretch"].map(k => [k, withheld[k]]).filter(([, v]) => v != null)
    : [];

  return (
    <div style={{ marginTop: 12, background: T.red + "12", border: "1px solid " + T.red + "55",
      borderLeft: "3px solid " + T.red, borderRadius: 9, padding: "10px 12px" }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.red, marginBottom: 5 }}>
        NO TARGET OFFERED
      </div>
      <div style={{ fontSize: 12.5, color: T.red, lineHeight: 1.6 }}>
        {exits.riskRewardWarning
          || "A target was computed and rejected for sitting closer than the stop — there is less to gain than to lose on any exit plan."}
      </div>
      <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.55, marginTop: 6 }}>
        The stop below still stands. It is the half of this trade that was never in question.
      </div>
      {rejected.length > 0 && (
        <>
          <button onClick={() => setOpen(o => !o)}
            style={{ all: "unset", cursor: "pointer", fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, marginTop: 6, display: "block" }}>
            {open ? "hide the rejected levels ▴" : "what was rejected ▾"}
          </button>
          {open && (
            <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.dimSolid, lineHeight: 1.7, marginTop: 4 }}>
              {rejected.map(([k, v]) => <div key={k}>{k} {rupee(v)}</div>)}
              <div style={{ color: T.dim, marginTop: 3 }}>
                {withheld.why || "below 1:1 against the stop"} — shown for inspection. Not a target.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── exit ladder ─────────────────────────────────────────────────── */
export function ExitLadder({ exits, currentPrice, inline }) {
  const [openRung, setOpenRung] = useState(null);
  const rungs = ladderOf(exits);
  const noRoom = noRoomOf({ exits });
  /* The finding leads. A stop-only ladder under a silent header reads as a
     rendering gap; it is a conclusion, and it is the one the reader needs. */
  if (!rungs.length) return noRoom ? <NoTargetFinding exits={exits} /> : null;

  const prices = rungs.map(r => r.price).filter(Number.isFinite);
  const lo = Math.min(...prices, Number.isFinite(currentPrice) ? currentPrice : Infinity);
  const hi = Math.max(...prices, Number.isFinite(currentPrice) ? currentPrice : -Infinity);
  const at = p => (hi === lo ? 50 : ((p - lo) / (hi - lo)) * 100);

  return (
    <div style={{ marginTop: 12 }}>
      {/* Above the ladder, because the ladder is now one rung and the reader
          must know why before reading it as a thin one. */}
      {noRoom && <NoTargetFinding exits={exits} />}

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, marginTop: noRoom ? 12 : 0 }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.dimSolid }}>
          {noRoom ? "INVALIDATION" : "EXIT LADDER"}
        </span>
        {!noRoom && exits.converged && (
          <span style={{ fontSize: 10.5, color: T.amber }}>
            resistance sits close overhead — one target, not a choice of three
          </span>
        )}
      </div>

      <div style={{ position: "relative", height: 26, marginBottom: 10 }}>
        <div style={{ position: "absolute", top: 11, left: 0, right: 0, height: 2, background: T.lineSoft, borderRadius: 2 }} />
        {rungs.map(r => (
          <div key={r.key} title={`${r.label} · ${rupee(r.price)}`}
            style={{ position: "absolute", top: 6, left: `calc(${at(r.price)}% - 4px)`, width: 8, height: 12, borderRadius: 2,
              background: LEVEL_COLOR[r.key] || T.mute }} />
        ))}
        {Number.isFinite(currentPrice) && (
          <div title={`now ${rupee(currentPrice)}`}
            style={{ position: "absolute", top: 0, left: `calc(${at(currentPrice)}% - 1px)`, width: 2, height: 24, background: T.ink }} />
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rungs.map(r => {
          const poor = r.rr != null && r.rr < 1;
          const show = inline || openRung === r.key;
          return (
            <div key={r.key} style={{ background: T.card, border: "1px solid " + (poor ? T.red + "55" : T.line), borderRadius: 8, padding: "8px 10px" }}>
              <button onClick={() => setOpenRung(o => (o === r.key ? null : r.key))}
                style={{ all: "unset", cursor: inline ? "default" : "pointer", width: "100%", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1, color: LEVEL_COLOR[r.key] || T.mute, minWidth: 50 }}>
                  {r.label.toUpperCase()}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>{rupee(r.price)}</span>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: r.pct >= 0 ? T.green : T.red }}>{pctText(r.pct)}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10.5, color: poor ? T.red : T.dimSolid, marginLeft: "auto" }}>
                  {r.rr == null ? "" : `R:R ${(+r.rr).toFixed(1)}${poor ? " · risk exceeds reward" : ""}`}
                </span>
                {!inline && r.rationale && <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid }}>{show ? "▴" : "▾"}</span>}
              </button>
              {show && r.rationale && <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: 6 }}>{r.rationale}</div>}
            </div>
          );
        })}
      </div>

      {/* Not when noRoom — the finding above is this same sentence, and saying
          it twice makes the second one read as a second, milder problem. */}
      {!noRoom && exits.riskRewardWarning && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: T.red, lineHeight: 1.5 }}>⚠ {exits.riskRewardWarning}</div>
      )}
    </div>
  );
}

/* ── the strip ───────────────────────────────────────────────────── */
export function DecisionStrip({ signal, currentPrice, inline }) {
  if (!signal) return null;
  const { potential, confidence, exits, horizon, lagDisclosure, eventWarning } = signal;

  return (
    <div style={{ fontFamily: T.sans }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: "1 1 250px" }}>
          <PotentialLine potential={potential} horizon={horizon} signalPrice={signal.price ?? currentPrice} />
        </div>
        <ConfidenceDial confidence={confidence} />
      </div>

      {/* Verbatim, and on the card — not a tooltip. A move already gone is the
          most expensive thing for a delayed feed to hide. */}
      {lagDisclosure && (
        <div style={{ marginTop: 9, fontSize: 11.5, color: T.amber, lineHeight: 1.55, background: T.amber + "0E",
          border: "1px solid " + T.amber + "33", borderRadius: 7, padding: "7px 10px" }}>
          ⏱ {lagDisclosure}
        </div>
      )}
      {eventWarning && (
        <div style={{ marginTop: 7, fontSize: 11.5, color: T.amber, lineHeight: 1.55 }}>⚠ {eventWarning}</div>
      )}

      <ExitLadder exits={exits} currentPrice={currentPrice} inline={inline} />

      {exits?.suggestion && (
        <div style={{ marginTop: 10, background: T.raised, borderLeft: "3px solid " + T.brass, borderRadius: 7, padding: "10px 12px" }}>
          <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.65 }}>{exits.suggestion}</div>
          <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 6 }}>Decision support — not an instruction. The call is yours.</div>
        </div>
      )}
    </div>
  );
}
