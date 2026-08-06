"use client";
import React from "react";

/* ================================================================
   WHAT IS NOT SET UP, AND WHAT IT COSTS YOU.

   Configuration for this app lives in four places — Render's
   environment, the backend's own config, a JSON file in the repo, and
   this browser's localStorage. Nothing has ever told the user which
   pieces are missing, so incomplete setup fails silently: capital sat
   at zero for the entire life of the project, which meant position
   sizing and concentration were switched off, and no screen said so.

   Each row names the consequence, not the setting. "Capital not set"
   is a fact about a form. "Sizing is off" is the reason to care.

   Only ever renders what is genuinely missing. A checklist that stays
   on screen after it is satisfied becomes furniture.
   ================================================================ */

const T = {
  card: "#1A1C13", raised: "#20221799", line: "#2A2D1F",
  ink: "#EAE7DB", mute: "#9C9F8B", dimSolid: "#636653",
  brass: "#C9A961", brassSoft: "#C9A9611F",
  amber: "#D8B25C", red: "#DC6A58", green: "#86C08A",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

export default function SetupCard({ sizing, storage, alertsArmed, holidayCount, capitalHint, onGo }) {
  const gaps = [];

  if (!sizing || !(sizing.capital > 0)) {
    gaps.push({
      id: "positions", severity: "high",
      what: "Capital is not set",
      cost: "Position sizing and concentration limits are switched off — every sizing number reads blank rather than wrong, so it is easy to miss.",
      action: "Set capital",
    });
  }

  if (storage && storage.mode !== "durable") {
    gaps.push({
      id: null, severity: "high",
      what: storage.mode === "degraded" ? "The backup has stopped saving" : "Nothing is being saved",
      cost: storage.detail || "Everything accrued is lost on the next redeploy.",
      action: null,
    });
  }

  if (alertsArmed === false) {
    gaps.push({
      id: "alerts", severity: "medium",
      what: "Alerts are not armed",
      cost: "Signals fire server-side and are recorded, but nothing reaches you until you open the app.",
      action: "Arm alerts",
    });
  }

  /* NSE's moving holidays are hand-maintained. Without them the alert window
     believes a closed market is open, which is a wrong answer rather than a
     missing one. */
  if (holidayCount != null && holidayCount < 8) {
    gaps.push({
      id: null, severity: "medium",
      what: `Only ${holidayCount} market holiday${holidayCount === 1 ? "" : "s"} loaded`,
      cost: "NSE's moving holidays are hand-entered. Alerts can fire on a closed market on Diwali, Holi and the rest.",
      action: null,
    });
  }

  if (!gaps.length) return null;

  const worst = gaps.some(g => g.severity === "high") ? T.red : T.amber;

  return (
    <div style={{ fontFamily: T.sans, background: T.raised, border: "1px solid " + worst + "3A",
      borderLeft: "3px solid " + worst, borderRadius: 10, padding: "11px 13px", marginBottom: 12 }}>
      <div style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: 1.3, color: worst, marginBottom: 7 }}>
        NOT SET UP — {gaps.length}
      </div>
      {gaps.map((g, i) => (
        <div key={g.what} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap",
          paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0, borderTop: i ? "1px solid " + T.line : "none" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12.5, color: T.ink }}>{g.what}</div>
            <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.55, marginTop: 2 }}>{g.cost}</div>
          </div>
          {g.action && g.id && onGo && (
            <button onClick={() => onGo(g.id)} style={{ padding: "5px 10px", borderRadius: 7,
              border: "1px solid " + T.brass, background: "transparent", color: T.brass,
              fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>{g.action}</button>
          )}
        </div>
      ))}
    </div>
  );
}
