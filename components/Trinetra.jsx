"use client";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import PraveshPanel, { DoorGlyph } from "./PraveshPanel";
import TrackRecord, { RecordGlyph } from "./TrackRecord";
import Positions from "./Positions";
import Brief from "./Brief";
import { DecisionStrip } from "./Decision";
import { trackApi } from "../lib/track";
import { deskApi } from "../lib/desk";
import ProfileCriteria from "./ProfileCriteria";
import StockDecision from "./StockDecision";
import Guide from "./Guide";
import Playbook from "./Playbook";
import DataTable from "./DataTable";
import OriginalFour, { ORIGINAL_FOUR } from "./OriginalFour";
import StorageBanner, { RestoredNote, StorageLine } from "./StorageBanner";
import StockLookup from "./StockLookup";
import SetupCard from "./SetupCard";

/* ================================================================
   TRINETRA — the eye opens when everything aligns
   Production dashboard. Connects to the Trinetra backend for real
   delayed NSE data + server-side 24/7 alerts. Falls back to a demo
   feed so the instrument is explorable before you deploy.
   ================================================================ */

const T = {
  bg: "#0E0F0C", panel: "#14150F", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dim: "#63665381", dimSolid: "#636653",
  brass: "#C9A961", brassDeep: "#A8863F", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", amber: "#D8B25C",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

/* Fundamentals catalog — mirrors trinetra-backend/fundamentals.config.js.
   A metric added there needs one line here and becomes selectable as a criteria
   check everywhere. Keys must match the backend exactly, or a check silently
   reads undefined and evaluates as "no data". */
const FUND_METRICS = {
  roe:           { label: "Return on equity", unit: "%" },
  roce:          { label: "Return on capital employed", unit: "%" },
  de:            { label: "Debt / equity", unit: "" },
  pe:            { label: "Price / earnings", unit: "" },
  pb:            { label: "Price / book", unit: "" },
  dividendYield: { label: "Dividend yield", unit: "%" },
  opm:           { label: "Operating margin", unit: "%" },
  profitGrowth:  { label: "Profit growth (3y)", unit: "%" },
  salesGrowth3y: { label: "Sales growth (3y)", unit: "%" },
  promoter:      { label: "Promoter holding", unit: "%" },
  epsGrowth3y:   { label: "EPS growth (3y)", unit: "%" },
  pledged:       { label: "Pledged shares", unit: "%" },
  piotroski:     { label: "Piotroski F-score", unit: "" },
};

const METRICS = {
  ...Object.fromEntries(Object.entries(FUND_METRICS).map(([k, m]) =>
    [k, { ...m, group: "F", get: s => s.fund?.[k] }])),
  dayChgPct:    { label: "Day change", unit: "%",         group: "B", get: s => ((s.price - s.prevClose) / s.prevClose) * 100 },
  aboveHigh20:  { label: "Above 20-day high", unit: "y/n",group: "B", get: s => (s.price > s.high20 ? 1 : 0) },
  pctOf52wHigh: { label: "% of 52-wk high", unit: "%",    group: "B", get: s => (s.price / s.high52) * 100 },
  volMultiple:  { label: "Volume vs 20d avg", unit: "×",  group: "V", get: s => (s.avgVol20 ? s.volToday / s.avgVol20 : NaN) },
  buyerPct:     { label: "Buyer share of book", unit: "%",group: "O", get: s => { const t = (s.bidQty||0)+(s.askQty||0); return t ? (s.bidQty/t)*100 : NaN; } },
  price:        { label: "Last price", unit: "₹",         group: "B", get: s => s.price },
  fcstReturn:   { label: "AI forecast return", unit: "%", group: "K", get: s => s.fcst?.ret },
};
/* ── Oracle: parked ────────────────────────────────────────────────
   The forecast service's free data feeds answer 429 from Render, so the
   Oracle returns nothing. A criterion with no data never passes, and every
   enabled criterion must pass for the eye to open — so leaving it switchable
   means one click silently blocks every signal in the app.

   Parked rather than removed: the tab, the explainer and the threshold
   control all stay. Flip this to true once the feed is fixed (planned via
   Kite / a keyed source) and everything comes back with no other edit. */
const ORACLE_ENABLED = false;

/* Provenance fields ride in the same record as the metrics; they are not metrics. */
const FUND_NON_METRIC = new Set(["status", "source", "fetchedAt", "missing", "symbol"]);
/* The backend catalog — not this file — decides which metrics exist, and its
   engine turns every catalog key into a valid check for free. So a key this
   build has never heard of must still resolve, sort and filter: it reads off
   s.fund and gets a humanized label until someone names it in FUND_METRICS.
   Without this fallback a metric added to the backend would render "—" here
   while the backend happily evaluated it — the two silently disagreeing. */
const humanize = id => id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
const guessUnit = id => /(pct|percent|growth|margin|yield|roe|roce|opm|promoter|pledged)/i.test(id) ? "%" : "";
const metricMeta = id =>
  METRICS[id] || { label: humanize(id), unit: guessUnit(id), group: "F", get: s => s.fund?.[id], adhoc: true };
const isFundMetric = id => metricMeta(id).group === "F";
/* Which side of a threshold is the good side — only used to pick the default
   operator when you build a filter, never to judge a value. */
const FUND_DIR_LOW = new Set(["de", "pe", "pb", "pledged"]);
const defaultOp = id => (FUND_DIR_LOW.has(id) ? "lte" : "gte");

const fmtIN = v => (+v).toLocaleString("en-IN");
const fmtVal = (id, v) => {
  if (v == null || Number.isNaN(v)) return "—";
  const u = metricMeta(id).unit;
  if (u === "y/n") return v ? "yes" : "no";
  if (u === "₹") return "₹" + fmtIN((+v).toFixed(2));
  return (+v).toFixed(u === "×" || u === "" ? 2 : 1) + u;
};
const OPS = { gte: "≥", lte: "≤" };
/* Seed fundamentals are hand-entered and never confirmed by a scrape. They are
   shown, but they cannot tick a box — mirrors lib/engine.js on the backend. */
const isUnverified = (s, metric) => isFundMetric(metric) && s.fund?.status === "seed";
const checkOk = (s, c) => {
  const v = metricMeta(c.metric).get(s);
  if (v == null || Number.isNaN(v)) return { v, ok: false, na: true };
  if (isUnverified(s, c.metric)) return { v, ok: false, na: false, unverified: true };
  return { v, ok: c.op === "gte" ? v >= c.value : v <= c.value, na: false };
};
function evaluate(s, criteria) {
  const active = criteria.filter(c => c.enabled);
  const results = active.map(c => {
    const checks = c.checks.map(ch => { const r = checkOk(s, ch); return { label: metricMeta(ch.metric).label, value: fmtVal(ch.metric, r.v), req: OPS[ch.op] + " " + fmtVal(ch.metric, ch.value), ok: r.ok, na: r.na, unverified: r.unverified }; });
    return { ...c, checksOut: checks, pass: checks.length > 0 && checks.every(x => x.ok), na: checks.some(x => x.na), unverified: checks.some(x => x.unverified) };
  });
  return { criteria: results, count: results.filter(r => r.pass).length, total: active.length,
    locked: active.length > 0 && results.every(r => r.pass),
    volX: METRICS.volMultiple.get(s), buyerPct: METRICS.buyerPct.get(s), dayChg: METRICS.dayChgPct.get(s) };
}

const DEFAULT_CRITERIA = [
  { id: "fund", key: "F", name: "Fundamentals", enabled: true, builtin: true,
    checks: [ { metric: "roe", op: "gte", value: 15 }, { metric: "de", op: "lte", value: 0.7 }, { metric: "profitGrowth", op: "gte", value: 12 }, { metric: "promoter", op: "gte", value: 40 } ] },
  { id: "brk", key: "B", name: "Breakout", enabled: true, builtin: true,
    checks: [ { metric: "aboveHigh20", op: "gte", value: 1 }, { metric: "dayChgPct", op: "gte", value: 2 }, { metric: "pctOf52wHigh", op: "gte", value: 95 } ] },
  { id: "vol", key: "V", name: "Volume shocker", enabled: true, builtin: true,
    checks: [ { metric: "volMultiple", op: "gte", value: 3 } ] },
  { id: "flow", key: "O", name: "Order flow", enabled: false, builtin: true, depthNote: true,
    checks: [ { metric: "buyerPct", op: "gte", value: 65 } ] },
  // Off by default, and while parked it cannot be switched on at all — see ORACLE_ENABLED.
  { id: "kron", key: "K", name: "AI Forecast (Kronos)", enabled: false, builtin: true, oracleNote: true,
    checks: [ { metric: "fcstReturn", op: "gte", value: 2 } ] },
];

/* demo universe */
const seed = [["POLYCAB","Polycab India","Cables",6420,22.4,.05,28,65.2,0,"star"],["KAYNES","Kaynes Tech","Electronics",5210,16.8,.21,44,57.8,0,"star"],["MAZDOCK","Mazagon Dock","Defence",2890,31.2,.02,38,84.8,0,"star"],["JYOTICNC","Jyoti CNC","Cap Goods",1120,18.6,.36,49,66.7,0,"star"],["BEL","Bharat Electronics","Defence",312,24.6,.01,22,51.1,0,"build"],["HAL","Hindustan Aero","Defence",4480,27.3,.03,26,71.6,0,"neutral"],["NETWEB","Netweb Tech","Servers",2310,24.4,.08,55,74.4,0,"build"],["DIXON","Dixon Tech","EMS",14850,21.7,.18,52,32.9,0,"build"],["CDSL","CDSL","Depository",1462,26.9,0,25,15,0,"build"],["CGPOWER","CG Power","Cap Goods",710,28.9,.03,35,58.1,0,"build"],["TRENT","Trent","Retail",5640,19.4,.28,41,37,0,"neutral"],["PERSISTENT","Persistent","IT",5920,22.8,.06,17,31,0,"neutral"],["APLAPOLLO","APL Apollo","Steel",1585,23.1,.32,19,28.6,0,"neutral"],["RVNL","Rail Vikas","Railways",412,17.1,.38,12,72.8,0,"neutral"],["VBL","Varun Bev","FMCG",560,25.8,.44,27,60.2,0,"neutral"],["SUPREMEIND","Supreme Ind","Plastics",3970,23.5,.02,16,48.8,0,"neutral"]];
function makeUniverse() {
  return seed.map(([symbol,name,sector,base,roe,de,pg,ph,pl,scenario]) => {
    const hist = []; let p = base * (.88 + Math.random() * .04);
    for (let i = 0; i < 40; i++) { p *= 1 + (Math.random() - .485) * .012; hist.push(+p.toFixed(2)); }
    const avgVol = Math.round(2e5 + Math.random() * 3e6);
    // Demo fundamentals are simulated, so the extended metrics are derived from
    // the seed rather than left blank — otherwise a criterion on P/E or ROCE
    // would read "no data" in demo and the feed would look broken.
    const demoFund = {
      roe, de, profitGrowth: pg, promoter: ph, pledged: pl,
      roce: +(roe * 1.35).toFixed(1),
      pe: +(18 + roe * 0.9).toFixed(1),
      pb: +(1.2 + roe * 0.22).toFixed(2),
      dividendYield: +(1.6 - roe * 0.03).toFixed(2),
      opm: +(8 + roe * 0.55).toFixed(1),
      salesGrowth3y: +(pg * 0.75).toFixed(1),
      epsGrowth3y: +(pg * 0.95).toFixed(1),
      piotroski: null, // never published — matches the live feed's honest gap
      status: "demo",
    };
    return { symbol, name, sector, scenario, fund: demoFund,
      price: hist.at(-1), prevClose: hist.at(-2), high20: Math.max(...hist.slice(-20)), high52: Math.max(...hist) * (1 + Math.random() * .06),
      hist, avgVol20: avgVol, volToday: Math.round(avgVol * (.3 + Math.random() * .4)),
      bidQty: Math.round(1e4 + Math.random() * 9e4), askQty: Math.round(1e4 + Math.random() * 9e4), tickN: 0 };
  });
}
function demoTick(s) {
  const n = { ...s, tickN: s.tickN + 1 };
  const drift = s.scenario === "star" ? .0038 + Math.random() * .004 : s.scenario === "build" && s.tickN > 5 ? .0016 + Math.random() * .003 : (Math.random() - .5) * .004;
  n.price = +(s.price * (1 + drift + (Math.random() - .5) * .002)).toFixed(2);
  const vb = s.scenario === "star" ? .15 : s.scenario === "build" && s.tickN > 7 ? .095 : .02;
  n.volToday = Math.round(s.volToday + s.avgVol20 * vb * Math.random());
  const bp = s.scenario === "star" ? 1.06 : s.scenario === "build" && s.tickN > 7 ? 1.035 : 1 + (Math.random() - .5) * .04;
  n.bidQty = Math.round(Math.max(5e3, s.bidQty * bp)); n.askQty = Math.round(Math.max(5e3, s.askQty * (2 - bp)));
  n.hist = [...s.hist.slice(-59), n.price]; return n;
}

/* universe editing — mirrors the backend's normalizer so the UI can
   pre-validate and pre-dedupe before any request.

   The cap is deliberately NOT here. A number hardcoded on this side goes stale
   the moment the backend changes its own, and a stale copy that is too low does
   not merely misinform — it blocks adds the server would have accepted. The cap
   is learned from whatever the server says (an /universe/indices response, or
   the rejection when one is actually hit) and is simply not shown until then. */
const capFromError = (msg) => {
  const m = /max\s+(\d+)/i.exec(String(msg || ""));
  return m ? +m[1] : null;
};

/* ── navigation groups ───────────────────────────────────────────────
   Grouped by when you reach for a thing, not by which subsystem built it:
   what needs you today, what you are researching, what you own, and what
   you configure once. Oracle is absent on purpose — it is parked, and a
   parked feature holding prime navigation is pure cost. It is still
   reachable at ?panel=oracle for whoever is finishing it. */
const NAV = [
  { id: "today", label: "Today", glyph: "☀",
    badge: c => (c.fired || null),
    items: [
      { id: "brief", label: "Morning brief" },
      { id: "playbook", label: "Playbook" },
      { id: "alerts", label: "Alerts" },
    ] },
  { id: "watch", label: "Watch", glyph: "◈",
    items: [
      { id: "fundamentals", label: "Fundamentals" },
      { id: "universe", label: "Universe", badge: c => c.universe },
    ] },
  { id: "book", label: "Book", glyph: "◱",
    badge: c => (c.held || null),
    items: [
      { id: "positions", label: "Positions", badge: c => (c.held || null) },
      { id: "track", label: "Track record" },
    ] },
  { id: "setup", label: "Setup", glyph: "⚙",
    items: [
      { id: "criteria", label: "Criteria", badge: c => c.criteria },
      { id: "feed", label: "Data feed" },
      { id: "help", label: "Help" },
      { id: "about", label: "About" },
    ] },
];

const UNI_KEY = "trinetra.universe";
const SYM_RE = /^[A-Z0-9&-]+$/; // NSE symbol charset
const HEADER_RE = /^(SYMBOL|SYMBOLS|TICKER|NAME|SCRIP|STOCK|CODE)$/; // spreadsheet header rows
const cleanSym = s => { const v = String(s ?? "").trim().toUpperCase().replace(/^"|"$/g, ""); return SYM_RE.test(v) ? v : ""; };
// Accepts commas, spaces, tabs, semicolons or newlines — so a pasted Excel
// column and a comma list both parse without the user picking a format.
function parseSymbols(text) {
  const out = [];
  for (const tok of String(text || "").split(/[\s,;]+/)) {
    const s = cleanSym(tok);
    if (!s || HEADER_RE.test(s) || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

async function tgSend(token, chatId, text) {
  try { const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }) }); return (await r.json()).ok; } catch { return false; }
}
const notify = (t, b) => { try { if ("Notification" in window && Notification.permission === "granted") new Notification(t, { body: b }); } catch {} };

/* ── atoms ── */
/* A partial lock is a different claim from a full one: one criterion could not
   be measured, so the eye is open on what was measurable. It gets amber, a
   dashed edge and no glow — never the same face as 3-of-3. */
function Eye({ ev, s = 14, quality }) {
  const partial = quality === "partial";
  const lit = partial ? T.amber : T.brass;
  return <div style={{ display: "flex", gap: 3 }} title={partial ? "Partial lock — one criterion had no data and was excluded" : undefined}>
    {ev.criteria.map(c => (
      <div key={c.id} title={c.name} style={{ width: s, height: s * 1.5, borderRadius: 2,
        background: c.pass ? lit : "transparent",
        border: (partial && c.pass ? "1px dashed " : "1px solid ") + (c.pass ? lit : c.na ? T.red + "55" : T.line),
        boxShadow: ev.locked && !partial ? "0 0 10px " + T.brass + "55" : "none",
        transition: "all .6s cubic-bezier(.2,.8,.2,1)" }} />
    ))}
  </div>;
}
function Spark({ hist, high20 }) {
  const w = 320, h = 64; const min = Math.min(...hist), max = Math.max(...hist, high20); const pad = (max - min) * .1 || 1;
  const y = v => h - ((v - min + pad) / (max - min + 2 * pad)) * h;
  const pts = hist.map((v, i) => `${(i / (hist.length - 1)) * w},${y(v)}`).join(" ");
  const up = hist.at(-1) >= hist[0];
  return <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 64 }}>
    <line x1="0" x2={w} y1={y(high20)} y2={y(high20)} stroke={T.dimSolid} strokeDasharray="3 4" strokeWidth="1" />
    <text x={w - 2} y={y(high20) - 4} textAnchor="end" fontSize="8" fill={T.dimSolid} fontFamily={T.mono}>20d high</text>
    <polyline points={pts} fill="none" stroke={up ? T.brass : T.red} strokeWidth="1.5" strokeLinejoin="round" />
  </svg>;
}
/* Fundamentals provenance at a glance — a stock evaluated on incomplete data
   should never look the same as one evaluated on complete data. */
