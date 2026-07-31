"use client";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

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

const METRICS = {
  roe:          { label: "Return on equity", unit: "%",   group: "F", get: s => s.fund?.roe },
  de:           { label: "Debt / equity", unit: "",       group: "F", get: s => s.fund?.de },
  profitGrowth: { label: "Profit growth (3y)", unit: "%", group: "F", get: s => s.fund?.profitGrowth },
  promoter:     { label: "Promoter holding", unit: "%",   group: "F", get: s => s.fund?.promoter },
  pledged:      { label: "Pledged shares", unit: "%",     group: "F", get: s => s.fund?.pledged },
  dayChgPct:    { label: "Day change", unit: "%",         group: "B", get: s => ((s.price - s.prevClose) / s.prevClose) * 100 },
  aboveHigh20:  { label: "Above 20-day high", unit: "y/n",group: "B", get: s => (s.price > s.high20 ? 1 : 0) },
  pctOf52wHigh: { label: "% of 52-wk high", unit: "%",    group: "B", get: s => (s.price / s.high52) * 100 },
  volMultiple:  { label: "Volume vs 20d avg", unit: "×",  group: "V", get: s => (s.avgVol20 ? s.volToday / s.avgVol20 : NaN) },
  buyerPct:     { label: "Buyer share of book", unit: "%",group: "O", get: s => { const t = (s.bidQty||0)+(s.askQty||0); return t ? (s.bidQty/t)*100 : NaN; } },
  price:        { label: "Last price", unit: "₹",         group: "B", get: s => s.price },
  fcstReturn:   { label: "AI forecast return", unit: "%", group: "K", get: s => s.fcst?.ret },
};
const fmtIN = v => (+v).toLocaleString("en-IN");
const fmtVal = (id, v) => {
  if (v == null || Number.isNaN(v)) return "—";
  const u = METRICS[id].unit;
  if (u === "y/n") return v ? "yes" : "no";
  if (u === "₹") return "₹" + fmtIN((+v).toFixed(2));
  return (+v).toFixed(u === "×" || u === "" ? 2 : 1) + u;
};
const OPS = { gte: "≥", lte: "≤" };
const checkOk = (s, c) => {
  const v = METRICS[c.metric]?.get(s);
  if (v == null || Number.isNaN(v)) return { v, ok: false, na: true };
  return { v, ok: c.op === "gte" ? v >= c.value : v <= c.value, na: false };
};
function evaluate(s, criteria) {
  const active = criteria.filter(c => c.enabled);
  const results = active.map(c => {
    const checks = c.checks.map(ch => { const r = checkOk(s, ch); return { label: METRICS[ch.metric].label, value: fmtVal(ch.metric, r.v), req: OPS[ch.op] + " " + fmtVal(ch.metric, ch.value), ok: r.ok, na: r.na }; });
    return { ...c, checksOut: checks, pass: checks.length > 0 && checks.every(x => x.ok), na: checks.some(x => x.na) };
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
    return { symbol, name, sector, scenario, fund: { roe, de, profitGrowth: pg, promoter: ph, pledged: pl },
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
      if (j.ok) { setMode("live"); setConn({ state: "live", lastSync: null, delayed: j.delayed, provider: j.provider }); return true; }
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
        <style>{css}</style>
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
      <style>{css}</style>

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
          <button onClick={() => setPanel("universe")} style={chip()}>Universe <span style={{ color: T.mute, fontFamily: T.mono }}>{stocks.length}</span></button>
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
                  <span style={{ fontFamily: T.mono, fontSize: 10.5, color: c.pass ? T.green : c.na ? T.red : T.dimSolid }}>{c.pass ? "LOCKED" : c.na ? "NO DATA" : "OPEN"}</span>
                </div>
                {c.checksOut.map(chk => (
                  <div key={chk.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "1px dotted " + T.lineSoft }}>
                    <span style={{ color: T.mute, fontSize: 12 }}>{chk.label}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 12 }}><span>{chk.value}</span><span style={{ color: T.dimSolid, margin: "0 8px", fontSize: 10 }}>{chk.req}</span><span style={{ color: chk.ok ? T.green : T.red }}>{chk.ok ? "✓" : "✗"}</span></span>
                  </div>
                ))}
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
                    {Object.entries(METRICS).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
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
      {panel === "universe" && <Drawer title="Universe" onClose={() => setPanel(null)}>
        <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginBottom: 12 }}>
          These {stocks.length} names are the demo watchlist — recognizable, liquid mid/large-caps I picked to make the instrument realistic. <span style={{ color: T.ink }}>They are not a recommendation and not your portfolio.</span> Your real watchlist lives in the backend's <span style={{ fontFamily: T.mono, color: T.brass }}>universe.json</span> — replace these with the stocks you actually hunt.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {stocks.map(s => <span key={s.symbol} style={{ fontFamily: T.mono, fontSize: 11, color: T.mute, background: T.card, border: "1px solid " + T.line, borderRadius: 6, padding: "4px 8px" }}>{s.symbol}</span>)}
        </div>
      </Drawer>}

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
function Drawer({ title, onClose, children }) {
  return <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, background: "#000B", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
    <div onClick={e => e.stopPropagation()} className="rise" style={{ width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", background: T.panel, border: "1px solid " + T.line, borderRadius: "16px 16px 0 0", padding: 18 }}>
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
