"use client";
import React, { useEffect, useMemo, useState } from "react";
import { deskApi } from "../lib/desk";

/* ================================================================
   Per-profile criteria editor. The engine reads config.profiles, so
   editing one flat list was editing something nothing consumed.
   One horizon at a time, saved to that horizon.
   ================================================================ */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dimSolid: "#636653", brass: "#C9A961", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", amber: "#D8B25C",
  mono: "'IBM Plex Mono', ui-monospace, monospace", sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
const chip = a => ({ padding: "5px 10px", borderRadius: 8, border: "1px solid " + (a ? T.brass + "55" : T.line),
  background: a ? T.brassSoft : T.card, color: a ? T.ink : T.mute, fontSize: 11.5, cursor: "pointer" });
const btn = p => ({ padding: "7px 12px", borderRadius: 7, border: "1px solid " + (p ? T.brass : T.line),
  background: p ? T.brass : "transparent", color: p ? "#141206" : T.mute, fontSize: 11.5, fontWeight: p ? 600 : 400, cursor: "pointer" });
const inS = { background: T.bg, border: "1px solid " + T.line, color: T.ink, fontFamily: T.mono, fontSize: 11, borderRadius: 6, padding: "6px 8px" };

export default function ProfileCriteria({ backendUrl, profiles, metricOptions, metricLabel, onSaved }) {
  const api = useMemo(() => (backendUrl ? deskApi(backendUrl) : null), [backendUrl]);
  const ids = Object.keys(profiles || {});
  const [sel, setSel] = useState(ids[0] || "swing");
  const [draft, setDraft] = useState(null);
  const [state, setState] = useState({ busy: false, msg: "" });

  useEffect(() => {
    const p = profiles?.[sel];
    setDraft(p ? JSON.parse(JSON.stringify(p.criteria || [])) : null);
    setState({ busy: false, msg: "" });
  }, [sel, profiles]);

  if (!profiles || !draft) return null;
  const up = (i, fn) => setDraft(d => d.map((c, j) => (j === i ? fn(c) : c)));

  const save = async () => {
    setState({ busy: true, msg: "" });
    try {
      await api.patchProfile(sel, { criteria: draft });
      setState({ busy: false, msg: `Saved to ${profiles[sel].name || sel}. The scan uses it from the next refresh.` });
      onSaved?.();
    } catch (e) { setState({ busy: false, msg: e.message || "Could not save" }); }
  };

  return (
    <div style={{ fontFamily: T.sans }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {ids.map(id => (
          <button key={id} onClick={() => setSel(id)} style={chip(sel === id)}>
            {profiles[id].name || id}
            <span style={{ fontFamily: T.mono, color: T.dimSolid, marginLeft: 5 }}>{(profiles[id].criteria || []).length}</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.dimSolid, lineHeight: 1.55, marginBottom: 10 }}>
        Each horizon is scanned independently — a breakout that matters over five sessions is noise over five years.
        {sel === "intraday" && " Intraday runs on the delayed feed with confidence capped at 55."}
      </div>

      {draft.map((c, i) => (
        <div key={c.id || i} style={{ border: "1px solid " + (c.enabled ? T.line : T.lineSoft), borderRadius: 10, padding: 11, marginBottom: 8, opacity: c.enabled ? 1 : .6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input value={c.name || ""} onChange={e => up(i, x => ({ ...x, name: e.target.value }))} style={{ ...inS, flex: 1, fontFamily: T.sans, fontSize: 12.5 }} />
            <button onClick={() => up(i, x => ({ ...x, enabled: !x.enabled }))}
              style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid " + (c.enabled ? T.green : T.dimSolid),
                background: "none", color: c.enabled ? T.green : T.dimSolid, fontFamily: T.mono, fontSize: 10.5, cursor: "pointer" }}>
              {c.enabled ? "ON" : "OFF"}
            </button>
            <button onClick={() => setDraft(d => d.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: T.dimSolid, cursor: "pointer" }}>✕</button>
          </div>
          {(c.checks || []).map((ch, k) => (
            <div key={k} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <select value={ch.metric} onChange={e => up(i, x => ({ ...x, checks: x.checks.map((y, j) => j === k ? { ...y, metric: e.target.value } : y) }))} style={{ ...inS, flex: 1 }}>
                {metricOptions.map(id => <option key={id} value={id}>{metricLabel(id)}</option>)}
              </select>
              <select value={ch.op} onChange={e => up(i, x => ({ ...x, checks: x.checks.map((y, j) => j === k ? { ...y, op: e.target.value } : y) }))} style={inS}>
                <option value="gte">≥</option><option value="lte">≤</option>
              </select>
              <input type="number" step="any" value={ch.value}
                onChange={e => up(i, x => ({ ...x, checks: x.checks.map((y, j) => j === k ? { ...y, value: +e.target.value } : y) }))}
                style={{ ...inS, width: 70, textAlign: "right" }} />
              <button onClick={() => up(i, x => ({ ...x, checks: x.checks.filter((_, j) => j !== k) }))}
                style={{ background: "none", border: "none", color: T.dimSolid, cursor: "pointer" }}>✕</button>
            </div>
          ))}
          <button onClick={() => up(i, x => ({ ...x, checks: [...(x.checks || []), { metric: metricOptions[0], op: "gte", value: 0 }] }))}
            style={{ background: "none", border: "none", color: T.brass, fontFamily: T.mono, fontSize: 10.5, cursor: "pointer", padding: 0 }}>+ add check</button>
        </div>
      ))}

      <button onClick={() => setDraft(d => [...d, { id: "c" + Date.now(), key: "·", name: "New criterion", enabled: true, checks: [{ metric: metricOptions[0], op: "gte", value: 0 }] }])}
        style={{ padding: 10, borderRadius: 9, border: "1px dashed " + T.brass + "55", background: "none", color: T.brass, fontSize: 12.5, width: "100%", cursor: "pointer" }}>
        + New criterion
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <button onClick={save} disabled={state.busy} style={{ ...btn(true), opacity: state.busy ? .5 : 1 }}>
          {state.busy ? "Saving…" : `Save ${profiles[sel].name || sel}`}
        </button>
        {state.msg && <span style={{ fontSize: 11, color: /could not|error/i.test(state.msg) ? T.red : T.green }}>{state.msg}</span>}
      </div>
    </div>
  );
}
