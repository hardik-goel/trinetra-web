"use client";
import React from "react";

/* ================================================================
   THE ORIGINAL FOUR — the criteria this app was commissioned against,
   in the words they were asked for.

   Everything since — extra profiles, extended fundamentals, the trim
   and buy-back criteria — is scaffolding around these. They stay
   pinned at the top of the Criteria panel so the instrument's purpose
   cannot drift out of view again.

   The mapping to engine ids is here rather than inferred, and the live
   status is read from the criteria the engine actually holds, so this
   block can never describe something the engine is not doing.
   ================================================================ */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dimSolid: "#636653",
  brass: "#C9A961", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", amber: "#D8B25C",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

/* Verbatim from the original brief. The phrase is the contract; the id is
   how the engine happens to spell it today. */
export const ORIGINAL_FOUR = [
  { originalIndex: 1, phrase: "Fundamentally strong", id: "fund" },
  { originalIndex: 2, phrase: "Breakout", id: "brk" },
  { originalIndex: 3, phrase: "Volume shockers", id: "vol" },
  { originalIndex: 4, phrase: "Buyers and sellers count and percentage", id: "flow",
    needsLive: true,
    dormantReason: "order-book depth is paid exchange data — unavailable on the free delayed feed" },
];

const OPS = { gte: "≥", lte: "≤" };

export default function OriginalFour({ criteria, metricLabel, delayed, onRestore, restoring }) {
  const byId = Object.fromEntries((criteria || []).map(c => [c.id, c]));

  return (
    <div style={{ fontFamily: T.sans, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.brass }}>THE ORIGINAL FOUR</span>
        <span style={{ fontSize: 10.5, color: T.dimSolid }}>what this app was built to watch</span>
        {onRestore && (
          <button onClick={onRestore} disabled={restoring} style={{
            marginLeft: "auto", padding: "5px 10px", borderRadius: 7, border: "1px solid " + T.brass,
            background: "transparent", color: T.brass, fontSize: 11, cursor: "pointer", opacity: restoring ? .5 : 1 }}>
            {restoring ? "Restoring…" : "Restore the original four"}
          </button>
        )}
      </div>

      <div style={{ border: "1px solid " + T.brass + "3A", borderRadius: 11, padding: 4, background: T.brassSoft }}>
        {ORIGINAL_FOUR.map(o => {
          const c = byId[o.id];
          /* Three states, and the difference matters: dormant is not failing.
             Criterion 4 has no data on a delayed feed and is excluded from the
             lock entirely — surfaced here so the user can see that is by design. */
          const dormant = o.needsLive && delayed;
          const status = dormant ? "awaiting live data (Kite)"
            : !c ? "not in the current set"
            : c.enabled ? "active" : "disabled by you";
          const colour = dormant ? T.amber : !c ? T.red : c.enabled ? T.green : T.dimSolid;

          return (
            <div key={o.id} style={{ display: "flex", gap: 11, padding: "10px 11px",
              borderBottom: o.originalIndex < 4 ? "1px solid " + T.lineSoft : "none" }}>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.brass, minWidth: 14 }}>{o.originalIndex}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: T.ink }}>{o.phrase}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: .8, color: colour,
                    border: "1px solid " + colour + "55", borderRadius: 4, padding: "1px 5px" }}>
                    {status}
                  </span>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 4, lineHeight: 1.6 }}>
                  {c
                    ? <>{c.id} · {(c.checks || []).map(ch => `${metricLabel(ch.metric)} ${OPS[ch.op] || ch.op} ${ch.value}`).join(" · ") || "no checks"}</>
                    : "no criterion with this id in the active set"}
                </div>
                {dormant && (
                  <div style={{ fontSize: 10.5, color: T.amber, marginTop: 4, lineHeight: 1.55 }}>
                    {o.dormantReason}. It is dormant, not failing — excluded from the lock, so it can never block a signal.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