const FUND_STATUS = {
  fetched:     { glyph: "●", color: T.brass, label: "complete" },
  partial:     { glyph: "◐", color: T.mute,  label: "partial — some fields missing" },
  unavailable: { glyph: "○", color: T.red,   label: "unavailable — scrape found nothing" },
  seed:        { glyph: "◌", color: T.dimSolid, label: "unverified seed — never scraped" },
};
function FundDot({ rec, size = 10 }) {
  const s = FUND_STATUS[rec?.status];
  if (!s) return null;
  const when = rec.fetchedAt ? new Date(rec.fetchedAt).toLocaleDateString("en-IN") : "";
  return <span title={`Fundamentals ${s.label}${rec.source ? " · " + rec.source : ""}${when ? " · " + when : ""}`}
    style={{ color: s.color, fontSize: size, fontFamily: T.mono, lineHeight: 1 }}>{s.glyph}</span>;
}

/* The Fundamentals chip glyph — a ledger page, in family with the eye and the
   doorway: same 1.1 stroke, same brass. */
function LedgerGlyph({ size = 13, color = T.brass }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 14" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <rect x="1.6" y="1" width="8.8" height="12" rx="1.4" stroke={color} strokeWidth="1.1" />
      <path d="M4 4.4h4M4 7h4M4 9.6h2.4" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/* Column headers live in a crowded table, so long catalog names get an
   abbreviation. Anything unabbreviated falls back to the first word — never to
   a truncation that could read as a different metric. */
const SHORT_LABEL = {
  roe: "ROE", roce: "ROCE", de: "D/E", pe: "P/E", pb: "P/B",
  dividendYield: "DIV YLD", opm: "OPM", profitGrowth: "PAT 3Y",
  salesGrowth3y: "SALES 3Y", promoter: "PROMOTER", epsGrowth3y: "EPS 3Y",
  pledged: "PLEDGED", piotroski: "PIOTROSKI",
};
const shortLabel = (key, label) => SHORT_LABEL[key] || label.split(" ")[0].toUpperCase();

function StatusDot({ state }) {
  const c = state === "live" ? T.green : state === "demo" ? T.brass : state === "error" ? T.red : T.dimSolid;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{ width: 7, height: 7, borderRadius: 99, background: c, boxShadow: state === "live" ? "0 0 8px " + c : "none",
      animation: state === "live" ? "breathe 2.4s ease-in-out infinite" : "none" }} />
  </span>;
}

