"use client";
import React, { useMemo, useState } from "react";

/* ================================================================
   One table for the whole app. Every tabular view uses this, so sort
   and filter behave identically everywhere and are implemented once.

   Column spec:
     { key, label, type: "number"|"text"|"date"|"bool"|"cat",
       value: row => sortable primitive,      // defaults to row[key]
       render: (row) => node,                 // defaults to the value
       align, width, mono, sortable, filterable, title }

   The rules the app depends on, enforced here rather than per table:
     · null sorts LAST in both directions — absent is not a low value
     · "showing X of Y" is always visible, so a filtered view can never
       be mistaken for the full set
     · the first column pins on horizontal scroll, so a phone keeps the
       symbol in view while the numbers move
   ================================================================ */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dim: "#63665381", dimSolid: "#636653",
  brass: "#C9A961", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", amber: "#D8B25C",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
const inS = {
  background: T.bg, border: "1px solid " + T.line, color: T.ink,
  fontFamily: T.mono, fontSize: 11, borderRadius: 6, padding: "5px 7px",
};
const btn = (active) => ({
  padding: "5px 9px", borderRadius: 7, border: "1px solid " + (active ? T.brass + "66" : T.line),
  background: active ? T.brassSoft : "transparent", color: active ? T.ink : T.mute,
  fontSize: 11, cursor: "pointer",
});

const val = (col, row) => (col.value ? col.value(row) : row?.[col.key]);
const isNil = v => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));

function compare(a, b, type) {
  if (type === "text" || type === "cat") return String(a).localeCompare(String(b));
  if (type === "date") return Date.parse(a) - Date.parse(b);
  if (type === "bool") return (a ? 1 : 0) - (b ? 1 : 0);
  return (+a) - (+b);
}

/* ── per-type filter controls ── */
function Filter({ col, state, set, options }) {
  const f = state || {};
  if (col.type === "number") {
    return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <input type="number" step="any" value={f.min ?? ""} placeholder="min" style={{ ...inS, width: 66 }}
          onChange={e => set({ ...f, min: e.target.value === "" ? undefined : +e.target.value })} />
        <input type="number" step="any" value={f.max ?? ""} placeholder="max" style={{ ...inS, width: 66 }}
          onChange={e => set({ ...f, max: e.target.value === "" ? undefined : +e.target.value })} />
      </span>
    );
  }
  if (col.type === "date") {
    return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <input type="date" value={f.from ?? ""} style={{ ...inS, width: 132 }}
          onChange={e => set({ ...f, from: e.target.value || undefined })} />
        <input type="date" value={f.to ?? ""} style={{ ...inS, width: 132 }}
          onChange={e => set({ ...f, to: e.target.value || undefined })} />
      </span>
    );
  }
  if (col.type === "bool") {
    return (
      <span style={{ display: "inline-flex", gap: 4 }}>
        {[["any", undefined], ["yes", true], ["no", false]].map(([label, v]) => (
          <button key={label} onClick={() => set({ ...f, is: v })} style={btn(f.is === v)}>{label}</button>
        ))}
      </span>
    );
  }
  if (col.type === "cat") {
    const picked = new Set(f.in || []);
    return (
      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
        {options.map(o => (
          <button key={o} onClick={() => {
            const next = new Set(picked);
            next.has(o) ? next.delete(o) : next.add(o);
            set({ ...f, in: next.size ? [...next] : undefined });
          }} style={btn(picked.has(o))}>{String(o)}</button>
        ))}
      </span>
    );
  }
  return (
    <input value={f.q ?? ""} placeholder="contains…" style={{ ...inS, width: 130 }}
      onChange={e => set({ ...f, q: e.target.value || undefined })} />
  );
}

const describe = (col, f) => {
  if (col.type === "number") return `${col.label} ${f.min ?? "…"}–${f.max ?? "…"}`;
  if (col.type === "date") return `${col.label} ${f.from || "…"}→${f.to || "…"}`;
  if (col.type === "bool") return `${col.label}: ${f.is ? "yes" : "no"}`;
  if (col.type === "cat") return `${col.label}: ${(f.in || []).join(", ")}`;
  return `${col.label} ~ "${f.q}"`;
};
const active = (col, f) => {
  if (!f) return false;
  if (col.type === "number") return f.min != null || f.max != null;
  if (col.type === "date") return !!(f.from || f.to);
  if (col.type === "bool") return f.is !== undefined;
  if (col.type === "cat") return !!(f.in && f.in.length);
  return !!f.q;
};

