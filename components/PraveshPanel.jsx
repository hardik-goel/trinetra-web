"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import DataTable from "./DataTable";
import {
  accuracyText,
  fetchPravesh,
  fmtDate,
  fmtMoney,
  fmtPct,
  fmtX,
  isSufficient,
  istDate as istToday,
  praveshSource,
  STANCE_TONE,
} from "../lib/pravesh";

/* ================================================================
   PRAVESH — IPO intelligence, additive to the Trinetra instrument.
   Evidence first: who said what, and how often they have been right.
   My Take is separate, reasoned, and never the last word.

   This file is the whole feature, body only — no page chrome — so it
   mounts unchanged inside the screener's Drawer (the "Pravesh" chip)
   and inside the standalone /pravesh route.
   ================================================================ */

const T = {
  bg: "#0E0F0C", panel: "#14150F", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dim: "#63665381", dimSolid: "#636653",
  brass: "#C9A961", brassDeep: "#A8863F", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", blue: "#7FA6CE", amber: "#D8B25C",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
export const PRAVESH_T = T;

const VERDICT_COLOR = {
  APPLY: T.green,
  LISTING_GAINS: T.blue,
  RISKY: T.amber,
  AVOID: T.red,
  PRELIMINARY: T.dimSolid,
};
const TONE_COLOR = { good: T.green, ok: T.blue, flat: T.mute, bad: T.red, none: T.dimSolid };

const VIEWS = [
  ["today", "Today"],
  ["history", "History"],
  ["sources", "Sources"],
];

/* Only what this feature needs on top of whatever host it mounts in — the
   screener already ships .rise/breathe, the standalone page ships the fonts.
   Scoped to .pravesh so nothing here can leak into the screener's markup. */
const PANEL_CSS = `
  .pravesh table { border-collapse: collapse; width: 100%; }
  .pravesh button, .pravesh input, .pravesh select { font-family: inherit; }
  .pravesh button { cursor: pointer; }
  .pravesh button:focus-visible { outline: 1.5px solid ${T.brass}; outline-offset: 1px; }
  @keyframes praveshRise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes breathe { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
  .pravesh .rise { animation: praveshRise .45s cubic-bezier(.2,.8,.2,1); }
  @media (prefers-reduced-motion: reduce) { .pravesh .rise, .pravesh [style*=breathe] { animation: none !important; } }
`;

/* The tab's glyph: a doorway. Pravesh means entry. */
export function DoorGlyph({ size = 13, color = T.brass }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 14" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path d="M1.5 13V4.2A3.2 3.2 0 0 1 4.7 1h2.6a3.2 3.2 0 0 1 3.2 3.2V13" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M0.5 13h11" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="8.4" cy="7.6" r="0.85" fill={color} />
    </svg>
  );
}

function chip(active) {
  return {
    padding: "8px 13px", borderRadius: 8,
    border: "1px solid " + (active ? T.brass + "55" : T.line),
    background: active ? T.brassSoft : T.card,
    color: active ? T.ink : T.mute,
    fontSize: 12.5, display: "flex", alignItems: "center", gap: 6,
  };
}

/* ── atoms, mirroring the screener's vocabulary ── */

function SectionLabel({ children, muted }) {
  return (
    <div style={{ fontFamily: T.mono, fontSize: 10.5, letterSpacing: 2, color: muted ? T.mute : T.brass, marginBottom: 10 }}>
      {children?.toUpperCase?.() || children}
    </div>
  );
}

function Badge({ take }) {
  const color = VERDICT_COLOR[take?.verdict_key] || T.dimSolid;
  return (
    <span title="My Take — an opinion, not a recommendation" style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
      border: "1px solid " + color + "66", background: color + "14", color,
      borderRadius: 6, padding: "4px 9px", fontFamily: T.mono, fontSize: 10.5, letterSpacing: .6 }}>
      {take?.verdict_emoji} {take?.verdict_label || "NO TAKE"}
    </span>
  );
}