export default function Trinetra() {
  const [onboarded, setOnboarded] = useState(true);   // no landing gate — see the About panel
  /* The brief is the landing view on a weekday morning, because that is when it
     is the only thing worth reading. It is a default, never a trap: the panel's
     "Dashboard →" closes it and this never fires again in the session. */
  const briefOffered = useRef(false);
  const [mode, setMode] = useState("demo"); // demo | live
  const [backendUrl, setBackendUrl] = useState(
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_BACKEND_URL
      ? process.env.NEXT_PUBLIC_BACKEND_URL : ""
  );
  const [conn, setConn] = useState({ state: "idle", lastSync: null, delayed: true, provider: "" });
  const [stocks, setStocks] = useState([]);
  useEffect(() => { setStocks(prev => (prev.length ? prev : makeUniverse())); }, []);
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [signals, setSignals] = useState([]);
  const [paused, setPaused] = useState(false);
  const [detail, setDetail] = useState(null);
  const [panel, setPanel] = useState(null);
  const [query, setQuery] = useState("");
  const [tg, setTg] = useState({ token: "", chatId: "", on: false, status: "" });
  /* What the backend says about its Telegram channel: masked proof of
     configuration, never the credentials. null until /config has been read. */
  const [tgRemote, setTgRemote] = useState(null);
  const [tgLoad, setTgLoad] = useState({ busy: false, err: "" });
  const [alertStatus, setAlertStatus] = useState(null);
  const [notifOn, setNotifOn] = useState(false);
  const [interval_, setInterval_] = useState(3);
  const alerted = useRef(new Set());
  const R = useRef({}); R.current = { tg, criteria, notifOn, mode, backendUrl };

  /* ── universe management (live backend only) ── */
  const [universe, setUniverse] = useState(null);      // server truth; null until fetched
  const [savedUni, setSavedUni] = useState(null);      // this browser's remembered list
  const [cap, setCap] = useState(null);                // learned from the server, never assumed
  const [lookupSymbol, setLookupSymbol] = useState("");
  const [navGroup, setNavGroup] = useState(null);
  const [briefOpen, setBriefOpen] = useState(true);
  useEffect(() => { try { setBriefOpen(localStorage.getItem("trinetra.briefOpen") !== "0"); } catch {} }, []);
  /* State only; the fetch lives below, after liveBackend exists. */
  const [sizingCfg, setSizingCfg] = useState(null);
  const [holidayCount, setHolidayCount] = useState(null);
  /* Device-only, same value the Positions backup block writes. Read into state
     so the storage poll and the Retry button agree on whether it exists. */
  const [backupToken, setBackupToken] = useState("");
  useEffect(() => { try { setBackupToken(localStorage.getItem("trinetra.backupToken") || ""); } catch {} }, [panel]);
  const [uni, setUni] = useState({ busy: false, err: "", msg: "" });
  const [addSym, setAddSym] = useState("");
  const [bulk, setBulk] = useState({ open: false, mode: "add", text: "" });
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef(null);

  const liveBackend = mode === "live" && !!backendUrl;
  const api = p => backendUrl.replace(/\/$/, "") + p;
  const uniList = liveBackend && universe ? universe : stocks.map(s => s.symbol);
  const readCache = () => { try { return JSON.parse(localStorage.getItem(UNI_KEY) || "null"); } catch { return null; } };
  const rememberUni = list => { setSavedUni(list); try { localStorage.setItem(UNI_KEY, JSON.stringify(list)); } catch {} };
  useEffect(() => { setSavedUni(readCache()); }, []);

  /* ── fundamentals: scraped server-side, surfaced with honest status ── */
  const [funds, setFunds] = useState({});
  const [fundBusy, setFundBusy] = useState("");  // symbol mid-refresh, or "all"
  const [fundMsg, setFundMsg] = useState("");
  const [fundCoverage, setFundCoverage] = useState(null);
  /* ── watchlist groups, filter and sort ───────────────────────────
     Groups come from the backend (/watchlists); the union of every group is
     what the engine scans, so a group is a view, never a second universe.
     Sort and filter live in component state on purpose: they are how you are
     looking right now, not a preference worth persisting. */
  /* ── profiles ─────────────────────────────────────────────────────
     The engine now evaluates four horizons independently; config.criteria is
     no longer what it reads. Every snapshot row carries profileResults, so the
     lock meters switch horizon without another request. */
  const [profiles, setProfiles] = useState(null);
  const [canonicalState, setCanonicalState] = useState({ matches: true, canonical: null });
  const [restoring, setRestoring] = useState(false);
  /* "All profiles" is the honest default: the app's job on open is to say what
     needs you anywhere, not what one horizon happens to think. Narrowing is a
     deliberate act, so it lives in a dropdown rather than a row of chips that
     all look equally chosen. */
  const [profileSel, setProfileSel] = useState("ALL");
  const [held, setHeld] = useState(() => new Set());       // symbols marked as holdings
  const [events, setEvents] = useState({});                // { SYMBOL: { events: [...], stale, source } }
  const [holdBusy, setHoldBusy] = useState("");

  const [groups, setGroups] = useState(null);           // { name: [symbols] } | null until read
  const [groupSel, setGroupSel] = useState("ALL");
  const [wlSort, setWlSort] = useState({ key: "criteria", dir: "desc" });
  const [wlFilter, setWlFilter] = useState({ minCount: 0, sector: "", signalToday: false });
  const [picked, setPicked] = useState(() => new Set()); // multi-select for Move to…
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupMsg, setGroupMsg] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [renaming, setRenaming] = useState(null);        // { from, to }

  const [fundSort, setFundSort] = useState({ key: "symbol", dir: "asc" });
  const [fundDraft, setFundDraft] = useState({ metric: "roce", op: "gte", value: 20 });

  const loadFundamentals = useCallback(async url => {
    const base = (url || backendUrl).replace(/\/$/, "");
    try {
      const res = await fetch(base + "/fundamentals");
      const j = await res.json();
      if (j && typeof j === "object" && !Array.isArray(j)) setFunds(j);
    } catch { /* the feed panel already reports connection trouble */ }
    /* How much of the universe has fundamentals cached. Below 100% the engine
       cannot evaluate the fundamentals criterion for the uncovered names and
       reports it as notEvaluated — so a lock there rests on two criteria, not
       three. Separate call, separate failure: an older backend without this
       route must not take the matrix down with it. */
    try {
      const c = await fetch(base + "/fundamentals/coverage").then(r => (r.ok ? r.json() : null));
      if (c && typeof c.pct === "number") setFundCoverage(c);
    } catch { /* optional surface */ }
  }, [backendUrl]);

  // Scrapes finish in the background, so poll while the panel is open.
  useEffect(() => {
    if (!liveBackend || panel !== "universe") return;
    const id = setInterval(() => loadFundamentals(), 20_000);
    return () => clearInterval(id);
  }, [liveBackend, panel, loadFundamentals]);

  const refreshFund = async symbol => {
    setFundBusy(symbol); setFundMsg("");
    try {
      const res = await fetch(api("/fundamentals/refresh"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) });
      const rec = await res.json();
      if (!res.ok) throw new Error(rec.error || `HTTP ${res.status}`);
      setFunds(f => ({ ...f, [symbol]: rec }));
      setFundMsg(`${symbol}: ${rec.status}${rec.source ? " via " + rec.source : ""}`);
    } catch (e) { setFundMsg(`${symbol}: refresh failed — ${e.message}`); }
    finally { setFundBusy(""); }
  };

  const refreshAllFunds = async () => {
    setFundBusy("all"); setFundMsg("Scraping — paced ~1s per symbol, this takes a while…");
    try {
      const res = await fetch(api("/fundamentals/refresh-all"), { method: "POST" });
      const s = await res.json();
      if (!res.ok) throw new Error(s.error || `HTTP ${res.status}`);
      setFundMsg(`${s.refreshed} fetched · ${s.partial} partial · ${s.unavailable} unavailable`);
      loadFundamentals();
    } catch (e) { setFundMsg("Refresh-all failed — " + e.message); }
    finally { setFundBusy(""); }
  };

  /* Groups are read once a live backend is known, and re-read after every
     mutation from the server's own response — the API returns the whole map,
     so the UI never has to guess what the server ended up with. */
  const track = useMemo(() => (backendUrl ? trackApi(backendUrl) : null), [backendUrl]);
  const desk = useMemo(() => (backendUrl ? deskApi(backendUrl) : null), [backendUrl]);

  const loadProfiles = useCallback(async () => {
    if (!desk) return;
    try {
      const j = await desk.profiles();
      setProfiles(j?.profiles || null);
      setCanonicalState({ matches: j?.matchesCanonical !== false, canonical: j?.canonical || null, originalFour: j?.originalFour || null });
    }
    catch { /* older backend: the single-criteria editor keeps working */ }
  }, [desk]);

  const [cycleBySymbol, setCycleBySymbol] = useState({});
  const loadHeld = useCallback(async () => {
    if (!desk) return;
    try {
      const j = await desk.holdings();
      const open = (j?.holdings || []).filter(h => h.status !== "closed");
      setHeld(new Set(open.map(h => h.symbol)));
      setCycleBySymbol(Object.fromEntries(open.filter(h => h.cycle?.status && h.cycle.status !== "full").map(h => [h.symbol, h.cycle])));
    } catch { /* holdings are optional on older backends */ }
  }, [desk]);

  /* Scraped event dates. Absence means "could not establish", never "no event",
     so a missing chip is never rendered as safety. */
  const loadEvents = useCallback(async () => {
    if (!desk) return;
    try { const j = await desk.events(); setEvents(j?.events || {}); }
    catch { /* optional surface */ }
  }, [desk]);

  /* Does anything the user types here survive a redeploy. Re-checked on a slow
     interval rather than read once at load: a store can be pushing cleanly when
     the page opens and have started failing by the time they enter a call into
     it, and that window is exactly when the banner needs to appear. */
  const [storage, setStorage] = useState(null);
  const loadStorage = useCallback(async () => {
    if (!desk || !backendUrl) return;
    /* /storage is gated behind the backup token now, and rightly so — it names
       the private repo and the files pending on disk. But whether anything is
       being saved at all is not a secret, and a banner that only appears for
       token-holders would leave everyone else silently unwarned. /health
       carries the public subset (mode, durable, detail, fix); read that first
       so the warning always renders, then enrich from /storage when this device
       has the token, for pendingFiles, repo and the Retry button. */
    let base = null;
    try {
      const h = await fetch(backendUrl.replace(/\/$/, "") + "/health", { cache: "no-store" }).then(r => r.json());
      base = h?.storage || null;
    } catch { /* offline — leave whatever was last known */ }

    if (backupToken) {
      try { setStorage({ ...(base || {}), ...(await desk.storage(backupToken)) }); return; }
      catch { /* wrong or missing token: the public view is still worth showing */ }
    }
    setStorage(base);
  }, [desk, backendUrl, backupToken]);

  useEffect(() => { if (liveBackend) { loadProfiles(); loadHeld(); loadEvents(); loadStorage(); } },
    [liveBackend, loadProfiles, loadHeld, loadEvents, loadStorage]);

  useEffect(() => {
    if (!liveBackend) return;
    const id = setInterval(loadStorage, 120000);
    return () => clearInterval(id);
  }, [liveBackend, loadStorage]);

  /* Read purely so the setup card can say what is missing. Cheap, once.
     Declared here rather than beside its useState: it reads liveBackend, which
     is defined further down the component, and a hook above that line throws
     on first render. Third time this file has caught me that way. */
  useEffect(() => {
    if (!liveBackend || !desk || !backendUrl) return;
    desk.sizingConfig().then(setSizingCfg).catch(() => {});
    fetch(backendUrl.replace(/\/$/, "") + "/alerts/status", { cache: "no-store" })
      .then(r => r.json())
      .then(j => setHolidayCount(j?.holidaysLoaded ?? j?.holidays?.length ?? null))
      .catch(() => {});
  }, [liveBackend, desk, backendUrl]);

  /* profileResults carries lockQuality per profile on every snapshot row, so the
     live state covers stocks that are partially locked right now without ever
     having fired — which a /signals poll cannot see. */
  const lockInfo = useMemo(() => {
    const key = profileSel === "ALL" ? "swing" : profileSel;
    const m = {};
    for (const s of stocks) {
      const pr = s.profileResults?.[key];
      /* withheldForMissingData is a third state, not a shade of "no". It means
         every criterion that could be judged passed, and the profile refused to
         lock only because one could not be judged at all. Folding that into
         silence loses the difference between "this failed" and "we could not
         tell" — which is the entire reason requireAll exists. */
      if (pr?.lockQuality || pr?.withheldForMissingData) {
        const warnings = pr.warnings || pr.criteriaWarnings || [];
        /* A boolean, not a regex over the server's prose. The fallback that
           used to live here matched /^withheld\b/ against a warning string,
           which worked until the wording changed and then failed silently —
           the badge would simply stop appearing. Branch on fields; read
           sentences. */
        m[s.symbol] = { lockQuality: pr.lockQuality, lockedOn: pr.lockedOn,
          notEvaluated: pr.notEvaluated,
          withheld: !!pr.withheldForMissingData,
          requireAll: !!pr.requireAll,
          criteriaWarnings: warnings };
      }
    }
    return m;
  }, [stocks, profileSel]);

  /* One tap. No form, no modal, no confirmation — the user does not paper-trade
     and will not fill anything in. Entry price and the locked criteria are
     captured server-side from the snapshot. */
  const markHolding = async (symbol) => {
    if (!desk || held.has(symbol)) return;
    setHoldBusy(symbol);
    try { await desk.hold(symbol); setHeld(h => new Set([...h, symbol])); }
    catch { /* surfaced by the Positions tab, which owns holding state */ }
    finally { setHoldBusy(""); }
  };

  const loadGroups = useCallback(async () => {
    if (!track) return;
    try { const j = await track.watchlists(); setGroups(j?.groups || null); }
    catch { /* an older backend has no /watchlists — the UI falls back to one flat list */ }
  }, [track]);

  useEffect(() => { if (liveBackend) loadGroups(); }, [liveBackend, loadGroups]);

  // Every group mutation funnels through here so one place reports failure.
  const groupOp = async (fn, msg) => {
    setGroupBusy(true); setGroupMsg("");
    try {
      const j = await fn();
      if (j?.groups) setGroups(j.groups);
      setGroupMsg(msg || "");
      loadUniverse();          // the scan set may have changed
      setPicked(new Set());
    } catch (e) {
      setGroupMsg(e.message || "That did not work");
    } finally { setGroupBusy(false); }
  };

  const loadUniverse = useCallback(async url => {
    try {
      const res = await fetch((url || backendUrl).replace(/\/$/, "") + "/universe");
      const j = await res.json();
      if (!Array.isArray(j.symbols)) return;
      setUniverse(j.symbols);
      if (!readCache()) rememberUni(j.symbols); // first sight becomes the baseline
    } catch { /* the snapshot loop already surfaces connection trouble */ }
  }, [backendUrl]);

  // Every mutation goes through here: optimistic paint, then reconcile with the
  // server's cleaned list (it may have uppercased, deduped or capped differently).
  const uniPost = async (path, body, summarize) => {
    setUni({ busy: true, err: "", msg: "" });
    try {
      const res = await fetch(api(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setUniverse(j.symbols); rememberUni(j.symbols);
      setUni({ busy: false, err: "", msg: summarize ? summarize(j) : "" });
      return j;
    } catch (e) {
      // The server states its own cap when one is hit. Learn it rather than
      // carrying a guess that can only rot.
      const learned = capFromError(e.message);
      if (learned) setCap(learned);
      setUni({ busy: false, msg: "", err: /fetch|network/i.test(e.message)
        ? "Backend unreachable — a sleeping free instance takes ~30s to wake. Retry."
        : e.message });
      // Re-read from the backend rather than painting this browser's remembered
      // list back over it. The backend is the durable copy now; treating a
      // localStorage snapshot as the fallback is how a stale browser silently
      // overwrites a list the server got right.
      loadUniverse();
      return null;
    }
  };

  const addOne = async sym => {
    const s = cleanSym(sym);
    if (!s || uniList.includes(s)) return;
    setUniverse(u => (u ? [...u, s] : u));
    setAddSym("");
    const ok = await uniPost("/universe/add", { symbol: s });
    if (ok) afterAdd([s]);
  };
  // The scrape runs server-side after the response, so hint and re-poll.
  const afterAdd = syms => {
    setFundMsg(`Fetching fundamentals for ${syms.length === 1 ? syms[0] : syms.length + " symbols"}…`);
    setTimeout(() => loadFundamentals(), 3000);
    setTimeout(() => loadFundamentals(), 10000);
  };
  const removeOne = async sym => {
    setUniverse(u => (u ? u.filter(x => x !== sym) : u));
    await uniPost("/universe/remove", { symbol: sym });
  };
  const clearAll = async () => { setConfirmClear(false); setUniverse([]); await uniPost("/universe", { symbols: [] }, () => "Universe cleared."); };

  const submitBulk = async (raw, source) => {
    const parsed = parseSymbols(raw);
    if (!parsed.length) { setUni({ busy: false, err: "Nothing recognizable in that " + source + ".", msg: "" }); return; }
    if (bulk.mode === "remove") {
      const present = parsed.filter(s => uniList.includes(s));
      if (!present.length) { setUni({ busy: false, err: "None of those symbols are in the universe.", msg: "" }); return; }
      const j = await uniPost("/universe/bulk-remove", { symbols: present }, r => `Removed ${r.removed}.`);
      if (j) setBulk(b => ({ ...b, text: "" }));
      return;
    }
    const fresh = parsed.filter(s => !uniList.includes(s));
    const dupes = parsed.length - fresh.length;
    if (!fresh.length) {
      setUni({ busy: false, msg: "", err: `All ${parsed.length} already present.` });
      return;
    }
    /* Send everything new and let the server apply its own cap. Trimming the
       list here against a locally-held number is what silently dropped symbols
       the backend would have taken. */
    const j = await uniPost("/universe/bulk-add", { symbols: fresh }, r =>
      `Added ${r.added}, skipped ${dupes + (r.skipped || 0)}` + (dupes ? " (already present / invalid)" : ""));
    if (j) { setBulk(b => ({ ...b, text: "" })); afterAdd(fresh); }
  };

  const onFile = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    e.target.value = ""; // let the same file be picked again after a fix
    try {
      const text = await f.text();
      // CSV: take the first column of each row. TXT: every token.
      const raw = /\.csv$/i.test(f.name) ? text.split(/\r?\n/).map(l => l.split(",")[0]).join("\n") : text;
      setBulk(b => ({ ...b, open: true, mode: "add", text: raw }));
      await submitBulk(raw, "file");
    } catch { setUni({ busy: false, err: "Could not read that file.", msg: "" }); }
  };

  const exportTxt = () => {
    const blob = new Blob([uniList.join("\n") + "\n"], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "trinetra-universe.txt";
    a.click(); URL.revokeObjectURL(a.href);
  };
  const copyUni = async () => {
    try { await navigator.clipboard.writeText(uniList.join("\n")); setUni(u => ({ ...u, err: "", msg: `Copied ${uniList.length} symbols.` })); }
    catch { setUni(u => ({ ...u, err: "Clipboard blocked — use Download instead.", msg: "" })); }
  };
  // Free-tier redeploys wipe universe.runtime.json. Offer a one-click restore
  // rather than pushing silently — a silent push would resurrect deletions.
  const staleServerList = liveBackend && universe && savedUni?.length &&
    (savedUni.length !== universe.length || savedUni.some((s, i) => s !== universe[i]));

  const fireAlerts = useCallback(list => {
    const r = R.current;
    list.forEach(s => {
      const ev = evaluate(s, r.criteria);
      if (ev.locked && !alerted.current.has(s.symbol)) {
        alerted.current.add(s.symbol);
        const time = new Date().toLocaleTimeString("en-IN", { hour12: false });
        setSignals(sig => [{ symbol: s.symbol, name: s.name, price: s.price, time, ev }, ...sig].slice(0, 50));
        const msg = `👁 TRINETRA · ${s.symbol} — all ${ev.total} criteria locked @ ₹${fmtIN(s.price)} · vol ${ev.volX.toFixed(1)}× · ${ev.dayChg >= 0 ? "+" : ""}${ev.dayChg.toFixed(1)}%`;
        notify("TRINETRA · " + s.symbol, msg);
        // In live mode the backend sends Telegram; only send here in demo so you can test the pipe.
        if (r.mode === "demo" && r.tg.on && r.tg.token && r.tg.chatId) tgSend(r.tg.token, r.tg.chatId, msg);
      }
    });
  }, []);

  /* One control used to drive two very different costs. A demo tick is local
     arithmetic and free at 3s; a live poll re-downloads the whole snapshot,
     which is ~11 KB per symbol — 3.4 MB at 303 names, 11 MB at 1000. At the
     3s default that is ~68 MB a minute on a phone.

     And it buys nothing: the feed is fifteen minutes delayed, so polling every
     three seconds fetches identical bytes some three hundred times per actual
     refresh. The floor is derived from the feed's own staleness rather than
     picked — faster than the data changes is not fresher, only more expensive. */
  const pollSeconds = useMemo(() => {
    if (mode === "demo") return interval_;                 // local, costs nothing
    const floor = conn.delayed ? 60 : 5;
    return Math.max(interval_, floor);
  }, [mode, interval_, conn.delayed]);

  useEffect(() => {
    if (paused) return;
    const tick = async () => {
      const r = R.current;
      if (r.mode === "demo") { setStocks(prev => { const n = prev.map(demoTick); fireAlerts(n); return n; }); return; }
      if (!r.backendUrl) return;
      try {
        const res = await fetch(r.backendUrl.replace(/\/$/, "") + "/snapshot");
        const j = await res.json();
        setConn(c => ({ ...c, state: "live", lastSync: new Date().toLocaleTimeString("en-IN", { hour12: false }), delayed: j.delayed, provider: j.provider }));
        setStocks(prev => {
          const by = Object.fromEntries(prev.map(p => [p.symbol, p]));
          const n = (j.data || []).map(d => { const old = by[d.symbol]; const hist = old ? [...old.hist.slice(-59), d.price] : [d.price]; return { hist, ...d, fund: d.fund || null }; });
          fireAlerts(n); return n;
        });
      } catch { setConn(c => ({ ...c, state: "error" })); }
    };
    /* Leading edge, then the interval. setInterval alone waits a full period
       before the first call — harmless at the old 3s default, but once the live
       floor became 60s it meant a minute of demo prices on screen after every
       load, with nothing saying they were demo. */
    tick();
    const id = setInterval(tick, pollSeconds * 1000);
    return () => clearInterval(id);
  }, [paused, pollSeconds, fireAlerts]);

  /* Credentials are only ever sent when the user actually typed them. The panel
     never holds the real token — /config returns a mask — so posting the fields
     unconditionally would push empty strings over a channel armed from the
     server's environment and silently disarm it. The backend now refuses blank
     and masked values, but the client must not depend on that: this app also
     talks to older backends. No creds typed → the telegram block is omitted
     entirely and the POST is a pure criteria sync. */
  const typedTelegram = () => {
    const token = tg.token.trim(), chatId = tg.chatId.trim();
    if (!token && !chatId) return null;
    return { on: tg.on, ...(token ? { token } : {}), ...(chatId ? { chatId } : {}) };
  };

  /* Read the armed state on demand rather than at startup: a panel that has
     never been opened has no business asking the backend about credentials. */
  const loadAlertConfig = useCallback(async () => {
    if (mode !== "live" || !backendUrl) return;
    setTgLoad({ busy: true, err: "" });
    try {
      const res = await fetch(backendUrl.replace(/\/$/, "") + "/config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      // An older backend returns no telegram block at all — say "unknown"
      // rather than render a confident "not armed" that may be false.
      setTgRemote(j?.alerts?.telegram || null);
      setTgLoad({ busy: false, err: j?.alerts?.telegram ? "" : "This backend does not report alert status." });
    } catch (e) {
      setTgRemote(null);
      setTgLoad({ busy: false, err: "Could not read the backend's alert status — " + e.message });
    }
  }, [mode, backendUrl]);

  useEffect(() => { if (panel === "alerts") loadAlertConfig(); }, [panel, loadAlertConfig]);
  useEffect(() => {
    if (panel !== "alerts" || !desk) return;
    desk.alertsStatus().then(setAlertStatus).catch(() => setAlertStatus(null));
  }, [panel, desk]);

  const pushConfig = async () => {
    if (mode !== "live" || !backendUrl) return null;
    const creds = typedTelegram();
    try {
      const res = await fetch(backendUrl.replace(/\/$/, "") + "/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria, ...(creds ? { alerts: { telegram: creds } } : {}) }),
      });
      const j = await res.json().catch(() => null);
      // The response carries the masked truth — adopt it rather than guess.
      if (j?.config?.alerts?.telegram) setTgRemote(j.config.alerts.telegram);
      return j;
    } catch { return null; }
  };

  const connect = async () => {
    setConn(c => ({ ...c, state: "connecting" }));
    try {
      const res = await fetch(backendUrl.replace(/\/$/, "") + "/health");
      const j = await res.json();
      if (j.ok) { setMode("live"); setConn({ state: "live", lastSync: null, delayed: j.delayed, provider: j.provider }); loadUniverse(backendUrl); loadFundamentals(backendUrl); return true; }
    } catch {}
    setConn(c => ({ ...c, state: "error" })); return false;
  };

  useEffect(() => {
    if (briefOffered.current || !onboarded || !liveBackend) return;
    briefOffered.current = true;
    const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const weekday = ist.getDay() >= 1 && ist.getDay() <= 5;
    if (weekday && ist.getHours() < 11) setPanel("brief");
  }, [onboarded, liveBackend]);

  // Auto-connect once if a backend URL was baked in via env (Vercel deploy).
  const autoTried = useRef(false);
  useEffect(() => {
    if (!autoTried.current && backendUrl && mode === "demo") {
      autoTried.current = true;
      connect();
    }
  }, []); // eslint-disable-line

  /* ── fundamentals matrix ───────────────────────────────────────────
     Columns come from the data, not from a list in this file: the named
     catalog first, then any key the backend has started sending that this
     build does not know about. That is what makes a metric added on the
     backend show up here on the next scrape with no frontend release.     */
  const fundCrit = criteria.find(c => c.id === "fund");
  const fundChecks = fundCrit?.checks || [];
  const fundRecFor = useCallback(
    sym => funds[sym] || stocks.find(s => s.symbol === sym)?.fund || null,
    [funds, stocks]);

  const fundColumns = useMemo(() => {
    const known = Object.keys(FUND_METRICS);
    const seen = new Set(known);
    const extra = [];
    for (const rec of [...Object.values(funds), ...stocks.map(s => s.fund)]) {
      if (!rec) continue;
      for (const k of Object.keys(rec)) {
        if (FUND_NON_METRIC.has(k) || seen.has(k) || typeof rec[k] === "object") continue;
        seen.add(k); extra.push(k);
      }
    }
    return [...known, ...extra];
  }, [funds, stocks]);

  const fundRows = useMemo(() => {
    const rows = uniList.map(sym => {
      const rec = fundRecFor(sym);
      // Evaluate against a stock-shaped object so one code path judges a cell
      // here and a gate in the detail drawer — they cannot disagree.
      const asStock = { fund: rec || undefined };
      const verdicts = {};
      for (const ch of fundChecks) {
        const r = checkOk(asStock, ch);
        const prev = verdicts[ch.metric];
        // Two checks on one metric: the cell passes only if both do.
        verdicts[ch.metric] = prev ? { ...r, ok: prev.ok && r.ok, na: prev.na || r.na } : r;
      }
      return { sym, rec, verdicts, pass: fundChecks.length > 0 && fundChecks.every(ch => checkOk(asStock, ch).ok) };
    });
    const { key, dir } = fundSort;
    const sign = dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (key === "symbol") return sign * a.sym.localeCompare(b.sym);
      const av = a.rec?.[key], bv = b.rec?.[key];
      // Missing data sorts last in both directions — it is not a low value.
      if (av == null && bv == null) return a.sym.localeCompare(b.sym);
      if (av == null) return 1;
      if (bv == null) return -1;
      return sign * (av - bv);
    });
    return rows;
  }, [uniList, fundRecFor, fundChecks, fundSort]);

  const toggleFundSort = key => setFundSort(s =>
    s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "symbol" ? "asc" : "desc" });
  const addFundCheck = () => {
    const { metric, op, value } = fundDraft;
    if (!metric || Number.isNaN(+value)) return;
    upCrit("fund", c => ({ ...c, checks: [...c.checks, { metric, op, value: +value }] }));
  };
  const fundPassCount = fundRows.filter(r => r.pass).length;

  /* Which lists a symbol sits in. The snapshot row carries `groups` and is
     re-tagged by the backend on every watchlist mutation (API.md → /snapshot),
     so it is the truth; the /watchlists map is only the fallback for a symbol
     not currently in the snapshot. */
  const groupsOf = useCallback((sym, row) => {
    if (Array.isArray(row?.groups)) return row.groups;
    return groups ? Object.entries(groups).filter(([, syms]) => syms.includes(sym)).map(([n]) => n) : [];
  }, [groups]);
  const firedToday = useMemo(() => {
    const today = new Date().toDateString();
    return new Set(signals.filter(g => new Date(g.at || Date.now()).toDateString() === today).map(g => g.symbol));
  }, [signals]);
  const sectors = useMemo(() => [...new Set(stocks.map(s => s.sector).filter(Boolean))].sort(), [stocks]);

  /* Sort keys are the market metrics plus every fundamental the backend sends,
     so the list can be ordered by anything the Fundamentals tab can show. */
  /* Per-profile decision summaries ride on each snapshot row as `decisions`,
     keyed by profile id — so ranking today's list by what actually matters costs
     no extra request. Only offered when a single horizon is selected: a
     confidence score means nothing averaged across four of them. */
  const decisionOf = useCallback(s => (profileSel === "ALL" ? null : s.decisions?.[profileSel]), [profileSel]);

  const WL_SORTS = useMemo(() => ([
    ["criteria", "Criteria met"], ["symbol", "Symbol"], ["price", "Price"],
    ["dayChgPct", "Day change %"], ["volMultiple", "Volume ×"],
    ...(profileSel !== "ALL"
      ? [["confidence", "Confidence"], ["remaining", "Remaining potential"], ["rr", "Risk : reward"]]
      : []),
    ...fundColumns.map(k => [k, metricMeta(k).label]),
  ]), [fundColumns, profileSel]);

  /* Lock meters follow the selected profile. profileResults is computed by the
     same engine server-side, so switching horizon does not re-evaluate anything
     here — it reads a different answer to a different question. */
  const evalFor = useCallback(s => {
    const base = evaluate(s, criteria);
    const pr = profileSel !== "ALL" ? s.profileResults?.[profileSel] : null;
    if (!pr) return base;
    return { ...base, criteria: pr.criteria || base.criteria, count: pr.count ?? base.count,
             total: pr.total ?? base.total, locked: !!pr.locked };
  }, [criteria, profileSel]);

  /* In "All profiles" the row says which horizons currently satisfy it. */
  const profilesSatisfied = useCallback(s =>
    s.profilesLocked || Object.entries(s.profileResults || {}).filter(([, r]) => r?.locked).map(([id]) => id), []);

  /* appliesTo: "holdings" — a trim signal on a stock the user does not own is a
     short recommendation, which is out of scope for this app. */
  const holdingsOnlyProfile = profileSel !== "ALL" && profiles?.[profileSel]?.appliesTo === "holdings";

  const ranked = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = stocks.map(s => ({ s, ev: evalFor(s), tags: groupsOf(s.symbol, s), locks: profilesSatisfied(s) }))
      .filter(({ s, ev, tags }) => {
        if (q && !s.symbol.toLowerCase().includes(q) && !(s.name || "").toLowerCase().includes(q)) return false;
        if (groupSel !== "ALL" && !tags.includes(groupSel)) return false;
        if (holdingsOnlyProfile && !held.has(s.symbol)) return false;
        if (wlFilter.minCount && ev.count < wlFilter.minCount) return false;
        if (wlFilter.sector && s.sector !== wlFilter.sector) return false;
        if (wlFilter.signalToday && !firedToday.has(s.symbol)) return false;
        return true;
      });
    const { key, dir } = wlSort;
    const sign = dir === "asc" ? 1 : -1;
    /* The three "no number" cases are not interchangeable and must not collapse
       into one bucket: noEstimate is by design (long term), insufficientHistory
       is too few analogs, and 0-with-exhausted is a real range that is spent —
       which sorts as the low value it is, not as missing. null means no view,
       never no upside, so it sorts last in both directions. */
    const valueOf = ({ s, ev }) =>
      key === "confidence" ? decisionOf(s)?.confidence?.score ?? null
      : key === "remaining" ? (decisionOf(s)?.noEstimate || decisionOf(s)?.insufficientHistory ? null : decisionOf(s)?.remainingMedianPct ?? null)
      : key === "rr" ? decisionOf(s)?.rrToPrimary ?? null
      : key === "criteria" ? ev.count
      : key === "price" ? s.price
      : key === "dayChgPct" ? ev.dayChg
      : key === "volMultiple" ? ev.volX
      : metricMeta(key).get(s);
    rows.sort((a, b) => {
      if (key === "symbol") return sign * a.s.symbol.localeCompare(b.s.symbol);
      const av = valueOf(a), bv = valueOf(b);
      const an = av == null || Number.isNaN(av), bn = bv == null || Number.isNaN(bv);
      if (an && bn) return a.s.symbol.localeCompare(b.s.symbol);
      if (an) return 1;                    // missing data sorts last, both directions
      if (bn) return -1;
      return sign * (av - bv) || (b.ev.volX || 0) - (a.ev.volX || 0);
    });
    return rows;
  }, [stocks, criteria, query, groupSel, groupsOf, wlSort, wlFilter, firedToday, evalFor, profilesSatisfied, decisionOf, holdingsOnlyProfile, held]);

  const activeFilters = [
    groupSel !== "ALL" && ["group", groupSel, () => setGroupSel("ALL")],
    wlFilter.minCount > 0 && ["min", `${wlFilter.minCount}+ criteria`, () => setWlFilter(f => ({ ...f, minCount: 0 }))],
    wlFilter.sector && ["sector", wlFilter.sector, () => setWlFilter(f => ({ ...f, sector: "" }))],
    wlFilter.signalToday && ["signal", "fired today", () => setWlFilter(f => ({ ...f, signalToday: false }))],
  ].filter(Boolean);

  const askNotif = async () => { if ("Notification" in window) setNotifOn((await Notification.requestPermission()) === "granted"); };
  const testTg = async () => { setTg(t => ({ ...t, status: "sending…" })); const ok = await tgSend(tg.token, tg.chatId, "✅ TRINETRA test — channel live."); setTg(t => ({ ...t, status: ok ? "Delivered from this browser" : "Failed — check token & chat id" })); };

  /* Saving clears the inputs on success: holding a token in a text box after it
     has been handed to the server is a credential sitting on screen for no
     reason. The masked armed line is the receipt. */
  const saveTelegram = async () => {
    setTg(t => ({ ...t, status: "saving…" }));
    const j = await pushConfig();
    if (j?.config?.alerts?.telegram?.configured) {
      setTg(t => ({ ...t, token: "", chatId: "", status: "Saved to backend" }));
    } else {
      setTg(t => ({ ...t, status: j ? "Backend did not confirm — check its logs" : "Could not reach the backend" }));
      loadAlertConfig();
    }
  };

  const upCrit = (id, fn) => setCriteria(cs => cs.map(c => c.id === id ? fn(c) : c));
  const addCriterion = () => setCriteria(cs => [...cs, { id: "c" + Date.now(), key: "·", name: "New criterion", enabled: true, builtin: false, checks: [{ metric: "dayChgPct", op: "gte", value: 3 }] }]);
  const inS = { background: T.bg, border: "1px solid " + T.line, color: T.ink, fontFamily: T.mono, fontSize: 11, borderRadius: 6, padding: "6px 8px" };
  const activeCount = criteria.filter(c => c.enabled).length;
  const kronCrit = criteria.find(c => c.id === "kron");
  /* While parked the criterion reads as off everywhere, whatever the stored
     state says — a stale "on" must never reach the eye and mute every signal. */
  const kronEnabled = ORACLE_ENABLED && !!kronCrit?.enabled;
  const kronThreshold = kronCrit?.checks?.[0]?.value ?? 2;
  const toggleKron = () => { if (ORACLE_ENABLED) upCrit("kron", x => ({ ...x, enabled: !x.enabled })); };
  // is the oracle actually feeding data? check if any stock carries a forecast
  const oracleLive = ORACLE_ENABLED && stocks.some(s => s.fcst);
  const oracleEngine = ORACLE_ENABLED ? (stocks.find(s => s.fcst)?.fcst?.engine || null) : null;

  /* Belt and braces: the toggle is the only way in, but if the criterion ever
     arrives enabled (restored state, a synced backend config), park it off
     rather than let a data-less gate quietly close the eye. */
  useEffect(() => {
    if (!ORACLE_ENABLED && kronCrit?.enabled) upCrit("kron", x => ({ ...x, enabled: false }));
  }, [kronCrit?.enabled]); // eslint-disable-line


  const css = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap');
    * { box-sizing: border-box; }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes breathe { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
    @keyframes irisIn { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: scale(1); } }
    .rise { animation: rise .45s cubic-bezier(.2,.8,.2,1); }
    ::-webkit-scrollbar { width: 8px; height: 8px; } ::-webkit-scrollbar-thumb { background: ${T.line}; border-radius: 8px; }
    button, input, select { font-family: inherit; } button { cursor: pointer; }
    input:focus, button:focus-visible, select:focus { outline: 1.5px solid ${T.brass}; outline-offset: 1px; }
    select { appearance: none; }
    @media (prefers-reduced-motion: reduce) { .rise, [style*=breathe], [style*=irisIn] { animation: none !important; } }
  `;

  /* The landing gate is gone: this is opened several times a day, and a click
     that says nothing new is friction. The framing and the disclaimer it used to
     carry now live in the About panel, one tap from the header. */

  const navCounts = {
    fired: signals.length, held: held.size,
    universe: uniList.length, criteria: activeCount,
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: T.sans }}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* top bar */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: T.bg + "F0", borderBottom: "1px solid " + T.line, backdropFilter: "blur(10px)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 30, height: 30, borderRadius: 99, border: "1px solid " + T.brass + "55", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 12, height: 12, borderRadius: 99, background: "radial-gradient(circle at 50% 45%," + T.brass + "," + T.brassDeep + ")", boxShadow: signals.length ? "0 0 10px " + T.brass : "none" }} />
            </div>
            <div>
              <div style={{ fontFamily: T.serif, fontSize: 22, lineHeight: .9 }}>Trinetra</div>
              <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: 2, color: T.dimSolid }}>NSE CONFLUENCE SCREENER</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setPanel("feed")} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 7, border: "1px solid " + T.line, background: T.card, color: T.mute, fontSize: 11 }}>
              <StatusDot state={mode === "live" ? conn.state : "demo"} />
              {mode === "live" ? (conn.state === "live" ? "Live" : conn.state === "error" ? "Error" : "Connecting") : "Demo"}
              {mode === "live" && conn.delayed && <span style={{ color: T.dimSolid, fontFamily: T.mono, fontSize: 9 }}>·15m</span>}
            </button>
            {/* In the header rather than the action strip: this answers a
                question you have while looking at something else, so it has to
                be reachable from wherever you are. */}
            <button onClick={() => { setLookupSymbol(""); setPanel("lookup"); }} title="Look up a symbol"
              style={{ padding: "6px 9px", borderRadius: 7, border: "1px solid " + T.line, background: T.card, color: T.mute, fontSize: 12 }}>⌕</button>
            <button onClick={() => setPanel("about")} title="About Trinetra"
              style={{ padding: "6px 9px", borderRadius: 7, border: "1px solid " + T.line, background: T.card, color: T.mute, fontSize: 12 }}>ⓘ</button>
            <button onClick={() => setPaused(p => !p)} title={paused ? "Resume" : "Pause"} style={{ padding: "6px 9px", borderRadius: 7, border: "1px solid " + T.line, background: T.card, color: T.mute, fontSize: 11 }}>{paused ? "▶" : "❚❚"}</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 16px 80px" }}>
        {/* Above the criteria notice on purpose: drifted criteria produce worse
            signals, an ephemeral store loses the record of every signal there
            has ever been. Not dismissible — see the note in StorageBanner. */}
        {/* Retry needs the backup token, same as /storage itself. Offering the
            button without one would hand the user a 401 dressed as an action. */}
        <StorageBanner storage={storage} onFlush={backupToken ? async () => {
          const r = await desk.flushStorage(backupToken);
          await loadStorage();
          return r;
        } : null} />
        <RestoredNote storage={storage} />

        {/* The three criteria are the point of the instrument. If the active set
            has drifted, say so where it cannot be missed — and make going back
            one tap. Never silently overwrite what the user chose. */}
        {liveBackend && profiles && canonicalState.matches === false && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14,
            background: T.brassSoft, border: "1px solid " + T.brass + "3A", borderRadius: 9, padding: "9px 12px" }}>
            <span style={{ fontSize: 12, color: T.mute, lineHeight: 1.5 }}>
              Your criteria differ from the default three — fundamentals, breakout, volume shocker.
            </span>
            <button disabled={restoring} style={{ ...btn(true), marginLeft: "auto" }}
              onClick={async () => {
                setRestoring(true);
                try { await desk.restoreDefaults(profileSel === "ALL" ? "swing" : profileSel); await loadProfiles(); }
                finally { setRestoring(false); }
              }}>{restoring ? "Restoring…" : "Restore defaults"}</button>
          </div>
        )}

        {/* Silent misconfiguration is the app's most common failure: capital sat
            at zero for months with sizing quietly switched off. Say it here. */}
        {liveBackend && (
          <SetupCard sizing={sizingCfg} storage={storage} holidayCount={holidayCount}
            alertsArmed={alertStatus ? !!(tg.on || notifOn) : null}
            onGo={id => setPanel(id)} />
        )}

        {/* ── Today ──────────────────────────────────────────────────────
            The brief was chip #7 of 11 — the screen that answers "what needs
            me today" was the hardest one to reach, and the app opened instead
            on 300 rows of table. It renders here, first, so the landing state
            is an answer rather than an inventory.

            Collapsible and remembered, because once it is read it is read, and
            a permanently expanded brief just pushes the watchlist down. */}
        {liveBackend && (
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setBriefOpen(o => { try { localStorage.setItem("trinetra.briefOpen", (!o) ? "1" : "0"); } catch {} return !o; })}
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "baseline", gap: 8, marginBottom: briefOpen ? 8 : 0 }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, color: T.brass }}>TODAY</span>
              <span style={{ fontSize: 10.5, color: T.dimSolid }}>{briefOpen ? "hide" : "show the morning brief"}</span>
            </button>
            {briefOpen && (
              <PraveshBoundary>
                <Brief backendUrl={backendUrl} live={liveBackend} onLeave={() => {}} />
              </PraveshBoundary>
            )}
          </div>
        )}

        {/* ── navigation ────────────────────────────────────────────────
            Eleven equally-weighted chips made the app a control panel: daily
            work, reference, configuration and a separate product all shouting
            at the same volume, leaving the triage to the user. Four groups,
            opened one at a time.

            Deliberately a navigation change only — every panel below is
            untouched and still keyed off `panel`, so this layer can be lifted
            out without disturbing anything it fronts. (Tag v1 is the flat
            strip, if this turns out to be worse.) */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          {NAV.map(g => {
            const on = navGroup === g.id;
            const here = g.items.some(i => i.id === panel);
            return (
              <button key={g.id} onClick={() => setNavGroup(on ? null : g.id)} style={chip(on || here)}>
                {g.glyph} {g.label}
                {g.badge?.(navCounts) != null && (
                  <span style={{ color: T.brass, fontFamily: T.mono }}>{g.badge(navCounts)}</span>
                )}
              </button>
            );
          })}
          {/* Pravesh is a different product read-only in here, not a section of
              this one. It keeps its own entry rather than hiding inside a group. */}
          <button onClick={() => setPanel("pravesh")} style={chip(panel === "pravesh")}>
            <DoorGlyph size={12} color={panel === "pravesh" ? T.brass : T.mute} /> Pravesh
          </button>
        </div>

        {/* the open group's members */}
        {navGroup && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9, paddingLeft: 2 }}>
            {(NAV.find(g => g.id === navGroup)?.items || []).map(it => (
              <button key={it.id} onClick={() => setPanel(it.id)}
                style={{ ...chip(panel === it.id), fontSize: 11, padding: "5px 9px" }}>
                {it.label}
                {it.badge?.(navCounts) != null && (
                  <span style={{ color: T.brass, fontFamily: T.mono }}> {it.badge(navCounts)}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* signals */}
        <section style={{ marginTop: 22 }}>
          {(() => {
            const warn = [...new Set(Object.values(lockInfo).flatMap(i => i?.criteriaWarnings || []))];
            return warn.length ? (
              <div style={{ background: T.amber + "10", border: "1px solid " + T.amber + "44", borderRadius: 9,
                padding: "9px 12px", marginBottom: 10, fontSize: 11.5, color: T.amber, lineHeight: 1.55 }}>
                {warn.map(w => <div key={w}>⚠ {w}</div>)}
              </div>
            ) : null;
          })()}
          <SectionLabel>Signals — the eye is open</SectionLabel>
          {signals.length === 0 ? (
            <div style={{ border: "1px dashed " + T.line, borderRadius: 12, padding: "28px 20px", textAlign: "center" }}>
              <div style={{ width: 34, height: 34, margin: "0 auto 12px", borderRadius: 99, border: "1px solid " + T.line, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 20, height: 3, borderRadius: 2, background: T.dimSolid }} />
              </div>
              <div style={{ fontSize: 13, color: T.mute }}>Watching in silence.</div>
              <div style={{ fontSize: 12, color: T.dimSolid, marginTop: 3 }}>A stock surfaces the moment all {activeCount} criteria lock together.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {signals.map((g, i) => (
                <button key={g.symbol + g.time + i} onClick={() => setDetail(g.symbol)} className="rise"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 11, padding: "13px 15px", textAlign: "left",
                    background: "linear-gradient(90deg," + T.brassSoft + ",transparent)", border: "1px solid " + T.brass + "3A" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 500 }}>{g.symbol}</span>
                      <span style={{ fontSize: 11, color: T.mute }}>{g.name}</span>
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 10.5, color: lockInfo[g.symbol]?.lockQuality === "partial" ? T.amber : T.brass, marginTop: 3 }}>
                      ₹{fmtIN(g.price)} · vol {g.ev.volX?.toFixed(1)}× · {g.ev.count}/{g.ev.total} locked
                      {lockInfo[g.symbol]?.lockQuality === "partial" && " · PARTIAL"}
                      {lockInfo[g.symbol]?.withheld && (
                        /* The server writes the "Withheld: … would otherwise have
                           locked on 3 of 4" sentence. Render that rather than a
                           second description of the same rule that cannot see
                           which criterion actually went missing. */
                        <span title={(lockInfo[g.symbol].criteriaWarnings || []).find(w => /^withheld/i.test(w))
                          || "Everything judgeable passed; held back because a criterion had no data."}
                          style={{ color: T.amber }}> · WITHHELD, NOT FAILED</span>
                      )}
                    </div>
                    {lockInfo[g.symbol]?.notEvaluated?.length > 0 && (
                      <div style={{ fontSize: 10.5, color: T.amber, marginTop: 3, lineHeight: 1.5 }}>
                        not evaluated: {lockInfo[g.symbol].notEvaluated.join(", ")} — locked on what could be measured
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Eye ev={g.ev} s={9} quality={lockInfo[g.symbol]?.lockQuality} />
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, marginTop: 4 }}>{g.time} IST</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* watchlist */}
        <section style={{ marginTop: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <SectionLabel muted>Watchlist · {ranked.length}{ranked.length !== stocks.length ? ` of ${stocks.length}` : ""}</SectionLabel>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" style={{ ...inS, fontFamily: T.sans, fontSize: 12, width: 130 }} />
          </div>

          {/* profile switcher — four horizons, evaluated independently server-side.
              Intraday is NOT gated: it runs on the delayed feed, because if the
              estimated remaining move exceeds what has already gone, the tail is
              still tradeable. The honesty mechanism is the confidence cap (55
              intraday / 65 delayed) and the lag line on the card — greying the
              chip would hide a feature that works. */}
          {profiles && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
              <span style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: 1.1, color: T.dimSolid }}>PROFILE</span>
              <select value={profileSel} onChange={e => setProfileSel(e.target.value)}
                style={{ ...chip(profileSel !== "ALL"), padding: "5px 9px", fontSize: 11.5, fontFamily: T.sans, appearance: "auto" }}>
                <option value="ALL">All profiles</option>
                {Object.entries(profiles).map(([id, p]) => (
                  <option key={id} value={id} disabled={p.enabled === false}>
                    {p.name || id}
                    {p.enabled === false ? " (off)" : ""}
                  </option>
                ))}
              </select>
              {/* The delayed-feed cap was a glyph on the chip; the dropdown has
                  nowhere to hang it, so it is stated beside the control. */}
              {profileSel !== "ALL" && (profiles[profileSel]?.horizon === "intraday" || profileSel === "intraday") && conn.delayed && (
                <span title="Runs on the delayed feed; confidence is capped at 55 for it"
                  style={{ color: T.amber, fontFamily: T.mono, fontSize: 9.5 }}>⏱ delayed</span>
              )}
              {profileSel !== "ALL" && (
                <button onClick={() => setProfileSel("ALL")}
                  style={{ ...chip(false), padding: "4px 9px", fontSize: 11 }}>Show all</button>
              )}
            </div>
          )}
          {/* Say what the cap is, where the horizon is chosen — not buried on a card. */}
          {profiles && profileSel !== "ALL" && (profiles[profileSel]?.horizon === "intraday" || profileSel === "intraday") && conn.delayed && (
            <div style={{ fontSize: 11, color: T.amber, marginBottom: 8, lineHeight: 1.5 }}>
              ⏱ Intraday runs on the ~15-minute delayed feed. Signals still fire, and confidence is capped at 55 —
              part of the move is already gone by the time you see it. Connecting Kite lifts the cap automatically.
            </div>
          )}

          {holdingsOnlyProfile && (
            <div style={{ fontSize: 11, color: T.amber, marginBottom: 8, lineHeight: 1.5 }}>
              This profile applies only to stocks you hold — showing your {held.size} holding{held.size === 1 ? "" : "s"}.
              A trim signal on a stock you do not own would be a short recommendation, which this app does not make.
            </div>
          )}

          {/* group selector — a slice of the same scan set, never a second universe */}
          {groups && Object.keys(groups).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              <button onClick={() => setGroupSel("ALL")} style={{ ...chip(groupSel === "ALL"), padding: "5px 10px", fontSize: 11.5 }}>
                All <span style={{ fontFamily: T.mono, color: T.dimSolid }}>{uniList.length}</span>
              </button>
              {Object.entries(groups).map(([name, syms]) => (
                <button key={name} onClick={() => setGroupSel(name)} style={{ ...chip(groupSel === name), padding: "5px 10px", fontSize: 11.5 }}>
                  {name} <span style={{ fontFamily: T.mono, color: T.dimSolid }}>{syms.length}</span>
                </button>
              ))}
            </div>
          )}

          {/* sort + filter */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <select value={wlSort.key} onChange={e => setWlSort(s => ({ ...s, key: e.target.value }))} style={{ ...inS, fontSize: 11 }}>
              {WL_SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <button onClick={() => setWlSort(s => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
              title={wlSort.dir === "asc" ? "Ascending" : "Descending"} style={{ ...btn(), padding: "5px 9px" }}>
              {wlSort.dir === "asc" ? "▲" : "▼"}
            </button>
            <select value={wlFilter.minCount} onChange={e => setWlFilter(f => ({ ...f, minCount: +e.target.value }))} style={{ ...inS, fontSize: 11 }}>
              <option value={0}>Any criteria met</option>
              {[1, 2, 3, 4, 5].filter(n => n <= activeCount).map(n => <option key={n} value={n}>{n}+ of {activeCount}</option>)}
            </select>
            {sectors.length > 0 && (
              <select value={wlFilter.sector} onChange={e => setWlFilter(f => ({ ...f, sector: e.target.value }))} style={{ ...inS, fontSize: 11 }}>
                <option value="">All sectors</option>
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <button onClick={() => setWlFilter(f => ({ ...f, signalToday: !f.signalToday }))}
              style={{ ...chip(wlFilter.signalToday), padding: "5px 10px", fontSize: 11.5 }}>
              ⚡ Signal today
            </button>
          </div>

          {activeFilters.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              {activeFilters.map(([k, label, clear]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 10,
                  color: T.mute, background: T.brassSoft, border: "1px solid " + T.brass + "3A", borderRadius: 6, padding: "3px 6px 3px 8px" }}>
                  {label}
                  <button onClick={clear} style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 10, padding: 0 }}>✕</button>
                </span>
              ))}
              <button onClick={() => { setGroupSel("ALL"); setWlFilter({ minCount: 0, sector: "", signalToday: false }); }}
                style={{ background: "none", border: "none", color: T.brass, fontFamily: T.mono, fontSize: 10 }}>clear all</button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {ranked.map(({ s, ev, tags, locks }) => (
              <div key={s.symbol} style={{ display: "flex", flexDirection: "column" }}>
              <button onClick={() => setDetail(s.symbol)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 10, padding: "11px 14px", textAlign: "left",
                  background: T.card, border: "1px solid " + (ev.locked ? T.brass + "55" : T.line), transition: "border-color .3s" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 500 }}>{s.symbol}</span>
                    <span style={{ fontSize: 11, color: T.dimSolid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.sector || s.name}</span>
                    {tags?.map(t => (
                      <span key={t} style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: .6, color: T.dimSolid,
                        border: "1px solid " + T.line, borderRadius: 4, padding: "1px 4px" }}>{t}</span>
                    ))}
                    {profileSel === "ALL" && locks?.map(l => (
                      <span key={l} title={`Locks on the ${l} profile`}
                        style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: .6, color: T.brass,
                          border: "1px solid " + T.brass + "55", borderRadius: 4, padding: "1px 4px" }}>{l}</span>
                    ))}
                    {/* These belong on the watchlist row, not only on a fired
                        signal. A partial lock may never fire, and a WITHHELD one
                        by definition did not — rendering it in the signals list
                        alone made that badge unreachable. Both are facts about a
                        stock you are watching, so they live where the stock is. */}
                    {lockInfo[s.symbol]?.lockQuality === "partial" && !lockInfo[s.symbol]?.withheld && (
                      <span title={"Locked without evaluating: " + ((lockInfo[s.symbol].notEvaluated || []).join(", ") || "a criterion")}
                        style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: .6, color: T.amber,
                          border: "1px solid " + T.amber + "55", borderRadius: 4, padding: "1px 4px" }}>PARTIAL</span>
                    )}
                    {lockInfo[s.symbol]?.withheld && (
                      /* The server writes "Withheld: … would otherwise have locked
                         on 3 of 4." Render its sentence rather than a second
                         description that cannot see which criterion went missing. */
                      <span title={(lockInfo[s.symbol].criteriaWarnings || []).find(w => /^withheld/i.test(w))
                        || "Everything judgeable passed; held back because a criterion had no data."}
                        style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: .6, color: T.amber,
                          border: "1px solid " + T.amber, borderRadius: 4, padding: "1px 4px" }}>WITHHELD</span>
                    )}
                    {events?.[s.symbol]?.events?.[0] && (
                      <span title={`${events[s.symbol].events[0].type} on ${events[s.symbol].events[0].date}`}
                        style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: .6, color: T.amber,
                          border: "1px solid " + T.amber + "55", borderRadius: 4, padding: "1px 4px" }}>
                        {events[s.symbol].events[0].type}
                        {(() => { const e = events[s.symbol].events[0];
                          const n = e.sessionsAway ?? e.daysAway;
                          return n != null ? ` in ${n}${e.sessionsAway != null ? " sess" : "d"}` : ""; })()}
                        {events[s.symbol].stale ? " ·stale" : ""}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.mute, marginTop: 2 }}>
                    ₹{fmtIN(s.price)}<span style={{ color: ev.dayChg >= 0 ? T.green : T.red, marginLeft: 7 }}>{ev.dayChg >= 0 ? "+" : ""}{ev.dayChg?.toFixed(1)}%</span>
                    {s.volPaceMultiple != null && (
                      <span title={`raw ${s.volumeRawMultiple}× so far, paced to a full session`}
                        style={{ color: T.dimSolid, marginLeft: 7 }}>
                        · {(+s.volPaceMultiple).toFixed(1)}× pace{s.volumeIsPartial && s.sessionFraction != null ? ` (${Math.round(s.sessionFraction * 100)}% of session)` : ""}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const d = profileSel !== "ALL" ? s.decisions?.[profileSel] : null;
                    if (!d) return null;
                    const c = d.confidence || {};
                    const potential = d.noEstimate ? "no estimate for this horizon"
                      : d.insufficientHistory ? `too few analogs (n=${d.analogsN ?? 0})`
                      : d.exhausted ? "typical move spent"
                      : d.remainingMedianPct != null ? `est. ${d.remainingMedianPct > 0 ? "+" : ""}${d.remainingMedianPct.toFixed(1)}% left · n=${d.analogsN ?? 0}` : null;
                    return (
                      <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {c.score != null && <span>conf {c.score} {c.band}{c.capped ? " · capped" : ""}</span>}
                        {potential && <span style={{ color: d.exhausted ? T.amber : T.dimSolid }}>{potential}</span>}
                        {d.rrToPrimary != null && <span style={{ color: d.rrToPrimary < 1 ? T.red : T.dimSolid }}>R:R {d.rrToPrimary.toFixed(1)}</span>}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <FundDot rec={funds[s.symbol]} />
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: ev.locked ? T.brass : T.dimSolid }}>{ev.count}/{ev.total}</span>
                  <Eye ev={ev} s={9} quality={lockInfo[s.symbol]?.lockQuality} />
                </div>
              </button>
              {liveBackend && (
                <div style={{ marginTop: -6, marginBottom: 2, display: "flex", justifyContent: "flex-end" }}>
                  {held.has(s.symbol)
                    ? <span style={{ fontFamily: T.mono, fontSize: 9, color: T.green }}>
                        ✓ holding
                        {cycleBySymbol[s.symbol] && (
                          <span style={{ color: T.amber }} title={cycleBySymbol[s.symbol].sellPrice ? `sold part at ₹${cycleBySymbol[s.symbol].sellPrice}` : undefined}>
                            {" · " + cycleBySymbol[s.symbol].status}
                          </span>
                        )}
                      </span>
                    : <button onClick={e => { e.stopPropagation(); markHolding(s.symbol); }} disabled={holdBusy === s.symbol}
                        style={{ background: "none", border: "none", color: T.brass, fontFamily: T.mono, fontSize: 9.5, cursor: "pointer", padding: 0 }}>
                        {holdBusy === s.symbol ? "marking…" : "+ I'm holding this"}
                      </button>}
                </div>
              )}
              </div>
            ))}
          </div>
        </section>

        <footer style={{ marginTop: 34, textAlign: "center", fontSize: 10.5, color: T.dimSolid, lineHeight: 1.6 }}>
          Decision support, not investment advice. Signals are candidates — entry, stops and sizing remain yours. Markets carry risk of loss.
        </footer>
      </main>

      {/* detail */}
      {detail && (() => {
        const s = stocks.find(x => x.symbol === detail); if (!s) return null;
        const ev = evaluate(s, criteria);
        return <Drawer onClose={() => setDetail(null)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: T.serif, fontSize: 26 }}>{s.symbol}</div>
              <div style={{ fontSize: 12, color: T.mute }}>{s.name}{s.sector ? " · " + s.sector : ""}</div>
              <div style={{ fontFamily: T.mono, fontSize: 13, marginTop: 5 }}>₹{fmtIN(s.price)}<span style={{ color: ev.dayChg >= 0 ? T.green : T.red, marginLeft: 8, fontSize: 11 }}>{ev.dayChg >= 0 ? "+" : ""}{ev.dayChg?.toFixed(2)}% today</span></div>
            </div>
            <Eye ev={ev} s={16} />
          </div>
          {s.hist?.length > 3 && <div style={{ marginTop: 16, background: T.bg, border: "1px solid " + T.line, borderRadius: 10, padding: 12 }}><Spark hist={s.hist} high20={s.high20} /></div>}
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {ev.criteria.map(c => (
              <div key={c.id} style={{ background: T.card, border: "1px solid " + (c.pass ? T.brass + "55" : T.line), borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontFamily: T.mono, fontSize: 11.5, letterSpacing: 1, color: c.pass ? T.brass : T.mute }}>{c.key} · {c.name.toUpperCase()}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10.5, color: c.pass ? T.green : c.na ? T.red : T.dimSolid }}>{c.pass ? "LOCKED" : c.na ? "NO DATA" : c.unverified ? "UNVERIFIED" : "OPEN"}</span>
                </div>
                {c.checksOut.map(chk => (
                  <div key={chk.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "1px dotted " + T.lineSoft }}>
                    <span style={{ color: T.mute, fontSize: 12 }}>{chk.label}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 12 }}><span>{chk.value}</span><span style={{ color: T.dimSolid, margin: "0 8px", fontSize: 10 }}>{chk.req}</span><span title={chk.unverified ? "Unverified — hand-entered seed value, never confirmed by a scrape" : undefined}
                      style={{ color: chk.unverified ? T.dimSolid : chk.ok ? T.green : T.red }}>{chk.unverified ? "◌" : chk.ok ? "✓" : "✗"}</span></span>
                  </div>
                ))}
                {c.id === "fund" && (() => {
                  const rec = funds[s.symbol];
                  const st = FUND_STATUS[rec?.status];
                  return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.5 }}>
                      {rec
                        ? <><FundDot rec={rec} /> {st?.label}{rec.source ? " · " + rec.source : ""}{rec.fetchedAt ? " · " + new Date(rec.fetchedAt).toLocaleDateString("en-IN") : ""}</>
                        : liveBackend
                          ? <><FundDot rec={{ status: "seed" }} /> never scraped — showing the committed seed. Unverified values cannot lock this gate.</>
                          : "Demo fundamentals (static)."}
                    </span>
                    {liveBackend && <button onClick={() => refreshFund(s.symbol)} disabled={!!fundBusy}
                      style={{ ...btn(), opacity: fundBusy ? .45 : 1 }}>
                      {fundBusy === s.symbol ? "Refreshing…" : "Refresh fundamentals"}
                    </button>}
                    {fundMsg.startsWith(s.symbol + ":") &&
                      <div style={{ fontSize: 10.5, width: "100%", color: /failed/.test(fundMsg) ? T.red : T.green }}>{fundMsg}</div>}
                  </div>;
                })()}
                {c.depthNote && Number.isNaN(METRICS.buyerPct.get(s)) && <div style={{ fontSize: 10.5, color: T.red, marginTop: 7 }}>Order-book depth needs Kite (live). Disabled on the free feed.</div>}
                {c.oracleNote && (s.fcst
                  ? <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 7 }}>
                      {s.fcst.horizon}-day path: {s.fcst.path?.map(p => "₹" + fmtIN(p)).join(" → ")} · engine: <span style={{ color: s.fcst.engine === "naive" ? T.red : T.brass }}>{s.fcst.engine}</span>. Probabilistic forecast, not a promise.
                    </div>
                  : ORACLE_ENABLED
                    ? <div style={{ fontSize: 10.5, color: T.red, marginTop: 7 }}>Needs the Oracle service (set ORACLE_URL on the backend). See the Kronos README in the package.</div>
                    : <div style={{ fontSize: 10.5, color: T.amber, marginTop: 7 }}>⏸ Forecasts paused — the free data source is rate-limited from the server. This criterion is off and is not counted.</div>)}
              </div>
            ))}
          </div>
          {liveBackend && (
            <PraveshBoundary>
              <StockDecision backendUrl={backendUrl} symbol={s.symbol} profileId={profileSel} price={s.price} />
            </PraveshBoundary>
          )}
          {liveBackend && (
            <div style={{ marginTop: 12 }}>
              {held.has(s.symbol)
                ? <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.green }}>✓ marked as a holding</span>
                : <button onClick={() => markHolding(s.symbol)} disabled={holdBusy === s.symbol} style={btn(true)}>
                    {holdBusy === s.symbol ? "marking…" : "I'm holding this"}
                  </button>}
            </div>
          )}
          <details style={{ marginTop: 14 }}>
            <summary style={{ fontFamily: T.mono, fontSize: 11, color: T.dimSolid, cursor: "pointer" }}>Raw snapshot (audit)</summary>
            <pre style={{ marginTop: 8, padding: 12, borderRadius: 8, background: T.bg, border: "1px solid " + T.line, fontSize: 10, color: T.mute, overflowX: "auto" }}>{JSON.stringify({ price: s.price, prevClose: s.prevClose, high20: s.high20, high52: +(+s.high52).toFixed(2), volToday: s.volToday, avgVol20: s.avgVol20, bidQty: s.bidQty, askQty: s.askQty, fund: s.fund }, null, 2)}</pre>
          </details>
        </Drawer>;
      })()}

      {/* feed panel */}
      {panel === "feed" && <Drawer title="Data feed" onClose={() => setPanel(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <FeedCard active={mode === "demo"} onClick={() => { setMode("demo"); setConn(c => ({ ...c, state: "demo" })); }}
            title="Demo feed" cost="free" desc="Simulated ticks. Learn the instrument and tune criteria before you deploy." />
          <div style={{ background: T.card, border: "1px solid " + (mode === "live" ? T.brass : T.line), borderRadius: 11, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: mode === "live" ? T.brass : T.ink, fontWeight: 500 }}>{mode === "live" ? "● " : "○ "}Live delayed feed</span>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid }}>free · ~15m lag</span>
            </div>
            <div style={{ fontSize: 12, color: T.mute, margin: "6px 0 10px", lineHeight: 1.5 }}>Real delayed NSE data + 24/7 Telegram from your deployed backend.</div>
            <input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} placeholder="https://your-backend.onrender.com" style={{ ...inS, width: "100%", marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={connect} disabled={!backendUrl} style={{ ...btn(true), opacity: backendUrl ? 1 : .4 }}>Connect</button>
              {mode === "live" && <button onClick={pushConfig} style={btn()}>Sync criteria →</button>}
              <span style={{ fontSize: 10, color: conn.state === "live" ? T.green : conn.state === "error" ? T.red : T.dimSolid }}>
                {conn.state === "live" ? "connected · " + (conn.provider || "") : conn.state === "error" ? "check URL / CORS" : conn.state === "connecting" ? "…" : ""}
              </span>
            </div>
          </div>
          <FeedCard disabled title="Zerodha Kite (live + order flow)" cost="₹2,000/mo · 1–3s"
            desc="Live ticks and real buyers/sellers depth — unlocks the 4th criterion. Configure in the backend, then set PROVIDER=kite." />
          <div style={{ fontSize: 11, color: T.dimSolid, lineHeight: 1.6, padding: "4px 2px" }}>
            Deploy in ~10 min: push the backend folder to GitHub → Render → New Web Service → paste the URL above. Full steps in the README.
          </div>
        </div>
      </Drawer>}

      {/* criteria panel */}
      {panel === "criteria" && <Drawer title="Criteria" onClose={() => setPanel(null)}>
        {/* This panel shows one profile; the Morning Brief spans all of them.
            Same stock, two panels, two answers, both correct — say which one
            you are looking at, or the difference reads as a bug. */}
        {liveBackend && (
          <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginBottom: 10,
            background: T.brassSoft, border: "1px solid " + T.brass + "3A", borderRadius: 9, padding: "8px 11px" }}>
            Showing <span style={{ color: T.brass }}>{profiles?.[profileSel === "ALL" ? "swing" : profileSel]?.name
              || (profileSel === "ALL" ? "Swing" : profileSel)}</span> only.
            The Morning Brief spans every profile, so a stock can appear there and not here — use{" "}
            <button onClick={() => { setLookupSymbol(""); setPanel("lookup"); }}
              style={{ all: "unset", cursor: "pointer", color: T.brass, textDecoration: "underline" }}>symbol lookup</button>
            {" "}to see all profiles for one stock at once.
          </div>
        )}
        <OriginalFour
          originalFour={canonicalState.originalFour}
          criteria={profiles ? (profiles[profileSel === "ALL" ? "swing" : profileSel]?.criteria || []) : criteria}
          metricLabel={id => metricMeta(id).label}
          delayed={mode !== "live" || conn.delayed !== false}
          restoring={restoring}
          onRestore={liveBackend ? async () => {
            setRestoring(true);
            try {
              // The response carries criteria + originalFour + matchesCanonical,
              // so re-render from it rather than refetching.
              const j = await desk.restoreOriginalFour(profileSel === "ALL" ? "swing" : profileSel);
              if (j?.originalFour) {
                setCanonicalState(cs => ({ ...cs, originalFour: j.originalFour, matches: j.matchesCanonical !== false }));
              }
              await loadProfiles();
            } finally { setRestoring(false); }
          } : undefined} />

        {profiles && (
          <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.6, color: T.dimSolid, margin: "4px 0 8px" }}>
            ADDITIONAL CRITERIA — everything added since
          </div>
        )}

        {profiles && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontSize: 11.5, color: canonicalState.matches ? T.dimSolid : T.amber, lineHeight: 1.5 }}>
              {canonicalState.matches
                ? "Matches the default three — fundamentals, breakout, volume shocker."
                : "Differs from the default three."}
            </span>
            <button disabled={restoring} style={{ ...btn(), marginLeft: "auto" }}
              onClick={async () => {
                setRestoring(true);
                try { await desk.restoreDefaults(profileSel === "ALL" ? "swing" : profileSel); await loadProfiles(); }
                finally { setRestoring(false); }
              }}>{restoring ? "Restoring…" : "Restore default criteria"}</button>
          </div>
        )}
        {profiles ? (
          <ProfileCriteria backendUrl={backendUrl} profiles={profiles}
            metricOptions={[...new Set([...Object.keys(METRICS), ...fundColumns])]}
            metricLabel={id => metricMeta(id).label}
            onSaved={loadProfiles} />
        ) : (
          <>
        <div style={{ fontSize: 11.5, color: T.mute, marginBottom: 12, lineHeight: 1.55 }}>The eye opens only when every enabled criterion locks. Toggle, tune, or add your own. {mode === "live" && "Hit Sync in the feed panel to push changes to the backend."}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {criteria.filter(c => c.id !== "kron").map(c => (
            <div key={c.id} style={{ border: "1px solid " + (c.enabled ? T.line : T.lineSoft), borderRadius: 10, padding: 13, opacity: c.enabled ? 1 : .55 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                <input value={c.name} onChange={e => upCrit(c.id, x => ({ ...x, name: e.target.value }))} style={{ ...inS, flex: 1, fontFamily: T.sans, fontSize: 13 }} />
                <button onClick={() => upCrit(c.id, x => ({ ...x, enabled: !x.enabled }))} style={{ ...pill(c.enabled ? T.green : T.dimSolid), minWidth: 42 }}>{c.enabled ? "ON" : "OFF"}</button>
                {!c.builtin && <button onClick={() => setCriteria(cs => cs.filter(x => x.id !== c.id))} style={pill(T.red)}>✕</button>}
              </div>
              {c.checks.map((ch, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <select value={ch.metric} onChange={e => upCrit(c.id, x => ({ ...x, checks: x.checks.map((y, j) => j === i ? { ...y, metric: e.target.value } : y) }))} style={{ ...inS, flex: 1 }}>
                    {/* fundColumns carries metrics the backend has started sending that
                        this build does not name, so they are selectable here too */}
                    {[...new Set([...Object.keys(METRICS), ...fundColumns])].map(id =>
                      <option key={id} value={id}>{metricMeta(id).label}</option>)}
                  </select>
                  <select value={ch.op} onChange={e => upCrit(c.id, x => ({ ...x, checks: x.checks.map((y, j) => j === i ? { ...y, op: e.target.value } : y) }))} style={inS}><option value="gte">≥</option><option value="lte">≤</option></select>
                  <input type="number" step="any" value={ch.value} onChange={e => upCrit(c.id, x => ({ ...x, checks: x.checks.map((y, j) => j === i ? { ...y, value: +e.target.value } : y) }))} style={{ ...inS, width: 62, textAlign: "right" }} />
                  <button onClick={() => upCrit(c.id, x => ({ ...x, checks: x.checks.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 12 }}>✕</button>
                </div>
              ))}
              <button onClick={() => upCrit(c.id, x => ({ ...x, checks: [...x.checks, { metric: "dayChgPct", op: "gte", value: 0 }] }))} style={{ background: "none", border: "none", color: T.brass, fontFamily: T.mono, fontSize: 10.5, padding: "2px 0" }}>+ add check</button>
            </div>
          ))}
          <button onClick={() => setPanel("oracle")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px", borderRadius: 10, border: "1px solid " + T.line, background: T.card, textAlign: "left" }}>
            <span style={{ fontSize: 12.5, color: T.mute }}><span style={{ color: T.brass }}>◉</span> AI Forecast (Kronos) lives in the Oracle tab
              {kronEnabled && <span style={{ color: T.green }}> · on</span>}
              {!ORACLE_ENABLED && <span style={{ color: T.amber }}> · paused</span>}</span>
            <span style={{ color: T.dimSolid, fontSize: 13 }}>→</span>
          </button>
          <button onClick={addCriterion} style={{ padding: 11, borderRadius: 9, border: "1px dashed " + T.brass + "55", background: "none", color: T.brass, fontSize: 12.5 }}>+ New criterion</button>
          </div>
          </>
        )}
        {/* the scan cadence applies to both editors */}
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10 }}>
          <span style={{ color: T.mute, fontSize: 12 }}>Scan every (seconds)</span>
          <input type="number" min="1" value={interval_} onChange={e => setInterval_(Math.max(1, +e.target.value))} style={{ ...inS, width: 70, textAlign: "right" }} />
        </label>
        {/* Say when the setting is not what is happening. A control that
            silently ignores its own value is worse than one that has a floor. */}
        {pollSeconds !== interval_ && (
          <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.6, marginTop: 6 }}>
            Actually polling every <span style={{ fontFamily: T.mono, color: T.brass }}>{pollSeconds}s</span>. The feed is
            ~15 minutes delayed, so a faster scan re-downloads the same numbers — {uniList.length} symbols is about{" "}
            <span style={{ fontFamily: T.mono }}>{(uniList.length * 11 / 1024).toFixed(1)} MB</span> a poll, and nothing
            in it would have changed.
          </div>
        )}
      </Drawer>}

      {panel === "lookup" && <Drawer wide title="Symbol lookup" onClose={() => setPanel(null)}>
        <PraveshBoundary>
          <StockLookup backendUrl={backendUrl} live={liveBackend} initialSymbol={lookupSymbol}
            onHold={markHolding} held={held} />
        </PraveshBoundary>
      </Drawer>}

      {/* alerts panel */}
      {panel === "alerts" && <Drawer title="Alerts" onClose={() => setPanel(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Silence has causes. Name the one in effect, so a quiet evening is
              never mistaken for a dead backend — and say when it lifts. */}
          {alertStatus && (
            <div style={{ background: T.card, border: "1px solid " + (alertStatus.windowOpen ? T.green + "44" : T.line), borderRadius: 10, padding: "11px 13px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: alertStatus.windowOpen ? T.green : T.mute, fontWeight: 600 }}>
                  {alertStatus.windowOpen ? "● Market open — alerts can fire" : `○ Quiet — ${alertStatus.reason || "outside market hours"}`}
                </span>
                {!alertStatus.windowOpen && alertStatus.nextOpen && (
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>next open {alertStatus.nextOpen}</span>
                )}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 6, lineHeight: 1.7 }}>
                {alertStatus.sentToday ?? 0} sent today · {alertStatus.sentLastHour ?? 0} this hour ·
                {" "}{(alertStatus.activeCooldowns || []).length} in cooldown ·
                {" "}max {alertStatus.limits?.maxPerSymbolPerDay}/symbol/day, {alertStatus.limits?.maxPerCycle}/cycle
                {alertStatus.lastCycle?.at ? ` · last scan ${new Date(alertStatus.lastCycle.at).toLocaleTimeString("en-IN", { hour12: false })}` : ""}
              </div>
              {alertStatus.telegramArmed === false && (
                <div style={{ fontSize: 10.5, color: T.amber, marginTop: 5 }}>⚠ No Telegram credentials on the backend — nothing can be delivered.</div>
              )}
              {alertStatus.override && (
                <div style={{ fontSize: 10.5, color: T.amber, marginTop: 5 }}>⚠ Market-hours gate is overridden — alerts can fire at any time.</div>
              )}
              {/* An incomplete holiday list is a silent failure mode: a closed
                  market read as an open one. Say how incomplete it is. */}
              {alertStatus.holidays && (
                <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 6, lineHeight: 1.55 }}>
                  {alertStatus.holidays.count} holidays configured — only the fixed-date national ones. Moving holidays
                  (Holi, Diwali, Id …) are not seeded, so those days fall back to weekday logic and alerts can fire on a
                  closed market. Add them from the NSE circular each January.
                </div>
              )}
            </div>
          )}
          <button onClick={askNotif} style={{ textAlign: "left", padding: 13, borderRadius: 10, border: "1px solid " + T.line, background: T.card, color: notifOn ? T.green : T.mute, fontSize: 12.5 }}>
            {notifOn ? "✓ Browser notifications on" : "Enable browser notifications"}
            <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 3 }}>Fires while this tab is open.</div>
          </button>
          {(() => {
            const armed = !!tgRemote?.configured;
            const typed = !!(tg.token.trim() && tg.chatId.trim());
            const sourceLabel = tgRemote?.source === "env" ? "from environment"
              : tgRemote?.source === "saved" ? "saved in backend" : "";
            return <div style={{ border: "1px solid " + (armed ? T.green + "44" : T.line), borderRadius: 10, padding: 14, background: T.card }}>
              <div style={{ fontSize: 12.5, color: T.ink, marginBottom: 2, fontWeight: 500 }}>Telegram · 24/7</div>
              <div style={{ fontSize: 10.5, color: T.dimSolid, marginBottom: 10, lineHeight: 1.5 }}>In live mode the backend sends these even with every tab closed. Create a bot via @BotFather.</div>

              {/* Armed state, straight from the backend. The panel cannot know the
                  credentials — only that the server holds a pair that ends like this. */}
              {mode === "live" && (
                tgLoad.busy ? <div style={{ fontSize: 11.5, color: T.dimSolid, marginBottom: 10 }}>Reading backend alert status…</div>
                : armed ? (
                  <div style={{ background: T.green + "0E", border: "1px solid " + T.green + "33", borderRadius: 9, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 12.5, color: T.green, fontWeight: 600 }}>
                      ✓ Alerts armed{tgRemote.on === false && <span style={{ color: T.amber, fontWeight: 400 }}> · sending paused</span>}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.mute, marginTop: 5, lineHeight: 1.6 }}>
                      token {tgRemote.tokenMasked || "••••"} · chat {tgRemote.chatIdMasked || "••••"}
                      {sourceLabel && <span style={{ color: T.dimSolid }}> · {sourceLabel}</span>}
                    </div>
                    <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 6, lineHeight: 1.5 }}>
                      The credentials stay on the server — this panel never receives them. Enter new values only to replace.
                      {tgRemote.source === "env" && " Set from environment variables: change them there, not here."}
                    </div>
                  </div>
                ) : tgLoad.err ? (
                  <div style={{ background: T.brassSoft, border: "1px solid " + T.brass + "3A", borderRadius: 9, padding: "10px 12px", marginBottom: 10,
                    fontSize: 11.5, color: T.mute, lineHeight: 1.5 }}>
                    {tgLoad.err} Treat the armed state below as unknown.
                    <button onClick={loadAlertConfig} style={{ ...btn(), marginTop: 8 }}>Retry</button>
                  </div>
                ) : tgRemote ? (
                  <div style={{ fontSize: 11.5, color: T.dimSolid, marginBottom: 10, lineHeight: 1.5 }}>
                    ○ Not armed on the backend — no bot token and chat id are stored there yet.
                  </div>
                ) : null
              )}

              <input value={tg.token} onChange={e => setTg({ ...tg, token: e.target.value })}
                placeholder={armed ? "Bot token — leave empty to keep the stored one" : "Bot token"}
                style={{ ...inS, width: "100%", marginBottom: 8 }} />
              <input value={tg.chatId} onChange={e => setTg({ ...tg, chatId: e.target.value })}
                placeholder={armed ? "Chat id — leave empty to keep the stored one" : "Chat id"}
                style={{ ...inS, width: "100%", marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={() => { setTg(t => ({ ...t, on: !t.on })); }} style={pill(tg.on ? T.green : T.dimSolid)}>{tg.on ? "✓ Armed" : "Arm"}</button>
                <button onClick={testTg} disabled={!typed} title={typed ? "Sends from this browser, using the values typed above" : "Type a token and chat id — the test is sent from this browser"}
                  style={{ ...btn(), opacity: typed ? 1 : .4 }}>Send test</button>
                {mode === "live" && <button onClick={saveTelegram} disabled={!typed}
                  title={typed ? undefined : "Nothing new to save — type a token and chat id to replace what the backend holds"}
                  style={{ ...btn(true), opacity: typed ? 1 : .4 }}>Save to backend</button>}
                <span style={{ fontSize: 10, color: /fail|Could not/i.test(tg.status) ? T.red : T.dimSolid }}>{tg.status}</span>
              </div>

              <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 10, lineHeight: 1.55 }}>
                {/* No server-side test endpoint exists, so say where the test comes from
                    rather than let a delivered message imply the backend is wired. */}
                <span style={{ color: T.mute }}>Send test</span> posts directly from this browser to Telegram using the values typed above —
                it proves the bot and chat id work, not that the backend is armed. The armed line above is the backend&apos;s own answer.
                {mode === "live" && <> The <span style={{ color: T.mute }}>Arm</span> switch takes effect on the backend only when saved together with new
                  credentials; in demo mode it controls sending from this tab.</>}
              </div>
            </div>;
          })()}
        </div>
      </Drawer>}

      {/* universe panel */}
      {panel === "universe" && (() => {
        const pending = cleanSym(addSym);
        const fundCounts = uniList.reduce((a, s) => {
          const st = funds[s]?.status;
          if (st === "fetched") a.fetched++; else if (st === "partial") a.partial++; else a.unavailable++;
          return a;
        }, { fetched: 0, partial: 0, unavailable: 0 });
        const canAdd = liveBackend && !!pending && !uniList.includes(pending) && !uni.busy;
        const lock = !liveBackend || uni.busy; // demo mode is read-only
        return <Drawer title="Universe" onClose={() => setPanel(null)}>
          <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginBottom: 12 }}>
            {liveBackend
              ? <>The {uniList.length} names your backend actually scans. Edits go straight to it — the watchlist picks them up on the next refresh, no reload.
                  {cap != null && <span style={{ color: T.dimSolid }}> Cap {cap}.</span>}</>
              : <>These {uniList.length} names are the demo watchlist — recognizable, liquid mid/large-caps picked to make the instrument realistic. <span style={{ color: T.ink }}>They are not a recommendation and not your portfolio.</span> Connect a live feed to manage your own list from here.</>}
          </div>

          {staleServerList && (() => {
            /* What this browser remembers that the backend does not have. The
               only defensible action here is adding those back.

               There used to be a "Restore my N symbols" button that PUT the
               remembered list over the server's. That inverts which copy is
               authoritative: the backend now persists to a durable store and
               holds symbols this browser has never seen, so replacing 303 with
               a 23-symbol snapshot from localStorage destroys real state to
               satisfy a stale cache. Additive only — nothing here can remove a
               symbol, so there is nothing to confirm away. */
            const missing = savedUni.filter(s => !uniList.includes(s));
            const ephemeral = storage && storage.mode !== "durable";
            return (
              <div style={{ background: T.brassSoft, border: "1px solid " + T.brass + "3A", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.5 }}>
                  The backend is scanning {universe.length} symbols; this browser remembers {savedUni.length}.
                  {missing.length > 0
                    ? <> {missing.length} of yours {missing.length === 1 ? "is" : "are"} not on the backend.</>
                    : <> Everything this browser remembers is already there — the backend simply has more.</>}
                </div>
                {/* Only true while nothing is being persisted. Once the store is
                    durable a redeploy no longer resets anything, and repeating
                    the warning would teach the user to ignore it. */}
                {ephemeral && storage.detail && (
                  <div style={{ fontSize: 11, color: T.amber, lineHeight: 1.5, marginTop: 6 }}>{storage.detail}</div>
                )}
                {missing.length > 0 && (
                  <button onClick={() => uniPost("/universe/bulk-add", { symbols: missing }, r => `Added ${r.added}.`)} disabled={uni.busy}
                    style={{ ...btn(true), marginTop: 8 }}>
                    Add my {missing.length} missing symbol{missing.length === 1 ? "" : "s"}
                  </button>
                )}
              </div>
            );
          })()}

          {/* add one */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input value={addSym} onChange={e => setAddSym(e.target.value.toUpperCase())} disabled={lock}
              onKeyDown={e => { if (e.key === "Enter" && canAdd) addOne(pending); }}
              placeholder={liveBackend ? "Add symbol — e.g. POLYCAB" : "Connect a live feed first"}
              style={{ ...inS, flex: 1, opacity: lock ? .5 : 1 }} />
            <button onClick={() => addOne(pending)} disabled={!canAdd} style={{ ...btn(true), opacity: canAdd ? 1 : .35 }}>Add</button>
          </div>
          {liveBackend && pending && uniList.includes(pending) &&
            <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: -4, marginBottom: 8 }}>{pending} is already in the universe.</div>}

          {/* watchlist groups — create, rename, delete */}
          {liveBackend && groups && (
            <div style={{ borderTop: "1px solid " + T.lineSoft, paddingTop: 12, marginBottom: 12 }}>
              <SectionMini>Watchlists</SectionMini>
              <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.55, marginBottom: 9 }}>
                Groups slice the same scan set — the engine watches the union, so a symbol in two lists is still scanned once.
                Deleting a list drops the symbols only it held.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 9 }}>
                {Object.entries(groups).map(([name, syms]) => (
                  <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 11,
                    color: T.mute, background: T.card, border: "1px solid " + T.line, borderRadius: 6, padding: "4px 6px 4px 9px" }}>
                    {name} <span style={{ color: T.dimSolid }}>{syms.length}</span>
                    <button onClick={() => setRenaming({ from: name, to: name })} title={"Rename " + name}
                      style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 10, padding: 0 }}>✎</button>
                    <button onClick={() => groupOp(() => track.deleteList(name), `Deleted ${name}.`)}
                      disabled={groupBusy || Object.keys(groups).length === 1}
                      title={Object.keys(groups).length === 1 ? "The last watchlist cannot be deleted" : "Delete " + name}
                      style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 11, padding: 0, opacity: Object.keys(groups).length === 1 ? .3 : 1 }}>✕</button>
                  </span>
                ))}
              </div>
              {renaming && (
                <div style={{ display: "flex", gap: 6, marginBottom: 9, alignItems: "center" }}>
                  <input value={renaming.to} onChange={e => setRenaming(r => ({ ...r, to: e.target.value }))}
                    style={{ ...inS, flex: 1 }} placeholder="New name" />
                  <button onClick={() => groupOp(() => track.renameList(renaming.from, renaming.to), "Renamed.").then(() => setRenaming(null))}
                    disabled={groupBusy || !renaming.to.trim()} style={btn(true)}>Rename</button>
                  <button onClick={() => setRenaming(null)} style={btn()}>Cancel</button>
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="New watchlist name"
                  onKeyDown={e => { if (e.key === "Enter" && newGroup.trim()) { groupOp(() => track.createList(newGroup.trim()), `Created ${newGroup.trim()}.`); setNewGroup(""); } }}
                  style={{ ...inS, flex: 1 }} />
                <button onClick={() => { groupOp(() => track.createList(newGroup.trim()), `Created ${newGroup.trim()}.`); setNewGroup(""); }}
                  disabled={groupBusy || !newGroup.trim()} style={{ ...btn(true), opacity: newGroup.trim() ? 1 : .4 }}>Create</button>
              </div>
              {groupMsg && <div style={{ fontSize: 10.5, marginTop: 8, color: /not|fail|error|exists/i.test(groupMsg) ? T.red : T.green }}>{groupMsg}</div>}
            </div>
          )}

          {/* chips — tap to select, then move the selection to another list */}
          {liveBackend && groups && picked.size > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8,
              background: T.brassSoft, border: "1px solid " + T.brass + "3A", borderRadius: 8, padding: "8px 10px" }}>
              <span style={{ fontSize: 11.5, color: T.mute }}>{picked.size} selected</span>
              <span style={{ fontSize: 11.5, color: T.dimSolid }}>Move to…</span>
              {Object.keys(groups).map(name => (
                <button key={name} disabled={groupBusy}
                  onClick={() => {
                    const syms = [...picked];
                    // Move out of whichever list currently holds each symbol.
                    const from = Object.entries(groups).find(([g, list]) => g !== name && syms.some(s => list.includes(s)))?.[0];
                    groupOp(() => from ? track.moveTo(from, name, syms.filter(s => groups[from].includes(s)))
                                       : track.addTo(name, syms), `Moved ${syms.length} to ${name}.`);
                  }}
                  style={{ ...btn(), padding: "4px 9px", fontSize: 10.5 }}>{name}</button>
              ))}
              <button onClick={() => setPicked(new Set())} style={{ background: "none", border: "none", color: T.dimSolid, fontFamily: T.mono, fontSize: 10 }}>clear</button>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {uniList.map(sym => {
              const on = picked.has(sym);
              const tags = groupsOf(sym);
              return (
                <span key={sym} title={tags.length ? "In: " + tags.join(", ") : undefined}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 11,
                    color: on ? T.ink : T.mute, background: on ? T.brassSoft : T.card,
                    border: "1px solid " + (on ? T.brass + "66" : T.line), borderRadius: 6, padding: "4px 6px 4px 8px" }}>
                  {liveBackend && groups
                    ? <button onClick={() => setPicked(p => { const n = new Set(p); n.has(sym) ? n.delete(sym) : n.add(sym); return n; })}
                        title="Select for Move to…" style={{ background: "none", border: "none", color: "inherit", font: "inherit", padding: 0 }}>{sym}</button>
                    : sym}
                  {tags.length > 0 && <span style={{ fontSize: 8, color: T.dimSolid }}>{tags.join("·")}</span>}
                  {liveBackend && <button onClick={() => removeOne(sym)} disabled={uni.busy} title={"Remove " + sym}
                    style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 11, lineHeight: 1, padding: 0, opacity: uni.busy ? .4 : 1 }}>✕</button>}
                </span>
              );
            })}
            {!uniList.length && <span style={{ fontSize: 11.5, color: T.dimSolid }}>Empty — add symbols or bulk-paste a list below.</span>}
          </div>

          {/* status line */}
          {(uni.err || uni.msg) && (
            <div style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5, color: uni.err ? T.red : T.green }}>{uni.err || uni.msg}</div>
          )}

          {/* fundamentals */}
          <div style={{ marginTop: 14, borderTop: "1px solid " + T.lineSoft, paddingTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button onClick={refreshAllFunds} disabled={lock || !!fundBusy || !uniList.length}
                style={{ ...btn(), opacity: lock || fundBusy || !uniList.length ? .4 : 1 }}>
                {fundBusy === "all" ? "Refreshing…" : "Refresh all fundamentals"}
              </button>
              <span style={{ fontSize: 10.5, color: T.dimSolid, display: "flex", gap: 9 }}>
                <span><FundDot rec={{ status: "fetched" }} /> {fundCounts.fetched} complete</span>
                <span><FundDot rec={{ status: "partial" }} /> {fundCounts.partial} partial</span>
                <span><FundDot rec={{ status: "unavailable" }} /> {fundCounts.unavailable} none</span>
              </span>
            </div>
            {fundMsg && <div style={{ fontSize: 10.5, marginTop: 7, lineHeight: 1.5, color: /failed/.test(fundMsg) ? T.red : T.mute }}>{fundMsg}</div>}
            <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 7, lineHeight: 1.5 }}>
              Scraped from screener.in / moneycontrol, cached — they only move quarterly. Partial means a field could not be established; it is never guessed.
            </div>
          </div>

          {/* bulk */}
          <div style={{ marginTop: 16, borderTop: "1px solid " + T.lineSoft, paddingTop: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button onClick={() => setBulk(b => ({ ...b, open: !b.open, mode: "add" }))} disabled={lock} style={{ ...btn(), opacity: lock ? .4 : 1 }}>Bulk add</button>
              <button onClick={() => setBulk(b => ({ ...b, open: true, mode: "remove" }))} disabled={lock} style={{ ...btn(), opacity: lock ? .4 : 1 }}>Remove listed</button>
              <button onClick={() => fileRef.current?.click()} disabled={lock} style={{ ...btn(), opacity: lock ? .4 : 1 }}>Upload .csv / .txt</button>
              <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} style={{ display: "none" }} />
              {confirmClear
                ? <>
                    <button onClick={clearAll} style={{ ...pill(T.red), fontFamily: T.sans, fontSize: 11.5 }}>Confirm clear all</button>
                    <button onClick={() => setConfirmClear(false)} style={btn()}>Cancel</button>
                  </>
                : <button onClick={() => setConfirmClear(true)} disabled={lock || !uniList.length} style={{ ...btn(), color: T.red, borderColor: T.red + "55", opacity: lock || !uniList.length ? .4 : 1 }}>Clear all</button>}
            </div>

            {bulk.open && liveBackend && (() => {
              const preview = parseSymbols(bulk.text);
              const fresh = bulk.mode === "add" ? preview.filter(s => !uniList.includes(s)) : preview.filter(s => uniList.includes(s));
              return <div style={{ marginTop: 10 }}>
                <textarea value={bulk.text} onChange={e => setBulk(b => ({ ...b, text: e.target.value }))} rows={4}
                  placeholder={"Paste symbols — commas, spaces, tabs or one per line.\nPOLYCAB, KAYNES\nBEL\tHAL"}
                  style={{ ...inS, width: "100%", resize: "vertical", lineHeight: 1.5 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <button onClick={() => submitBulk(bulk.text, "paste")} disabled={uni.busy || !fresh.length}
                    style={{ ...btn(true), opacity: uni.busy || !fresh.length ? .35 : 1 }}>
                    {bulk.mode === "add" ? "Add" : "Remove"} {fresh.length || ""}
                  </button>
                  <button onClick={() => setBulk({ open: false, mode: "add", text: "" })} style={btn()}>Close</button>
                  <span style={{ fontSize: 10.5, color: T.dimSolid }}>
                    {preview.length ? `${preview.length} parsed · ${fresh.length} ${bulk.mode === "add" ? "new" : "present"}` : "nothing parsed yet"}
                    {bulk.mode === "add" && cap != null && uniList.length + fresh.length > cap &&
                      <span style={{ color: T.red }}> · {uniList.length + fresh.length - cap} over the {cap} cap — the server will drop those</span>}
                  </span>
                </div>
              </div>;
            })()}
          </div>

          {/* export */}
          <div style={{ marginTop: 14, borderTop: "1px solid " + T.lineSoft, paddingTop: 12, display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={copyUni} disabled={!uniList.length} style={{ ...btn(), opacity: uniList.length ? 1 : .4 }}>Copy</button>
            <button onClick={exportTxt} disabled={!uniList.length} style={{ ...btn(), opacity: uniList.length ? 1 : .4 }}>Download .txt</button>
            <span style={{ fontSize: 10.5, color: T.dimSolid }}>one symbol per line · files are read in your browser, never uploaded</span>
          </div>
        </Drawer>;
      })()}

      {/* oracle panel */}
      {panel === "oracle" && <Drawer title="The Oracle" onClose={() => setPanel(null)}>
        {/* hero */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 46, height: 46, borderRadius: 99, border: "1px solid " + T.brass + "55", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: 99, background: "radial-gradient(circle at 50% 40%," + T.brass + "," + T.brassDeep + ")", boxShadow: kronEnabled ? "0 0 12px " + T.brass + "88" : "none" }} />
          </div>
          <div>
            <div style={{ fontFamily: T.serif, fontSize: 19, lineHeight: 1 }}>The forward-looking eye</div>
            <div style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: 1.5, color: T.dimSolid, marginTop: 3 }}>POWERED BY KRONOS · OPEN-SOURCE FORECAST MODEL</div>
          </div>
        </div>

        {/* master toggle — inert while parked, and it says so rather than
            looking like a switch that simply refuses to move */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: kronEnabled ? T.brassSoft : T.card,
          border: "1px solid " + (kronEnabled ? T.brass + "66" : ORACLE_ENABLED ? T.line : T.amber + "44"),
          borderRadius: 11, padding: "13px 15px", marginBottom: ORACLE_ENABLED ? 14 : 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: kronEnabled ? T.brass : ORACLE_ENABLED ? T.ink : T.mute }}>AI Forecast criterion</span>
              {!ORACLE_ENABLED && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: T.mono, fontSize: 8.5, letterSpacing: 1,
                  color: T.amber, border: "1px solid " + T.amber + "55", borderRadius: 4, padding: "2px 5px" }}>
                  ⏸ PAUSED
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: T.mute, marginTop: 3, lineHeight: 1.5 }}>
              {!ORACLE_ENABLED
                ? "Forecasts paused — the free data source is rate-limited from the server. Returns when live market data (Kite) is connected."
                : kronEnabled ? "Active — factored into every signal" : "Off — your other criteria run untouched"}
            </div>
          </div>
          <button onClick={toggleKron} disabled={!ORACLE_ENABLED}
            aria-disabled={!ORACLE_ENABLED}
            title={ORACLE_ENABLED ? undefined : "Paused while the forecast feed is rate-limited — it cannot be switched on"}
            style={{ width: 52, height: 30, borderRadius: 99,
              border: "1px solid " + (kronEnabled ? T.brass : T.line),
              background: kronEnabled ? T.brass : "transparent", position: "relative",
              transition: "all .3s", cursor: ORACLE_ENABLED ? "pointer" : "not-allowed",
              opacity: ORACLE_ENABLED ? 1 : .5, flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 3, left: kronEnabled ? 25 : 3, width: 22, height: 22, borderRadius: 99,
              background: kronEnabled ? "#141206" : T.dimSolid, transition: "left .25s cubic-bezier(.2,.8,.2,1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: T.bg }}>
              {ORACLE_ENABLED ? "" : "🔒"}
            </span>
          </button>
        </div>

        {!ORACLE_ENABLED && (
          <div style={{ fontSize: 11, color: T.dimSolid, lineHeight: 1.55, marginBottom: 14 }}>
            Deliberately parked, not broken. A criterion with no data can never pass, and the eye opens only when
            every enabled criterion does — so leaving this switchable would let one click silence every signal.
            Everything below stays accurate for when it returns.
          </div>
        )}

        {/* status */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: T.card, border: "1px solid " + T.line, borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, letterSpacing: 1 }}>ORACLE FEED</div>
            <div style={{ fontSize: 12.5, marginTop: 3, color: !ORACLE_ENABLED ? T.amber : oracleLive ? T.green : T.dimSolid }}>
              {!ORACLE_ENABLED ? "⏸ paused" : oracleLive ? "● receiving" : "○ not connected"}
            </div>
          </div>
          <div style={{ flex: 1, background: T.card, border: "1px solid " + T.line, borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, letterSpacing: 1 }}>ENGINE</div>
            <div style={{ fontSize: 12.5, marginTop: 3, color: !ORACLE_ENABLED ? T.amber : oracleEngine === "kronos-mini" ? T.brass : oracleEngine === "naive" ? T.red : T.dimSolid }}>
              {!ORACLE_ENABLED ? "⏸ not polled" : oracleEngine === "kronos-mini" ? "Kronos" : oracleEngine === "naive" ? "naive (fallback)" : "—"}
            </div>
          </div>
        </div>

        {/* what it does */}
        <SectionMini>What it does</SectionMini>
        <p style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.65, margin: "0 0 14px" }}>
          Your other criteria read the <span style={{ color: T.ink }}>past and present</span> — good company, fresh breakout, volume surge, live order flow. The Oracle is the only one that looks <span style={{ color: T.ink }}>forward</span>. It feeds ~200 days of candles to Kronos — an AI model trained on charts from 45+ exchanges — and gets back a predicted price path for the next few days, distilled to one number: <span style={{ color: T.brass }}>expected {kronThreshold}%+ return over 3 days</span>.
        </p>

        {/* how it helps */}
        <SectionMini>How it helps</SectionMini>
        <p style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.65, margin: "0 0 14px" }}>
          It's a <span style={{ color: T.ink }}>tiebreaker, not a finder</span>. Plenty of stocks break out on volume and immediately fade. When Kronos forecasts a weak or negative next-3-days on a setup that otherwise looks strong, that's a quiet warning the shape resembles ones that fizzled. Used this way it thins your list to signals where past <span style={{ color: T.ink }}>and</span> projected future agree. The 3-day horizon matches swing trading — it's not an intraday tool.
        </p>

        {/* honest limits */}
        <SectionMini accent={T.red}>Read this before trusting it</SectionMini>
        <div style={{ background: T.red + "0E", border: "1px solid " + T.red + "33", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: T.mute, lineHeight: 1.6, margin: "0 0 8px" }}>
            <span style={{ color: T.ink }}>Market prediction is genuinely hard.</span> No model — Kronos included — has shown durable public evidence of reliably predicting returns. If it could, it wouldn't be free. Treat this as an unproven experimental layer.
          </p>
          <p style={{ fontSize: 12, color: T.mute, lineHeight: 1.6, margin: 0 }}>
            {oracleEngine === "naive"
              ? <>You're currently on the <span style={{ color: T.red }}>naive fallback</span> (drift + momentum math), not real Kronos — honestly labeled, never disguised. Real Kronos needs the torch build on paid hardware.</>
              : <>Prove it yourself: run it disabled for a few weeks, then check whether stocks it forecast positively actually outperformed. Let data — not the word "AI" — decide if it earns a place.</>}
          </p>
        </div>

        {/* threshold control — still editable while parked: it sets a value,
            it does not switch anything on, and it is what the criterion will
            use the day the feed comes back */}
        <SectionMini>Tune the threshold{!ORACLE_ENABLED && <span style={{ color: T.dimSolid }}> · saved for when it returns</span>}</SectionMini>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: T.card, border: "1px solid " + T.line, borderRadius: 10, padding: "11px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, color: T.mute }}>Min forecast return over 3 days</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.dimSolid }}>≥</span>
            <input type="number" step="0.5" value={kronThreshold}
              onChange={e => upCrit("kron", x => ({ ...x, checks: [{ ...x.checks[0], value: +e.target.value }] }))}
              style={{ ...inS, width: 60, textAlign: "right" }} />
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.dimSolid }}>%</span>
          </div>
        </div>

        {/* wiring */}
        <SectionMini>Wiring the Oracle</SectionMini>
        <div style={{ fontSize: 12, color: T.mute, lineHeight: 1.7, marginBottom: 10 }}>
          The Oracle is a separate free service. Once deployed, set <span style={{ fontFamily: T.mono, color: T.brass }}>ORACLE_URL</span> on your backend and it auto-feeds forecasts here — no URL to paste in the app. Steps 1–3 of the deploy guide.
          {!ORACLE_ENABLED && <> <span style={{ color: T.amber }}>Deploying it will not un-pause this tab</span> — the block is the price feed the
            forecaster reads, which answers 429 to Render&apos;s IP. Flip <span style={{ fontFamily: T.mono, color: T.brass }}>ORACLE_ENABLED</span> in
            components/Trinetra.jsx once a keyed feed (Kite) is wired.</>}
        </div>
        {mode === "live"
          ? <button onClick={pushConfig} style={{ ...btn(true), width: "100%", padding: 11 }}>Sync criteria to backend →</button>
          : <div style={{ fontSize: 11, color: T.dimSolid, textAlign: "center", padding: "8px 0" }}>Connect a live backend (feed panel) to activate server-side forecasts.</div>}

        <p style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.5, marginTop: 14, textAlign: "center" }}>
          Kronos is open-source (MIT) · shiyu-coder/Kronos. Forecasts are probabilistic, not promises. Decision support, not investment advice.
        </p>
      </Drawer>}

      {/* fundamentals panel — the whole scraped matrix in one place, and the
          only screen where a fundamental filter can be built by hand */}
      {panel === "fundamentals" && (() => {
        const lock = !liveBackend || !!fundBusy;           // demo is read-only
        const counts = fundRows.reduce((a, r) => {
          const st = r.rec?.status;
          a[st === "fetched" || st === "partial" ? st : st === "demo" ? "demo" : st === "seed" ? "seed" : "none"]++;
          return a;
        }, { fetched: 0, partial: 0, seed: 0, demo: 0, none: 0 });
        const arrow = k => (fundSort.key !== k ? "" : fundSort.dir === "asc" ? " ▲" : " ▼");
        const th = (k, label, title) => (
          <th key={k} title={title} onClick={() => toggleFundSort(k)}
            style={{ position: "sticky", top: 0, zIndex: 1, background: T.panel, cursor: "pointer", whiteSpace: "nowrap",
              textAlign: k === "symbol" ? "left" : "right", padding: "7px 8px", borderBottom: "1px solid " + T.line,
              fontFamily: T.mono, fontSize: 9, letterSpacing: 1, fontWeight: 400,
              color: fundSort.key === k ? T.brass : T.dimSolid }}>
            {label}{arrow(k)}
          </th>
        );
        return <Drawer wide title="Fundamentals" onClose={() => setPanel(null)}>
          <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: -6, marginBottom: 12 }}>
            {liveBackend
              ? <>Every metric the backend scrapes, for all {fundRows.length} names it watches. Cells are judged against the
                  Fundamentals criterion below — <span style={{ color: T.green }}>green passes</span>, <span style={{ color: T.red }}>red fails</span>,
                  grey has no threshold set. <span style={{ color: T.dimSolid }}>Click any column to sort.</span></>
              : <>Demo fundamentals — simulated from the seed so the matrix is explorable. <span style={{ color: T.ink }}>They are not real
                  company numbers.</span> Connect a live backend to scrape the real ones.</>}
          </div>

          {/* Coverage decides how many criteria a lock actually rests on. Below
              100%, names without cached fundamentals have that criterion
              reported as notEvaluated — the signal can still lock, but on two
              of three. Stating the split is the difference between reading a
              3/3 lock and a 2/3 one; leaving it out makes them look identical. */}
          {liveBackend && fundCoverage && (
            <div style={{ marginBottom: 10, padding: "9px 11px", borderRadius: 9,
              background: fundCoverage.pct >= 100 ? T.raised : T.brassSoft,
              border: "1px solid " + (fundCoverage.pct >= 100 ? T.line : T.brass + "3A") }}>
              <div style={{ fontFamily: T.mono, fontSize: 10.5, color: fundCoverage.pct >= 100 ? T.dimSolid : T.brass }}>
                FUNDAMENTALS CACHED — {fundCoverage.cached} of {fundCoverage.universe} ({fundCoverage.pct}%)
              </div>
              {fundCoverage.pct < 100 && (
                <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.55, marginTop: 5 }}>
                  {fundCoverage.missing} name{fundCoverage.missing === 1 ? " has" : "s have"} no fundamentals yet. For those the
                  fundamentals criterion is <span style={{ fontFamily: T.mono, color: T.amber }}>notEvaluated</span> — a signal can
                  still lock, but on two criteria rather than three. Scraping continues in the background.
                </div>
              )}
            </div>
          )}

          {/* pass summary + provenance */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontFamily: T.mono, fontSize: 10.5, color: fundChecks.length ? T.brass : T.dimSolid }}>
              {fundChecks.length ? `${fundPassCount}/${fundRows.length} pass all ${fundChecks.length} checks` : "no fundamental checks set"}
            </span>
            <span style={{ fontSize: 10.5, color: T.dimSolid, display: "flex", gap: 9, flexWrap: "wrap" }}>
              {counts.fetched > 0 && <span><FundDot rec={{ status: "fetched" }} /> {counts.fetched} complete</span>}
              {counts.partial > 0 && <span><FundDot rec={{ status: "partial" }} /> {counts.partial} partial</span>}
              {counts.seed > 0 && <span><FundDot rec={{ status: "seed" }} /> {counts.seed} seed</span>}
              {counts.none > 0 && <span><FundDot rec={{ status: "unavailable" }} /> {counts.none} none</span>}
              {counts.demo > 0 && <span style={{ fontFamily: T.mono }}>◌ {counts.demo} demo</span>}
            </span>
            <button onClick={refreshAllFunds} disabled={lock || !fundRows.length}
              style={{ ...btn(), marginLeft: "auto", opacity: lock || !fundRows.length ? .4 : 1 }}>
              {fundBusy === "all" ? "Refreshing…" : "Refresh all fundamentals"}
            </button>
          </div>
          {fundMsg && <div style={{ fontSize: 10.5, marginBottom: 8, lineHeight: 1.5, color: /failed/.test(fundMsg) ? T.red : T.mute }}>{fundMsg}</div>}

          {/* the matrix — the shared table, so sort and filter behave here
              exactly as they do everywhere else */}
          <DataTable
            dense
            rowKey={r => r.sym}
            rows={fundRows}
            empty="Universe is empty — add symbols first."
            columns={[
              { key: "sym", label: "Symbol", type: "text", align: "left", mono: false,
                render: r => <span style={{ fontFamily: T.mono, color: r.pass ? T.brass : T.ink }}>{r.sym}</span> },
              ...fundColumns.map(k => {
                const m = metricMeta(k);
                const checked = fundChecks.filter(c => c.metric === k);
                return {
                  key: k, type: "number",
                  label: (m.adhoc ? "＋" : "") + shortLabel(k, m.label) + (checked.length ? " •" : ""),
                  title: `${m.label}${m.unit ? " (" + m.unit + ")" : ""}` +
                    (checked.length ? " · filtered " + checked.map(c => OPS[c.op] + " " + c.value).join(" and ") : ""),
                  value: r => r.rec?.[k],
                  render: r => {
                    const v = r.rec?.[k], j = r.verdicts[k];
                    const colour = v == null ? T.dim : !j ? T.mute : j.unverified ? T.dimSolid : j.ok ? T.green : T.red;
                    return <span title={j?.unverified ? "Unverified seed value — shown, but it cannot lock the gate" : undefined}
                      style={{ color: colour }}>{fmtVal(k, v)}</span>;
                  },
                };
              }),
              { key: "status", label: "Data", type: "cat", value: r => r.rec?.status || "none",
                render: r => r.rec?.status === "demo"
                  ? <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid }}>◌ demo</span>
                  : <span title={r.rec?.source || undefined} style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid }}>
                      <FundDot rec={r.rec || { status: "unavailable" }} /> {r.rec?.status || "none"}
                    </span> },
            ]} />

          {/* filter builder */}
          <div style={{ marginTop: 16, borderTop: "1px solid " + T.lineSoft, paddingTop: 14 }}>
            <SectionMini>Build a fundamental filter</SectionMini>
            <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.55, marginBottom: 10 }}>
              Adds a check to the Fundamentals criterion — the same gate the eye opens on. Threshold ideas like
              <span style={{ color: T.ink }}> Piotroski ≥ 7</span> or <span style={{ color: T.ink }}>ROCE ≥ 20%</span> are yours to set;
              nothing here suggests a level.
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select value={fundDraft.metric}
                onChange={e => setFundDraft(d => ({ ...d, metric: e.target.value, op: defaultOp(e.target.value) }))}
                style={{ ...inS, flex: "1 1 190px", minWidth: 150 }}>
                {fundColumns.map(k => <option key={k} value={k}>{metricMeta(k).label}</option>)}
              </select>
              <select value={fundDraft.op} onChange={e => setFundDraft(d => ({ ...d, op: e.target.value }))} style={inS}>
                <option value="gte">≥</option><option value="lte">≤</option>
              </select>
              <input type="number" step="any" value={fundDraft.value}
                onChange={e => setFundDraft(d => ({ ...d, value: e.target.value }))}
                style={{ ...inS, width: 78, textAlign: "right" }} />
              <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.dimSolid }}>{metricMeta(fundDraft.metric).unit || ""}</span>
              <button onClick={addFundCheck} style={btn(true)}>Add check</button>
            </div>

            {/* current checks */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              {fundChecks.map((c, i) => (
                <span key={c.metric + i} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: T.mono, fontSize: 10.5,
                  color: T.mute, background: T.card, border: "1px solid " + T.line, borderRadius: 6, padding: "5px 7px 5px 9px" }}>
                  {shortLabel(c.metric, metricMeta(c.metric).label)} {OPS[c.op]} {c.value}{metricMeta(c.metric).unit}
                  <button onClick={() => upCrit("fund", x => ({ ...x, checks: x.checks.filter((_, j) => j !== i) }))}
                    title="Remove this check" style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 11, lineHeight: 1, padding: 0 }}>✕</button>
                </span>
              ))}
              {!fundChecks.length && <span style={{ fontSize: 11.5, color: T.dimSolid }}>No checks yet — the Fundamentals gate passes on everything.</span>}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button onClick={() => upCrit("fund", x => ({ ...x, enabled: !x.enabled }))} style={pill(fundCrit?.enabled ? T.green : T.dimSolid)}>
                {fundCrit?.enabled ? "ON" : "OFF"}
              </button>
              <span style={{ fontSize: 11, color: T.dimSolid }}>
                {fundCrit?.enabled ? "Counted in every signal." : "Disabled — these checks are ignored by the eye."}
              </span>
              {mode === "live"
                ? <button onClick={pushConfig} style={{ ...btn(true), marginLeft: "auto" }}>Sync criteria to backend →</button>
                : <span style={{ fontSize: 10.5, color: T.dimSolid, marginLeft: "auto" }}>Demo — nothing to sync.</span>}
            </div>

            <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.55, marginTop: 12 }}>
              Scraped from screener.in / moneycontrol and cached — these move quarterly, not by the second.
              A blank cell is a field the scrape could not establish; it is never guessed, and a criterion over it
              reads as no data rather than a pass. Seed values are shown greyed and cannot lock the gate.
            </div>
          </div>
        </Drawer>;
      })()}

      {panel === "playbook" && <Drawer wide title="Playbook" onClose={() => setPanel(null)}>
        <PraveshBoundary>
          <Playbook backendUrl={backendUrl} live={liveBackend} profileId={profileSel} profiles={profiles}
            held={held} onHold={markHolding} holdBusy={holdBusy} />
        </PraveshBoundary>
      </Drawer>}

      {panel === "about" && <Drawer title="About Trinetra" onClose={() => setPanel(null)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 99, border: "1px solid " + T.brass + "66", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: 99, background: "radial-gradient(circle at 50% 45%, " + T.brass + ", " + T.brassDeep + ")" }} />
          </div>
          <div>
            <div style={{ fontFamily: T.serif, fontSize: 24, lineHeight: 1 }}>Trinetra</div>
            <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 2.5, color: T.brass, marginTop: 4 }}>THE EYE OPENS WHEN EVERYTHING ALIGNS</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: T.mute, lineHeight: 1.7 }}>
          A vigilance instrument for NSE setups. It watches your universe and stays silent until a stock satisfies
          <em style={{ color: T.ink, fontStyle: "normal" }}> every</em> criterion you set — fundamentals, breakout, volume —
          then it opens, and tells you.
        </p>
        <p style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.7 }}>
          The backend runs the same scan server-side around the clock, so Telegram alerts fire with every tab closed.
          The full manual is in <span style={{ color: T.brass }}>? Help</span> or at <span style={{ fontFamily: T.mono }}>/docs</span>.
        </p>
        <p style={{ fontSize: 11.5, color: T.dimSolid, lineHeight: 1.65, borderTop: "1px solid " + T.lineSoft, paddingTop: 12, marginTop: 14 }}>
          Decision support, not investment advice. Signals are candidates — entry, stops and sizing remain yours.
          Markets carry risk of loss.
        </p>
      </Drawer>}

      {panel === "help" && <Drawer wide title="How to use Trinetra" onClose={() => setPanel(null)}>
        <Guide />
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <a href="/docs" target="_blank" rel="noreferrer" style={{ fontFamily: T.mono, fontSize: 11, color: T.brass, textDecoration: "none" }}>
            open the full manual at /docs ↗
          </a>
        </div>
      </Drawer>}

      {panel === "brief" && <Drawer wide title="Morning Brief" onClose={() => setPanel(null)}>
        <PraveshBoundary><Brief backendUrl={backendUrl} live={liveBackend} onLeave={() => setPanel(null)} /></PraveshBoundary>
      </Drawer>}

      {panel === "positions" && <Drawer wide title="Positions" onClose={() => setPanel(null)}>
        <PraveshBoundary><Positions backendUrl={backendUrl} live={liveBackend} storage={storage} /></PraveshBoundary>
      </Drawer>}

      {/* track record — mounted only while open; it reads server-side history,
          so the boundary keeps a bad record out of the screener */}
      {panel === "track" && <Drawer wide title="Track Record" onClose={() => setPanel(null)}>
        <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: -6, marginBottom: 12 }}>
          Did the signals work, did your picking beat them, and is any of it worth ₹2,000/month?
          <span style={{ color: T.dimSolid }}> Built to disappoint — every number carries its sample size.</span>
        </div>
        <PraveshBoundary>
          <TrackRecord backendUrl={backendUrl} live={liveBackend} />
        </PraveshBoundary>
      </Drawer>}

      {/* pravesh panel — mounted only while open, so the screener never pays for
          the IPO fetch, and a bad snapshot is contained by the boundary */}
      {panel === "pravesh" && <Drawer wide title="Pravesh" onClose={() => setPanel(null)}>
        <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: -6, marginBottom: 12 }}>
          Live IPOs, the published views behind each one, and how often those sources have actually been right.
          <span style={{ color: T.dimSolid }}> Read-only — the engine runs elsewhere.</span>
        </div>
        <PraveshBoundary>
          <PraveshPanel />
        </PraveshBoundary>
      </Drawer>}
    </div>
  );

  function chip(active) { return { padding: "8px 13px", borderRadius: 8, border: "1px solid " + (active ? T.brass + "55" : T.line), background: active ? T.brassSoft : T.card, color: active ? T.ink : T.mute, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }; }
  function btn(primary) { return { padding: "7px 12px", borderRadius: 7, border: "1px solid " + (primary ? T.brass : T.line), background: primary ? T.brass : "transparent", color: primary ? "#141206" : T.mute, fontSize: 11.5, fontWeight: primary ? 600 : 400 }; }
  function pill(c) { return { padding: "5px 10px", borderRadius: 6, border: "1px solid " + c, background: "none", color: c, fontFamily: T.mono, fontSize: 10.5 }; }
}

function SectionLabel({ children, muted }) {
  return <div style={{ fontFamily: T.mono, fontSize: 10.5, letterSpacing: 2, color: muted ? T.mute : T.brass, marginBottom: 10 }}>{children.toUpperCase?.() || children}</div>;
}
function SectionMini({ children, accent }) {
  return <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, color: accent || T.brass, marginBottom: 7, textTransform: "uppercase" }}>{children}</div>;
}
/* Pravesh renders a snapshot published by a different repo. If that snapshot is
   ever malformed enough to throw, it takes down the drawer — not the screener. */
class PraveshBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return <div style={{ border: "1px solid " + T.red + "44", background: T.red + "10", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 13, color: T.red, marginBottom: 4 }}>Pravesh could not render this snapshot.</div>
      <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6 }}>
        The screener is unaffected. Close and reopen the tab to retry — if it keeps failing, the engine's
        data/latest.json is likely on a shape this build does not understand.
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 8 }}>{String(this.state.err?.message || this.state.err)}</div>
    </div>;
  }
}

function Drawer({ title, onClose, wide, children }) {
  return <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, background: "#000B", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
    <div onClick={e => e.stopPropagation()} className="rise" style={{ width: "100%", maxWidth: wide ? 720 : 480, maxHeight: "92vh", overflowY: "auto", background: T.panel, border: "1px solid " + T.line, borderRadius: "16px 16px 0 0", padding: 18 }}>
      {title && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontFamily: T.serif, fontSize: 21 }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 12, cursor: "pointer" }}>Close ✕</button>
      </div>}
      {!title && <button onClick={onClose} style={{ float: "right", background: "none", border: "none", color: T.dimSolid, fontSize: 12, cursor: "pointer" }}>Close ✕</button>}
      {children}
    </div>
  </div>;
}
function FeedCard({ active, disabled, title, cost, desc, onClick }) {
  return <button onClick={onClick} disabled={disabled} style={{ textAlign: "left", width: "100%", background: T.card, border: "1px solid " + (active ? T.brass : T.line), borderRadius: 11, padding: 14, opacity: disabled ? .5 : 1, cursor: disabled ? "default" : "pointer" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: active ? T.brass : T.ink, fontWeight: 500 }}>{active ? "● " : "○ "}{title}</span>
      <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid }}>{cost}</span>
    </div>
    <div style={{ fontSize: 12, color: T.mute, marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
  </button>;
}
