"use client";
import React from "react";
import PraveshPanel, { DoorGlyph, PRAVESH_T as T } from "./PraveshPanel";

/* ================================================================
   PRAVESH — standalone page shell (/pravesh).
   The feature itself lives in PraveshPanel, which is the same body
   the screener mounts in its "Pravesh" drawer. One implementation,
   two frames — a deep link and a tab can never drift apart.
   ================================================================ */

const css = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 8px; height: 8px; } ::-webkit-scrollbar-thumb { background: ${T.line}; border-radius: 8px; }
`;

const chip = {
  padding: "8px 13px", borderRadius: 8, border: "1px solid " + T.line,
  background: T.card, color: T.mute, fontSize: 12.5,
  display: "flex", alignItems: "center", gap: 6, textDecoration: "none",
};

export default function Pravesh() {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: T.sans }}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <header style={{ position: "sticky", top: 0, zIndex: 20, background: T.bg + "F0",
        borderBottom: "1px solid " + T.line, backdropFilter: "blur(10px)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "12px 16px", display: "flex",
          alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 30, height: 30, borderRadius: 99, border: "1px solid " + T.brass + "55",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <DoorGlyph size={14} />
            </div>
            <div>
              <div style={{ fontFamily: T.serif, fontSize: 22, lineHeight: .9 }}>Pravesh</div>
              <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: 2, color: T.dimSolid }}>
                IPO INTELLIGENCE · EVIDENCE FIRST
              </div>
            </div>
          </div>
          <a href="/" style={chip}>← Screener</a>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "16px 16px 80px" }}>
        <PraveshPanel />
      </main>
    </div>
  );
}
