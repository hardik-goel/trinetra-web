"use client";
import React, { useMemo, useState, useEffect } from "react";

/* ================================================================
   WHAT THE ENGINE COULD NOT JUDGE, SAID ONCE.

   The old panel printed one sentence per stock per criterion — seven
   near-identical lines, none of them naming the stock they came from,
   because the warning text is per-stock context that aggregation drops.
   Seven sentences that look the same and identify nothing get read as
   one sentence and then ignored.

   So: group by (code, criterion), count the stocks, list them behind an
   expander. The symbol comes from the row the warning arrived on, not
   from the text.

   Dismissal is keyed on `code` + criterion, never on the string. The
   backend rewords these, and a string-keyed dismissal would silently
   resurrect every time a sentence changed — which is the worst outcome:
   the user thinks they have dealt with it and it reappears looking new.
   ================================================================ */

const T = {
  card: "#1A1C13", raised: "#20221799", line: "#2A2D1F",
  ink: "#EAE7DB", mute: "#9C9F8B", dimSolid: "#636653",
  brass: "#C9A961", amber: "#D8B25C", red: "#DC6A58",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

const KEY = "trinetra.dismissedWarnings";

/* One line per group, written here because the per-stock sentence cannot be
   reused once the stocks are aggregated. */
const headline = (g) => {
  const n = g.symbols.length;
  const stocks = `${n} stock${n === 1 ? "" : "s"}`;
  const metrics = g.metrics.length ? ` (${g.metrics.join(", ")})` : "";
  switch (g.code) {
    case "criterion_no_data":
      return `${g.criterion} could not be judged at all — ${stocks}${metrics}`;
    case "criterion_partial":
      return `${g.criterion} judged on partial data — ${stocks}${metrics}`
        + (g.judged != null && g.of != null ? ` · ${g.judged} of ${g.of} checks` : "");
    case "withheld_missing_data":
      return `Withheld for missing data — ${stocks}${metrics}`;
    default:
      return `${g.criterion || g.code} — ${stocks}${metrics}`;
  }
};

export default function DataWarnings({ lockInfo }) {
  const [dismissed, setDismissed] = useState(null);   // null until read

  useEffect(() => {
    let v = [];
    try { v = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
    setDismissed(Array.isArray(v) ? v : []);
  }, []);

  const groups = useMemo(() => {
    const m = new Map();
    for (const [symbol, info] of Object.entries(lockInfo || {})) {
      for (const w of info?.warningsDetail || []) {
        const key = `${w.code}::${w.criterion || ""}`;
        const g = m.get(key) || {
          key, code: w.code, criterion: w.criterion, severity: w.severity,
          judged: w.judged, of: w.of, metrics: [], symbols: [],
        };
        for (const mt of w.metrics || []) if (!g.metrics.includes(mt)) g.metrics.push(mt);
        if (!g.symbols.includes(symbol)) g.symbols.push(symbol);
        m.set(key, g);
      }
    }
    return [...m.values()].sort((a, b) => b.symbols.length - a.symbols.length);
  }, [lockInfo]);

  const [open, setOpen] = useState({});
  if (dismissed === null) return null;                // avoid a flash before the read

  const live = groups.filter(g => !dismissed.includes(g.key));
  const hiddenCount = groups.length - live.length;

  const dismiss = (key) => {
    const next = [...dismissed, key];
    setDismissed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };
  const restore = () => {
    setDismissed([]);
    try { localStorage.removeItem(KEY); } catch {}
  };

  if (!live.length) {
    return hiddenCount ? (
      <div style={{ fontFamily: T.sans, fontSize: 10.5, color: T.dimSolid, marginBottom: 10 }}>
        {hiddenCount} data warning{hiddenCount === 1 ? "" : "s"} hidden ·{" "}
        <button onClick={restore} style={{ all: "unset", cursor: "pointer", color: T.brass, textDecoration: "underline" }}>show</button>
      </div>
    ) : null;
  }

  return (
    <div style={{ fontFamily: T.sans, background: T.amber + "10", border: "1px solid " + T.amber + "44",
      borderRadius: 9, padding: "9px 12px", marginBottom: 10 }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.amber, marginBottom: 6 }}>
        NOT FULLY JUDGED — {live.length}
      </div>

      {live.map(g => (
        <div key={g.key} style={{ marginBottom: 5 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: g.severity === "error" ? T.red : T.amber, lineHeight: 1.55, flex: 1, minWidth: 200 }}>
              ⚠ {headline(g)}
            </span>
            <button onClick={() => setOpen(o => ({ ...o, [g.key]: !o[g.key] }))}
              style={{ all: "unset", cursor: "pointer", fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>
              {open[g.key] ? "hide" : "which"}
            </button>
            {/* Keyed on code + criterion. The wording can change underneath
                this without the dismissal coming undone. */}
            <button onClick={() => dismiss(g.key)} title="Hide this warning on this device"
              style={{ all: "unset", cursor: "pointer", fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>
              dismiss
            </button>
          </div>
          {open[g.key] && (
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.mute, lineHeight: 1.7, marginTop: 3, wordBreak: "break-word" }}>
              {g.symbols.join(" · ")}
            </div>
          )}
        </div>
      ))}

      {hiddenCount > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, marginTop: 6 }}>
          {hiddenCount} dismissed ·{" "}
          <button onClick={restore} style={{ all: "unset", cursor: "pointer", color: T.brass, textDecoration: "underline" }}>restore</button>
        </div>
      )}
    </div>
  );
}
