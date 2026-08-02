"use client";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import PraveshPanel, { DoorGlyph } from "./PraveshPanel";

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
  green: "#86C08A", red: "#DC6A58",
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
   pre-validate, pre-dedupe and enforce the cap before any request */
const MAX_UNIVERSE = 200;
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
function Eye({ ev, s = 14 }) {
  return <div style={{ display: "flex", gap: 3 }}>{ev.criteria.map(c => (
    <div key={c.id} title={c.name} style={{ width: s, height: s * 1.5, borderRadius: 2,
      background: c.pass ? T.brass : "transparent", border: "1px solid " + (c.pass ? T.brass : c.na ? T.red + "55" : T.line),
      boxShadow: ev.locked ? "0 0 10px " + T.brass + "55" : "none", transition: "all .6s cubic-bezier(.2,.8,.2,1)" }} />
  ))}</div>;
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
  const [onboarded, setOnboarded] = useState(false);
  const [mode, setMode] = useState("demo"); // demo | live
  const [backendUrl, setBackendUrl] = useState(
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_BACKEND_URL
      ? process.env.NEXT_PUBLIC_BACKEND_URL : ""
  );
  const [conn, setConn] = useState({ state: "idle", lastSync: null, delayed: true, provider: "" });
  const [stocks, setStocks] = useState(makeUniverse);
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [signals, setSignals] = useState([]);
  const [paused, setPaused] = useState(false);
  const [detail, setDetail] = useState(null);
  const [panel, setPanel] = useState(null);
  const [query, setQuery] = useState("");
  const [tg, setTg] = useState({ token: "", chatId: "", on: false, status: "" });
  const [notifOn, setNotifOn] = useState(false);
  const [interval_, setInterval_] = useState(3);
  const alerted = useRef(new Set());
  const R = useRef({}); R.current = { tg, criteria, notifOn, mode, backendUrl };

  /* ── universe management (live backend only) ── */
  const [universe, setUniverse] = useState(null);      // server truth; null until fetched
  const [savedUni, setSavedUni] = useState(null);      // this browser's remembered list
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
  const [fundSort, setFundSort] = useState({ key: "symbol", dir: "asc" });
  const [fundDraft, setFundDraft] = useState({ metric: "roce", op: "gte", value: 20 });

  const loadFundamentals = useCallback(async url => {
    try {
      const res = await fetch((url || backendUrl).replace(/\/$/, "") + "/fundamentals");
      const j = await res.json();
      if (j && typeof j === "object" && !Array.isArray(j)) setFunds(j);
    } catch { /* the feed panel already reports connection trouble */ }
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
      setUni({ busy: false, msg: "", err: /fetch|network/i.test(e.message)
        ? "Backend unreachable — a sleeping free instance takes ~30s to wake. Retry."
        : e.message });
      // Roll the optimistic paint back to the last server-confirmed list, then
      // re-read. Without the rollback a fully-down backend leaves a phantom
      // edit on screen that also trips the restore banner.
      if (savedUni) setUniverse(savedUni);
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
    const room = MAX_UNIVERSE - uniList.length;
    const dropped = Math.max(0, fresh.length - room);
    const send = fresh.slice(0, Math.max(0, room));
    if (!send.length) {
      setUni({ busy: false, msg: "", err: dropped
        ? `Universe is full (${MAX_UNIVERSE}). Remove some symbols first — ${dropped} not added.`
        : `All ${parsed.length} already present.` });
      return;
    }
    const j = await uniPost("/universe/bulk-add", { symbols: send }, r =>
      `Added ${r.added}, skipped ${dupes + dropped + (r.skipped || 0)}` +
      (dropped ? ` (${dropped} over the ${MAX_UNIVERSE} cap)` : dupes ? " (already present / invalid)" : ""));
    if (j) { setBulk(b => ({ ...b, text: "" })); afterAdd(send); }
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

  useEffect(() => {
    if (paused) return;
    const id = setInterval(async () => {
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
    }, interval_ * 1000);
    return () => clearInterval(id);
  }, [paused, interval_, fireAlerts]);

  const pushConfig = async () => {
    if (mode !== "live" || !backendUrl) return;
    try { await fetch(backendUrl.replace(/\/$/, "") + "/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ criteria, alerts: { telegram: { on: tg.on, token: tg.token, chatId: tg.chatId } } }) }); } catch {}
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

  // Auto-connect once if a backend URL was baked in via env (Vercel deploy).
  const autoTried = useRef(false);
  useEffect(() => {
    if (!autoTried.current && backendUrl && mode === "demo") {
      autoTried.current = true;
      connect();
    }
  }, []); // eslint-disable-line

  const ranked = useMemo(() => stocks.map(s => ({ s, ev: evaluate(s, criteria) }))
    .filter(({ s }) => !query || s.symbol.toLowerCase().includes(query.toLowerCase()) || (s.name || "").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.ev.count - a.ev.count || (b.ev.volX || 0) - (a.ev.volX || 0)), [stocks, criteria, query]);

  const askNotif = async () => { if ("Notification" in window) setNotifOn((await Notification.requestPermission()) === "granted"); };
  const testTg = async () => { setTg(t => ({ ...t, status: "sending…" })); const ok = await tgSend(tg.token, tg.chatId, "✅ TRINETRA test — channel live."); setTg(t => ({ ...t, status: ok ? "Delivered" : "Failed — check token & chat id" })); };

  const upCrit = (id, fn) => setCriteria(cs => cs.map(c => c.id === id ? fn(c) : c));
  const addCriterion = () => setCriteria(cs => [...cs, { id: "c" + Date.now(), key: "·", name: "New criterion", enabled: true, builtin: false, checks: [{ metric: "dayChgPct", op: "gte", value: 3 }] }]);
  const inS = { background: T.bg, border: "1px solid " + T.line, color: T.ink, fontFamily: T.mono, fontSize: 11, borderRadius: 6, padding: "6px 8px" };
  const activeCount = criteria.filter(c => c.enabled).length;
  const kronCrit = criteria.find(c => c.id === "kron");
  const kronEnabled = !!kronCrit?.enabled;
  const kronThreshold = kronCrit?.checks?.[0]?.value ?? 2;
  // is the oracle actually feeding data? check if any stock carries a forecast
  const oracleLive = stocks.some(s => s.fcst);
  const oracleEngine = stocks.find(s => s.fcst)?.fcst?.engine || null;

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

  /* ── onboarding ── */
  if (!onboarded) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: T.sans, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="rise" style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, margin: "0 auto 20px", borderRadius: 99, border: "1px solid " + T.brass + "66", display: "flex", alignItems: "center", justifyContent: "center", animation: "irisIn .8s cubic-bezier(.2,.8,.2,1)" }}>
            <div style={{ width: 26, height: 26, borderRadius: 99, background: "radial-gradient(circle at 50% 45%, " + T.brass + ", " + T.brassDeep + ")", boxShadow: "0 0 18px " + T.brass + "77" }} />
          </div>
          <h1 style={{ fontFamily: T.serif, fontSize: 44, lineHeight: 1, margin: "0 0 6px", fontWeight: 400 }}>Trinetra</h1>
          <p style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 3, color: T.brass, margin: "0 0 24px" }}>THE EYE OPENS WHEN EVERYTHING ALIGNS</p>
          <p style={{ fontSize: 14, color: T.mute, lineHeight: 1.65, margin: "0 0 28px" }}>
            A vigilance instrument for NSE swing setups. It watches your universe and stays silent until a stock satisfies <em style={{ color: T.ink, fontStyle: "normal" }}>every</em> criterion you set — fundamentals, breakout, volume, order flow — then it opens, and tells you.
          </p>
          <div style={{ textAlign: "left", background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 18, marginBottom: 20 }}>
            {[["Explore now", "Start on the demo feed — simulated ticks to learn the instrument and tune your criteria, risk-free."],
              ["Go live, free", "Deploy the backend (10 min) for real delayed NSE data and 24/7 Telegram alerts."],
              ["Upgrade later", "Connect Zerodha Kite for live ticks + real order-flow, when the setup has proven itself."]].map(([h, b], i) => (
              <div key={h} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: i < 2 ? "1px solid " + T.lineSoft : "none" }}>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.brass, marginTop: 1 }}>{i + 1}</span>
                <div><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{h}</div><div style={{ fontSize: 12, color: T.mute, lineHeight: 1.5 }}>{b}</div></div>
              </div>
            ))}
          </div>
          <button onClick={() => setOnboarded(true)} style={{ width: "100%", padding: "13px", borderRadius: 8, border: "none", background: T.brass, color: "#141206", fontSize: 14, fontWeight: 600 }}>
            Open the instrument
          </button>
          <p style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 16, lineHeight: 1.5 }}>Decision support, not investment advice. Markets carry risk of loss.</p>
        </div>
      </div>
    );
  }

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
            <button onClick={() => setPaused(p => !p)} title={paused ? "Resume" : "Pause"} style={{ padding: "6px 9px", borderRadius: 7, border: "1px solid " + T.line, background: T.card, color: T.mute, fontSize: 11 }}>{paused ? "▶" : "❚❚"}</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 16px 80px" }}>
        {/* action strip */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={() => setPanel("criteria")} style={chip(true)}>
            Criteria <span style={{ color: T.brass, fontFamily: T.mono }}>{activeCount}</span>
          </button>
          <button onClick={() => setPanel("alerts")} style={chip()}>
            Alerts {(tg.on || notifOn) && <span style={{ color: T.green }}>●</span>}
          </button>
          <button onClick={() => setPanel("oracle")} style={chip(kronEnabled)}>
            <span style={{ fontSize: 12 }}>◉</span> Oracle {kronEnabled && <span style={{ color: T.green }}>●</span>}
          </button>
          {/* Fundamentals — the whole scraped matrix, and where fundamental
              filters get built. The count is checks on the F criterion. */}
          <button onClick={() => setPanel("fundamentals")} style={chip(panel === "fundamentals")}>
            <LedgerGlyph size={12} color={panel === "fundamentals" ? T.brass : T.mute} /> Fundamentals
            <span style={{ color: fundCrit?.enabled ? T.brass : T.dimSolid, fontFamily: T.mono }}>{fundChecks.length}</span>
          </button>
          <button onClick={() => setPanel("universe")} style={chip()}>Universe <span style={{ color: T.mute, fontFamily: T.mono }}>{uniList.length}</span></button>
          {/* Pravesh — IPO intelligence from a separate engine, read-only here.
              Opens in place: the screener keeps ticking behind the drawer. */}
          <button onClick={() => setPanel("pravesh")} style={chip(panel === "pravesh")}>
            <DoorGlyph size={12} color={panel === "pravesh" ? T.brass : T.mute} /> Pravesh
          </button>
        </div>

        {/* signals */}
        <section style={{ marginTop: 22 }}>
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
                    <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.brass, marginTop: 3 }}>
                      ₹{fmtIN(g.price)} · vol {g.ev.volX?.toFixed(1)}× · {g.ev.count}/{g.ev.total} locked
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Eye ev={g.ev} s={9} />
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
            <SectionLabel muted>Watchlist · {ranked.length}</SectionLabel>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" style={{ ...inS, fontFamily: T.sans, fontSize: 12, width: 130 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {ranked.map(({ s, ev }) => (
              <button key={s.symbol} onClick={() => setDetail(s.symbol)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 10, padding: "11px 14px", textAlign: "left",
                  background: T.card, border: "1px solid " + (ev.locked ? T.brass + "55" : T.line), transition: "border-color .3s" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 500 }}>{s.symbol}</span>
                    <span style={{ fontSize: 11, color: T.dimSolid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.sector || s.name}</span>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.mute, marginTop: 2 }}>
                    ₹{fmtIN(s.price)}<span style={{ color: ev.dayChg >= 0 ? T.green : T.red, marginLeft: 7 }}>{ev.dayChg >= 0 ? "+" : ""}{ev.dayChg?.toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <FundDot rec={funds[s.symbol]} />
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: ev.locked ? T.brass : T.dimSolid }}>{ev.count}/{ev.total}</span>
                  <Eye ev={ev} s={9} />
                </div>
              </button>
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
                  : <div style={{ fontSize: 10.5, color: T.red, marginTop: 7 }}>Needs the Oracle service (set ORACLE_URL on the backend). See the Kronos README in the package.</div>)}
              </div>
            ))}
          </div>
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
            <span style={{ fontSize: 12.5, color: T.mute }}><span style={{ color: T.brass }}>◉</span> AI Forecast (Kronos) lives in the Oracle tab {kronEnabled && <span style={{ color: T.green }}>· on</span>}</span>
            <span style={{ color: T.dimSolid, fontSize: 13 }}>→</span>
          </button>
          <button onClick={addCriterion} style={{ padding: 11, borderRadius: 9, border: "1px dashed " + T.brass + "55", background: "none", color: T.brass, fontSize: 12.5 }}>+ New criterion</button>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
            <span style={{ color: T.mute, fontSize: 12 }}>Scan every (seconds)</span>
            <input type="number" min="1" value={interval_} onChange={e => setInterval_(Math.max(1, +e.target.value))} style={{ ...inS, width: 70, textAlign: "right" }} />
          </label>
        </div>
      </Drawer>}

      {/* alerts panel */}
      {panel === "alerts" && <Drawer title="Alerts" onClose={() => setPanel(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={askNotif} style={{ textAlign: "left", padding: 13, borderRadius: 10, border: "1px solid " + T.line, background: T.card, color: notifOn ? T.green : T.mute, fontSize: 12.5 }}>
            {notifOn ? "✓ Browser notifications on" : "Enable browser notifications"}
            <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 3 }}>Fires while this tab is open.</div>
          </button>
          <div style={{ border: "1px solid " + T.line, borderRadius: 10, padding: 14, background: T.card }}>
            <div style={{ fontSize: 12.5, color: T.ink, marginBottom: 2, fontWeight: 500 }}>Telegram · 24/7</div>
            <div style={{ fontSize: 10.5, color: T.dimSolid, marginBottom: 10, lineHeight: 1.5 }}>In live mode the backend sends these even with every tab closed. Create a bot via @BotFather.</div>
            <input value={tg.token} onChange={e => setTg({ ...tg, token: e.target.value })} placeholder="Bot token" style={{ ...inS, width: "100%", marginBottom: 8 }} />
            <input value={tg.chatId} onChange={e => setTg({ ...tg, chatId: e.target.value })} placeholder="Chat id" style={{ ...inS, width: "100%", marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => { setTg(t => ({ ...t, on: !t.on })); }} style={pill(tg.on ? T.green : T.dimSolid)}>{tg.on ? "✓ Armed" : "Arm"}</button>
              <button onClick={testTg} disabled={!tg.token || !tg.chatId} style={{ ...btn(), opacity: tg.token && tg.chatId ? 1 : .4 }}>Send test</button>
              {mode === "live" && <button onClick={pushConfig} style={btn(true)}>Save to backend</button>}
              <span style={{ fontSize: 10, color: T.dimSolid }}>{tg.status}</span>
            </div>
          </div>
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
        const canAdd = liveBackend && !!pending && !uniList.includes(pending) && uniList.length < MAX_UNIVERSE && !uni.busy;
        const lock = !liveBackend || uni.busy; // demo mode is read-only
        return <Drawer title="Universe" onClose={() => setPanel(null)}>
          <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginBottom: 12 }}>
            {liveBackend
              ? <>The {uniList.length} names your backend actually scans. Edits go straight to it — the watchlist picks them up on the next refresh, no reload. <span style={{ color: T.dimSolid }}>Cap {MAX_UNIVERSE}.</span></>
              : <>These {uniList.length} names are the demo watchlist — recognizable, liquid mid/large-caps picked to make the instrument realistic. <span style={{ color: T.ink }}>They are not a recommendation and not your portfolio.</span> Connect a live feed to manage your own list from here.</>}
          </div>

          {staleServerList && (
            <div style={{ background: T.brassSoft, border: "1px solid " + T.brass + "3A", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.5 }}>
                The backend is scanning {universe.length} symbols; this browser remembers {savedUni.length}. A free-tier redeploy resets the list.
              </div>
              <button onClick={() => uniPost("/universe", { symbols: savedUni }, r => `Restored ${r.symbols.length}.`)} disabled={uni.busy}
                style={{ ...btn(true), marginTop: 8 }}>Restore my {savedUni.length} symbols</button>
            </div>
          )}

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

          {/* chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {uniList.map(sym => (
              <span key={sym} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 11, color: T.mute, background: T.card, border: "1px solid " + T.line, borderRadius: 6, padding: "4px 6px 4px 8px" }}>
                {sym}
                {liveBackend && <button onClick={() => removeOne(sym)} disabled={uni.busy} title={"Remove " + sym}
                  style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 11, lineHeight: 1, padding: 0, opacity: uni.busy ? .4 : 1 }}>✕</button>}
              </span>
            ))}
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
                    {bulk.mode === "add" && fresh.length > MAX_UNIVERSE - uniList.length &&
                      <span style={{ color: T.red }}> · {fresh.length - (MAX_UNIVERSE - uniList.length)} over the cap will be dropped</span>}
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

        {/* master toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: kronEnabled ? T.brassSoft : T.card, border: "1px solid " + (kronEnabled ? T.brass + "66" : T.line), borderRadius: 11, padding: "13px 15px", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: kronEnabled ? T.brass : T.ink }}>AI Forecast criterion</div>
            <div style={{ fontSize: 11, color: T.mute, marginTop: 2 }}>{kronEnabled ? "Active — factored into every signal" : "Off — your other criteria run untouched"}</div>
          </div>
          <button onClick={() => { upCrit("kron", x => ({ ...x, enabled: !x.enabled })); }}
            style={{ width: 52, height: 30, borderRadius: 99, border: "1px solid " + (kronEnabled ? T.brass : T.line), background: kronEnabled ? T.brass : "transparent", position: "relative", transition: "all .3s", cursor: "pointer", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 3, left: kronEnabled ? 25 : 3, width: 22, height: 22, borderRadius: 99, background: kronEnabled ? "#141206" : T.dimSolid, transition: "left .25s cubic-bezier(.2,.8,.2,1)" }} />
          </button>
        </div>

        {/* status */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: T.card, border: "1px solid " + T.line, borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, letterSpacing: 1 }}>ORACLE FEED</div>
            <div style={{ fontSize: 12.5, marginTop: 3, color: oracleLive ? T.green : T.dimSolid }}>{oracleLive ? "● receiving" : "○ not connected"}</div>
          </div>
          <div style={{ flex: 1, background: T.card, border: "1px solid " + T.line, borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, letterSpacing: 1 }}>ENGINE</div>
            <div style={{ fontSize: 12.5, marginTop: 3, color: oracleEngine === "kronos-mini" ? T.brass : oracleEngine === "naive" ? T.red : T.dimSolid }}>
              {oracleEngine === "kronos-mini" ? "Kronos" : oracleEngine === "naive" ? "naive (fallback)" : "—"}
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

        {/* threshold control */}
        <SectionMini>Tune the threshold</SectionMini>
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

          {/* the matrix */}
          <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, overflow: "auto", maxHeight: "46vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {th("symbol", "SYMBOL")}
                  {fundColumns.map(k => {
                    const m = metricMeta(k);
                    const checked = fundChecks.filter(c => c.metric === k);
                    return th(k,
                      (m.adhoc ? "＋" : "") + shortLabel(k, m.label) + (checked.length ? " •" : ""),
                      `${m.label}${m.unit ? " (" + m.unit + ")" : ""}` +
                      (checked.length ? " · filtered " + checked.map(c => OPS[c.op] + " " + c.value).join(" and ") : "") +
                      (m.adhoc ? " · new metric from the backend — not named in this build yet" : ""));
                  })}
                  <th style={{ position: "sticky", top: 0, background: T.panel, borderBottom: "1px solid " + T.line,
                    padding: "7px 8px", fontFamily: T.mono, fontSize: 9, letterSpacing: 1, fontWeight: 400, color: T.dimSolid, textAlign: "right" }}>DATA</th>
                </tr>
              </thead>
              <tbody>
                {fundRows.map(({ sym, rec, verdicts, pass }) => (
                  <tr key={sym}>
                    <td style={{ padding: "7px 8px", borderBottom: "1px solid " + T.lineSoft, fontFamily: T.mono, fontSize: 11.5,
                      color: pass ? T.brass : T.ink, whiteSpace: "nowrap" }}>
                      {sym}
                    </td>
                    {fundColumns.map(k => {
                      const v = rec?.[k];
                      const j = verdicts[k];
                      const color = v == null ? T.dim
                        : !j ? T.mute
                        : j.unverified ? T.dimSolid
                        : j.ok ? T.green : T.red;
                      return (
                        <td key={k} title={j?.unverified ? "Unverified seed value — shown, but it cannot lock the gate" : undefined}
                          style={{ padding: "7px 8px", borderBottom: "1px solid " + T.lineSoft, textAlign: "right",
                            fontFamily: T.mono, fontSize: 11, whiteSpace: "nowrap", color,
                            background: j && !j.na && !j.unverified ? (j.ok ? T.green + "0E" : T.red + "0E") : "transparent" }}>
                          {fmtVal(k, v)}
                        </td>
                      );
                    })}
                    <td style={{ padding: "7px 8px", borderBottom: "1px solid " + T.lineSoft, textAlign: "right", whiteSpace: "nowrap" }}>
                      {rec?.status === "demo"
                        ? <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid }}>◌ demo</span>
                        : <span title={rec?.source || undefined} style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid }}>
                            <FundDot rec={rec || { status: "unavailable" }} /> {rec?.status || "none"}
                          </span>}
                    </td>
                  </tr>
                ))}
                {!fundRows.length && (
                  <tr><td colSpan={fundColumns.length + 2} style={{ padding: "22px 12px", textAlign: "center", fontSize: 12, color: T.dimSolid }}>
                    Universe is empty — add symbols first.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

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
