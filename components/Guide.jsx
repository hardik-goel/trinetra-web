"use client";
import React, { useState } from "react";
import { GUIDE, GUIDE_INTRO } from "../lib/guide";

/* One renderer, two homes: the Help drawer and /docs. If the manual lived in
   two places it would be wrong in one of them within a week. */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dimSolid: "#636653", brass: "#C9A961", brassSoft: "#C9A9611F",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

export default function Guide({ page }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const sections = GUIDE
    .map(s => ({
      ...s,
      items: needle
        ? s.items.filter(([t, b]) => (t + " " + b).toLowerCase().includes(needle))
        : s.items,
    }))
    .filter(s => !needle || s.items.length || s.title.toLowerCase().includes(needle));

  return (
    <div style={{ fontFamily: T.sans, color: T.ink, maxWidth: page ? 780 : "none", margin: page ? "0 auto" : 0 }}>
      {page && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: T.serif, fontSize: 34, lineHeight: 1 }}>Trinetra — the manual</div>
          <div style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: 2, color: T.brass, marginTop: 7 }}>
            HOW TO NAVIGATE IT, AND WHAT IT REFUSES TO DO
          </div>
        </div>
      )}
      <p style={{ fontSize: 13, color: T.mute, lineHeight: 1.7, marginTop: 0 }}>{GUIDE_INTRO}</p>

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the manual"
        style={{ background: T.bg, border: "1px solid " + T.line, color: T.ink, fontFamily: T.sans,
          fontSize: 12.5, borderRadius: 7, padding: "8px 10px", width: "100%", margin: "6px 0 14px" }} />

      {!needle && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {GUIDE.map(s => (
            <a key={s.id} href={`#${s.id}`} style={{ textDecoration: "none", padding: "5px 10px", borderRadius: 7,
              border: "1px solid " + T.line, background: T.card, color: T.mute, fontSize: 11.5 }}>{s.title}</a>
          ))}
        </div>
      )}

      {sections.map(s => (
        <section key={s.id} id={s.id} style={{ marginBottom: 22, scrollMarginTop: 12 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, color: T.brass, textTransform: "uppercase", marginBottom: 8 }}>
            {s.title}
          </div>
          {s.lede && <p style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.7, margin: "0 0 12px" }}>{s.lede}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {s.items.map(([title, body]) => (
              <div key={title} style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 10, padding: "11px 13px" }}>
                <div style={{ fontSize: 12.5, color: T.ink, fontWeight: 600, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.7 }}>{body}</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {!sections.length && <div style={{ fontSize: 12.5, color: T.dimSolid }}>Nothing in the manual matches “{q}”.</div>}

      <p style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.6, marginTop: 20, textAlign: "center" }}>
        Decision support, not investment advice. Markets carry risk of loss —
        <span style={{ color: T.brass }}> the call is always yours.</span>
        {!page && <> · The same manual lives at <span style={{ fontFamily: T.mono }}>/docs</span>.</>}
      </p>
    </div>
  );
}