function VetoBanner({ flags }) {
  if (!flags?.length) return null;
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      {flags.map((f) => (
        <div key={f} style={{ background: T.red + "12", border: "1px solid " + T.red + "44", borderLeft: "3px solid " + T.red,
          borderRadius: 8, padding: "9px 12px", color: T.red, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
          {f}
        </div>
      ))}
    </div>
  );
}

/* The evidence table IS the product. It comes before My Take, always. */
function EvidenceTable({ rows }) {
  if (!rows?.length) {
    return (
      <div style={{ border: "1px dashed " + T.line, borderRadius: 10, padding: "14px 12px", fontSize: 12, color: T.mute, lineHeight: 1.6 }}>
        No named source has published a view on this issue yet. That absence is itself information.
      </div>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            {["Source", "Stance", "Why", "Its accuracy"].map((h) => (
              <th key={h} style={{ textAlign: "left", fontFamily: T.mono, fontSize: 9, letterSpacing: 1.4,
                color: T.dimSolid, fontWeight: 400, padding: "6px 8px", borderBottom: "1px solid " + T.line }}>
                {h.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const tone = TONE_COLOR[STANCE_TONE[r.stance]] || T.mute;
            return (
              <tr key={r.source_name + i}>
                <td style={{ padding: "9px 8px", borderBottom: "1px solid " + T.lineSoft, verticalAlign: "top", minWidth: 110 }}>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" style={{ color: T.ink, fontSize: 12.5, textDecoration: "none", borderBottom: "1px dotted " + T.dimSolid }}>
                      {r.source_name}
                    </a>
                  ) : (
                    <span style={{ color: T.ink, fontSize: 12.5 }}>{r.source_name}</span>
                  )}
                  {r.is_synthetic && (
                    <span title="Derived signal, not a published human call" style={{ fontFamily: T.mono, fontSize: 8.5, color: T.dimSolid, marginLeft: 6 }}>SIGNAL</span>
                  )}
                </td>
                <td style={{ padding: "9px 8px", borderBottom: "1px solid " + T.lineSoft, verticalAlign: "top", color: tone, fontSize: 12, whiteSpace: "nowrap" }}>
                  {r.stance_label || r.stance || "—"}
                </td>
                <td style={{ padding: "9px 8px", borderBottom: "1px solid " + T.lineSoft, verticalAlign: "top", color: T.mute, fontSize: 12, lineHeight: 1.55, minWidth: 190 }}>
                  {r.rationale || "—"}
                </td>
                <td title="Share of this source's own past calls that were right, with the sample size behind it"
                  style={{ padding: "9px 8px", borderBottom: "1px solid " + T.lineSoft, verticalAlign: "top", whiteSpace: "nowrap",
                    fontFamily: T.mono, fontSize: 10.5, color: isSufficient(r) ? T.brass : T.dimSolid }}>
                  {accuracyText(r)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TakeBox({ take }) {
  if (!take) return null;
  const score = take.has_score === false || take.score == null ? "no score yet" : `${Math.round(take.score)}/100`;
  /* The engine usually signs off with this line itself — say it once, not twice. */
  const signsOff = /final call is yours\.?\s*$/i.test(take.paragraph || "");
  return (
    <div style={{ marginTop: 12, background: T.raised, borderLeft: "3px solid " + T.brass, borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.6, color: T.dimSolid, marginBottom: 6 }}>
        MY TAKE · OPINION · {score.toUpperCase()}
      </div>
      <div style={{ fontSize: 13, color: T.mute, lineHeight: 1.7 }}>
        {signsOff
          ? <>{take.paragraph.replace(/final call is yours\.?\s*$/i, "")}<span style={{ color: T.brass }}>Final call is yours.</span></>
          : <>{take.paragraph} <span style={{ color: T.brass }}>Final call is yours.</span></>}
      </div>
    </div>
  );
}

function DetailStrip({ ipo }) {
  const s = ipo.subscription || {};
  const subs = [["QIB", s.qib], ["NII", s.nii], ["Retail", s.retail], ["Total", s.total]]
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k} ${fmtX(v)}`)
    .join(" · ");
  const items = [
    ["Band", ipo.price_band_label || "—"],
    ["Lot", ipo.lot_size ? ipo.lot_size.toLocaleString("en-IN") : "—"],
    ["Min investment", fmtMoney(ipo.min_investment)],
    ["Issue size", ipo.issue_size_cr != null ? `₹${(+ipo.issue_size_cr).toLocaleString("en-IN")} Cr` : "—"],
    /* An OFS share outside 0–100% means the scrape mixed units somewhere. Printing
       it as a percentage would launder a parsing bug into a fact. */
    ["Fresh / OFS", ipo.fresh_issue_cr != null && ipo.ofs_cr != null
      ? `${(+ipo.fresh_issue_cr).toLocaleString("en-IN")} / ${(+ipo.ofs_cr).toLocaleString("en-IN")} Cr` +
        (ipo.ofs_pct == null ? "" : ipo.ofs_pct >= 0 && ipo.ofs_pct <= 100 ? ` (${Math.round(ipo.ofs_pct)}% OFS)` : " (OFS split unreliable in source)")
      : "—"],
    ["Subscription", subs || "not published yet"],
    ["GMP", ipo.gmp != null ? `${fmtMoney(ipo.gmp)} (${fmtPct(ipo.gmp_pct, true)}) · indicative` : "—"],
    ["Opens", fmtDate(ipo.open_date)],
    ["Closes", fmtDate(ipo.close_date)],
    ["Allotment", fmtDate(ipo.allotment_date)],
    ["Lists", fmtDate(ipo.listing_date)],
  ];
  return (
    <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ fontSize: 11.5 }}>
          <span style={{ color: T.dimSolid }}>{k} </span>
          <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 11 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function IPOCard({ ipo, open, onToggle }) {
  const take = ipo.take;
  return (
    <div className="rise" style={{ background: T.card, border: "1px solid " + (ipo.flags?.length ? T.red + "44" : T.line),
      borderRadius: 12, padding: 15, marginBottom: 10 }}>
      <button onClick={onToggle} style={{ all: "unset", cursor: "pointer", width: "100%", display: "flex",
        alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {ipo.closing_tomorrow && <span title="Closing tomorrow" style={{ color: T.brass }}>⚡</span>}
            <span style={{ fontSize: 15, color: T.ink, fontWeight: 500 }}>{ipo.name}</span>
            <span style={{ fontFamily: T.mono, fontSize: 8.5, letterSpacing: 1,
              color: ipo.segment === "SME" ? T.amber : T.dimSolid,
              border: "1px solid " + (ipo.segment === "SME" ? T.amber + "55" : T.line), borderRadius: 4, padding: "2px 5px" }}>
              {ipo.segment === "SME" ? "SME · HIGHER RISK" : "MAINBOARD"}
            </span>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.dimSolid, marginTop: 5 }}>
            closes {fmtDate(ipo.close_date)} · {ipo.price_band_label || "—"}
            {ipo.subscription?.total != null ? ` · ${fmtX(ipo.subscription.total)} subscribed` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <Badge take={take} />
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, marginTop: 6 }}>
            {open ? "collapse ▴" : "evidence ▾"}
          </div>
        </div>
      </button>

      <VetoBanner flags={ipo.flags} />

      {open && (
        <div style={{ marginTop: 14 }}>
          <SectionLabel muted>Evidence — who said what</SectionLabel>
          <EvidenceTable rows={ipo.evidence} />
          <TakeBox take={take} />
          <DetailStrip ipo={ipo} />
          {take?.modifiers?.length > 0 && (
            <div style={{ marginTop: 10, fontFamily: T.mono, fontSize: 10, color: T.dimSolid, lineHeight: 1.7 }}>
              {take.modifiers.map((m) => (
                <div key={m}>· {m}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── views ── */

function TodayView({ data, segment, setSegment }) {
  const [openSlug, setOpenSlug] = useState(null);
  const ipos = useMemo(
    () => data.ipos.filter((i) => (segment === "ALL" ? true : i.segment === segment)),
    [data.ipos, segment]
  );
  const group = (pred) => ipos.filter(pred);
  const closing = group((i) => i.status === "OPEN" && i.closing_tomorrow);
  const openMain = group((i) => i.status === "OPEN" && !i.closing_tomorrow && i.segment !== "SME");
  const openSme = group((i) => i.status === "OPEN" && !i.closing_tomorrow && i.segment === "SME");
  const upcoming = group((i) => i.status === "UPCOMING");
  const watch = group((i) => i.status === "CLOSED");

  const block = (label, sub, list) =>
    list.length === 0 ? null : (
      <section key={label} style={{ marginTop: 22 }}>
        <SectionLabel>{label}</SectionLabel>
        {sub && <div style={{ fontSize: 11.5, color: T.dimSolid, marginTop: -6, marginBottom: 10 }}>{sub}</div>}
        {list.map((ipo) => (
          <IPOCard
            key={ipo.slug}
            ipo={ipo}
            open={openSlug === ipo.slug}
            onToggle={() => setOpenSlug(openSlug === ipo.slug ? null : ipo.slug)}
          />
        ))}
      </section>
    );

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {[["ALL", "All"], ["MAINBOARD", "Mainboard"], ["SME", "SME"]].map(([k, label]) => (
          <button key={k} onClick={() => setSegment(k)} style={chip(segment === k)}>
            {label}
          </button>
        ))}
      </div>

      {ipos.length === 0 ? (
        <div style={{ border: "1px dashed " + T.line, borderRadius: 12, padding: "28px 20px", textAlign: "center", marginTop: 22 }}>
          <div style={{ fontSize: 13, color: T.mute }}>All quiet.</div>
          <div style={{ fontSize: 12, color: T.dimSolid, marginTop: 3 }}>
            No open, closing or listing IPOs in this segment right now.
          </div>
        </div>
      ) : (
        <>
          {block("⚡ Closing tomorrow", "last window to apply", closing)}
          {block("Open · Mainboard", "", openMain)}
          {block("Open · SME", "higher risk, thinner liquidity", openSme)}
          {block("Opening soon", "preliminary — no bidding data yet", upcoming)}
          {block("Allotment & listing watch", "closed, awaiting listing", watch)}
        </>
      )}
    </>
  );
}

function HistoryView({ data }) {
  const rows = data.history || [];
  if (!rows.length) {
    return (
      <div style={{ border: "1px dashed " + T.line, borderRadius: 12, padding: "28px 20px", textAlign: "center", marginTop: 22 }}>
        <div style={{ fontSize: 13, color: T.mute }}>No resolved calls yet.</div>
        <div style={{ fontSize: 12, color: T.dimSolid, marginTop: 3 }}>
          Every take is graded once the IPO lists. Nothing to show until then.
        </div>
      </div>
    );
  }
  return (
    <section style={{ marginTop: 22 }}>
      <SectionLabel>My take vs what actually happened</SectionLabel>
      <div style={{ fontSize: 11.5, color: T.dimSolid, marginTop: -6, marginBottom: 10, lineHeight: 1.55 }}>
        Apply-type calls count as right at a listing gain of +5% or better; avoid-type calls at +5% or worse.
        RISKY is excluded — it is a refusal to call, not a call.
      </div>
      <DataTable
        dense
        rowKey={r => r.ipo_slug}
        rows={rows}
        empty="No resolved calls yet."
        columns={[
          { key: "ipo_name", label: "IPO", type: "text", align: "left", mono: false,
            render: r => <span style={{ color: T.ink }}>{r.ipo_name}
              {r.segment === "SME" && <span style={{ fontFamily: T.mono, fontSize: 8.5, color: T.amber, marginLeft: 6 }}>SME</span>}
              {r.flags?.length > 0 && <span title={r.flags.join(" · ")} style={{ color: T.red, marginLeft: 6 }}>⚠</span>}</span> },
          { key: "listing_date", label: "Listed", type: "date", render: r => fmtDate(r.listing_date) },
          { key: "verdict_key", label: "My call", type: "cat",
            render: r => <span style={{ color: VERDICT_COLOR[r.verdict_key] || T.mute }}>{r.verdict_key || "—"}</span> },
          { key: "listing_gain_pct", label: "Listing gain", type: "number",
            render: r => <span style={{ color: r.listing_gain_pct == null ? T.mute : r.listing_gain_pct >= 0 ? T.green : T.red }}>
              {fmtPct(r.listing_gain_pct, true)}</span> },
          { key: "correct", label: "Right?", type: "bool",
            render: r => <span style={{ color: r.correct == null ? T.dimSolid : r.correct ? T.green : T.red }}>
              {r.correct == null ? "—" : r.correct ? "✓" : "✕"}</span> },
        ]} />
    </section>
  );
}

function SourcesView({ data }) {
  // Sorting belongs to the table now — every column, not three preset buttons.
  const rows = data.leaderboard || [];

  return (
    <section style={{ marginTop: 22 }}>
      <SectionLabel>Source leaderboard</SectionLabel>
      <div style={{ fontSize: 11.5, color: T.dimSolid, marginTop: -6, marginBottom: 10, lineHeight: 1.6 }}>
        Every source is scored on its own published calls. Sources with fewer than 5 resolved calls are
        not ranked — a 100% from two calls is noise wearing a percentage.
      </div>

      <DataTable
          dense
          rowKey={r => r.source_name}
          rows={rows}
          empty="Not enough resolved calls yet."
          columns={[
            { key: "source_name", label: "Source", type: "text", align: "left", mono: false,
              render: r => <span style={{ color: T.ink }}>{r.source_name}
                {r.is_synthetic && <span style={{ fontFamily: T.mono, fontSize: 8.5, color: T.dimSolid, marginLeft: 6 }}>SIGNAL</span>}</span> },
            { key: "accuracy_all", label: "All-time", type: "number",
              // Below n=5 there is no rate — that sorts as unknown, never as zero.
              value: r => ((r.n_all || 0) >= 5 && r.accuracy_all != null ? r.accuracy_all : null),
              render: r => { const ranked = (r.n_all || 0) >= 5 && r.accuracy_all != null;
                return <span style={{ color: ranked ? T.brass : T.dimSolid }}>
                  {ranked ? `${Math.round(r.accuracy_all)}%` : "insufficient history"}</span>; } },
            { key: "accuracy_recent", label: "Last 15", type: "number",
              value: r => ((r.n_all || 0) >= 5 ? r.accuracy_recent : null),
              render: r => ((r.n_all || 0) >= 5 && r.accuracy_recent != null ? `${Math.round(r.accuracy_recent)}%` : "—") },
            { key: "n_all", label: "n", type: "number" },
          ]} />

      <div style={{ marginTop: 14, background: T.raised, border: "1px solid " + T.line, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.6, color: T.dimSolid, marginBottom: 5 }}>
          MY OWN RECORD — SAME STANDARD
        </div>
        <div style={{ fontSize: 13, color: T.ink }}>{data.ownAccuracy?.label || "insufficient history (n=0)"}</div>
      </div>
    </section>
  );
}

/* ── loading / not-connected states ── */

function Skeleton() {
  const bar = (w, h = 11, mt = 0) => (
    <div style={{ width: w, height: h, borderRadius: 4, background: T.line, marginTop: mt, animation: "breathe 1.8s ease-in-out infinite" }} />
  );
  return (
    <div style={{ marginTop: 20 }} aria-busy="true" aria-label="Loading Pravesh">
      {bar("42%", 9)}
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 15, marginTop: 12, opacity: 1 - i * 0.22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1 }}>
              {bar("58%", 13)}
              {bar("38%", 9, 9)}
            </div>
            {bar(88, 22)}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: T.dimSolid, marginTop: 14, textAlign: "center" }}>Reading the ledger…</div>
    </div>
  );
}

/* Never a crash, never a blank: if the engine has not run or the URL is wrong,
   this is what the tab says — and it says exactly which knob fixes it. */
function NotConnected({ err, source, onRetry }) {
  return (
    <div style={{ marginTop: 20, border: "1px dashed " + T.line, borderRadius: 12, padding: "26px 20px", textAlign: "center" }}>
      <div style={{ margin: "0 auto 12px", width: 34, height: 34, borderRadius: 99, border: "1px solid " + T.line,
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <DoorGlyph size={15} color={T.dimSolid} />
      </div>
      <div style={{ fontSize: 13.5, color: T.ink }}>Pravesh not connected yet.</div>
      <div style={{ fontSize: 12, color: T.mute, marginTop: 5, lineHeight: 1.6 }}>
        Point <span style={{ fontFamily: T.mono, color: T.brass }}>NEXT_PUBLIC_PRAVESH_DATA_URL</span> at the engine&apos;s
        {" "}<span style={{ fontFamily: T.mono }}>data/latest.json</span> — or wait for today&apos;s run to publish one.
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 10, lineHeight: 1.6, wordBreak: "break-all" }}>
        {source.label}{source.configured ? "" : " · default guess"} · {source.url}
        {err ? <div style={{ color: T.red + "CC", marginTop: 4 }}>{err}</div> : null}
      </div>
      <button onClick={onRetry} style={{ ...chip(false), margin: "14px auto 0", display: "inline-flex" }}>Try again</button>
    </div>
  );
}

/* ── the tab body ──────────────────────────────────────────────────
   Self-contained: mounts, fetches once, and can be closed and reopened
   without touching anything else in the app. Read-only throughout.     */

export default function PraveshPanel({ showHeaderMeta = true }) {
  const [view, setView] = useState("today");
  const [segment, setSegment] = useState("ALL");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (signal) => {
    setBusy(true);
    setErr("");
    try {
      setData(await fetchPravesh(signal));
    } catch (e) {
      if (e?.name === "AbortError") return;
      setData(null);
      setErr(e?.message || "could not reach the Pravesh feed");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const source = praveshSource();

  return (
    <div className="pravesh" style={{ fontFamily: T.sans, color: T.ink }}>
      <style dangerouslySetInnerHTML={{ __html: PANEL_CSS }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {VIEWS.map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={chip(view === k)}>{label}</button>
        ))}
        <button onClick={() => load()} title="Refresh" disabled={busy}
          style={{ ...chip(false), marginLeft: "auto", opacity: busy ? .5 : 1 }}>{busy ? "…" : "↻"}</button>
      </div>

      {busy && !data && <Skeleton />}
      {!busy && !data && <NotConnected err={err} source={source} onRetry={() => load()} />}

      {data && (
        <>
          {err && (
            <div style={{ marginTop: 12, background: T.red + "10", border: "1px solid " + T.red + "44",
              borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: T.mute, lineHeight: 1.55 }}>
              <span style={{ color: T.red }}>Refresh failed.</span> {err} — showing the last snapshot that loaded.
            </div>
          )}

          {showHeaderMeta && (
            <div style={{ marginTop: 14, fontFamily: T.mono, fontSize: 10, color: T.dimSolid, lineHeight: 1.7 }}>
              {data.counts.open} open · {data.counts.closing_tomorrow} closing soon · {data.counts.upcoming} upcoming
              {data.generatedAtMarket ? ` · updated ${data.generatedAtMarket}` : ""} · via {data._source}
            </div>
          )}

          {/* A snapshot from an earlier day is still useful — but it must never
              be mistaken for today's book. Dates, subscription and GMP move. */}
          {data.runDate && data.runDate !== istToday() && (
            <div style={{ marginTop: 10, background: T.brassSoft, border: "1px solid " + T.brass + "3A",
              borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: T.mute, lineHeight: 1.55 }}>
              ⏳ This snapshot is from {fmtDate(data.runDate)} — today&apos;s engine run has not published yet.
              Subscription, GMP and closing dates below are as of that run.
            </div>
          )}

          {data.sourcesFailed?.length > 0 && (
            <div style={{ marginTop: 10, background: T.brassSoft, border: "1px solid " + T.brass + "3A",
              borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: T.mute, lineHeight: 1.55 }}>
              ⚠ Degraded on the last run — {data.sourcesFailed.join("; ")}. Missing evidence is missing, not neutral.
            </div>
          )}

          {view === "today" && <TodayView data={data} segment={segment} setSegment={setSegment} />}
          {view === "history" && <HistoryView data={data} />}
          {view === "sources" && <SourcesView data={data} />}

          <p style={{ fontSize: 11, color: T.dimSolid, lineHeight: 1.6, marginTop: 26, marginBottom: 0, textAlign: "center" }}>
            {data.disclaimer.replace(/\s*(the )?final call is yours\.?\s*$/i, " ")}
            <span style={{ color: T.brass }}>Final call is yours.</span>
          </p>
        </>
      )}
    </div>
  );
}