export default function DataTable({ columns, rows, rowKey, onRowClick, expanded, renderExpanded, empty, dense }) {
  const [sort, setSort] = useState({ key: null, dir: null });   // none → asc → desc → none
  const [filters, setFilters] = useState({});
  const [sheet, setSheet] = useState(false);

  const options = useMemo(() => {
    const o = {};
    for (const c of columns) {
      if (c.type !== "cat") continue;
      o[c.key] = [...new Set(rows.map(r => val(c, r)).filter(v => !isNil(v)).map(String))].sort();
    }
    return o;
  }, [columns, rows]);

  const filtered = useMemo(() => rows.filter(r => columns.every(c => {
    const f = filters[c.key];
    if (!active(c, f)) return true;
    const v = val(c, r);
    if (c.type === "number") {
      if (isNil(v)) return false;                       // a filter on a number excludes unknowns
      if (f.min != null && +v < f.min) return false;
      if (f.max != null && +v > f.max) return false;
      return true;
    }
    if (c.type === "date") {
      if (isNil(v)) return false;
      const t = Date.parse(v);
      if (f.from && t < Date.parse(f.from)) return false;
      if (f.to && t > Date.parse(f.to) + 86_400_000) return false;
      return true;
    }
    if (c.type === "bool") return !!v === f.is;
    if (c.type === "cat") return f.in.includes(String(v));
    return String(v ?? "").toLowerCase().includes(String(f.q).toLowerCase());
  })), [rows, columns, filters]);

  const sorted = useMemo(() => {
    if (!sort.key || !sort.dir) return filtered;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return filtered;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = val(col, a), bv = val(col, b);
      // Missing last in BOTH directions — absent is not a low value.
      if (isNil(av) && isNil(bv)) return 0;
      if (isNil(av)) return 1;
      if (isNil(bv)) return -1;
      return sign * compare(av, bv, col.type || "number");
    });
  }, [filtered, sort, columns]);

  const cycle = (key) => setSort(s =>
    s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: null });

  const chips = columns.filter(c => active(c, filters[c.key]));

  const filterBar = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "8px 2px" }}>
      {columns.filter(c => c.filterable !== false).map(c => (
        <label key={c.key} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 10.5, color: T.dimSolid }}>
          {c.label}
          <Filter col={c} state={filters[c.key]} options={options[c.key] || []}
            set={next => setFilters(f => ({ ...f, [c.key]: next }))} />
        </label>
      ))}
    </div>
  );

  return (
    <div style={{ fontFamily: T.sans }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => setSheet(s => !s)} style={btn(sheet || chips.length > 0)}>
          Filter{chips.length ? ` · ${chips.length}` : ""}
        </button>
        {/* Never let a filtered view pass for the whole set. */}
        <span style={{ fontFamily: T.mono, fontSize: 10, color: sorted.length === rows.length ? T.dimSolid : T.brass }}>
          showing {sorted.length} of {rows.length}
        </span>
        {sort.key && (
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>
            sorted by {columns.find(c => c.key === sort.key)?.label} {sort.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
        {chips.length > 0 && (
          <button onClick={() => setFilters({})} style={{ ...btn(false), marginLeft: "auto", color: T.brass }}>Clear all</button>
        )}
      </div>

      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {chips.map(c => (
            <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 10,
              color: T.mute, background: T.brassSoft, border: "1px solid " + T.brass + "3A", borderRadius: 6, padding: "3px 6px 3px 8px" }}>
              {describe(c, filters[c.key])}
              <button onClick={() => setFilters(f => ({ ...f, [c.key]: undefined }))}
                style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 10, padding: 0, cursor: "pointer" }}>✕</button>
            </span>
          ))}
        </div>
      )}

      {sheet && (
        <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 10, padding: "6px 10px", marginBottom: 8 }}>
          {filterBar}
        </div>
      )}

      <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 6, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c.key} onClick={() => c.sortable !== false && cycle(c.key)}
                  title={c.title || (c.sortable === false ? undefined : "Sort")}
                  style={{
                    textAlign: c.align || (i === 0 ? "left" : "right"),
                    fontFamily: T.mono, fontSize: 9, letterSpacing: 1.1, fontWeight: 400,
                    color: sort.key === c.key ? T.brass : T.dimSolid,
                    padding: dense ? "6px 7px" : "7px 8px", borderBottom: "1px solid " + T.line,
                    whiteSpace: "nowrap", cursor: c.sortable === false ? "default" : "pointer",
                    position: i === 0 ? "sticky" : undefined, left: i === 0 ? 0 : undefined,
                    background: i === 0 ? T.card : undefined, zIndex: i === 0 ? 1 : undefined,
                  }}>
                  {c.label.toUpperCase()}{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const key = rowKey ? rowKey(r) : r.id || r.symbol;
              return (
                <React.Fragment key={key}>
                  <tr onClick={onRowClick ? () => onRowClick(r) : undefined} style={{ cursor: onRowClick ? "pointer" : "default" }}>
                    {columns.map((c, i) => (
                      <td key={c.key} style={{
                        padding: dense ? "6px 7px" : "8px", borderBottom: "1px solid " + T.lineSoft,
                        textAlign: c.align || (i === 0 ? "left" : "right"),
                        fontFamily: c.mono !== false && i > 0 ? T.mono : T.sans,
                        fontSize: i === 0 ? 12 : 11, color: i === 0 ? T.ink : T.mute,
                        whiteSpace: c.wrap ? "normal" : "nowrap",
                        position: i === 0 ? "sticky" : undefined, left: i === 0 ? 0 : undefined,
                        background: i === 0 ? T.card : undefined,
                      }}>
                        {c.render ? c.render(r) : (isNil(val(c, r)) ? <span style={{ color: T.dim }}>—</span> : String(val(c, r)))}
                      </td>
                    ))}
                  </tr>
                  {expanded === key && renderExpanded && (
                    <tr><td colSpan={columns.length} style={{ padding: "12px 10px", background: T.bg, borderBottom: "1px solid " + T.line }}>
                      {renderExpanded(r)}
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
            {!sorted.length && (
              <tr><td colSpan={columns.length} style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: T.dimSolid }}>
                {rows.length ? "No rows match these filters." : (empty || "Nothing to show.")}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
