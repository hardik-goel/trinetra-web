/* ================================================================
   PRAVESH — data access
   Same pluggable pattern as the engine's store: Supabase if it is
   configured, otherwise the raw JSON file the engine commits.
   Nothing in the UI knows which one answered.

   Env (set either, or neither — the built-in default is the repo's
   raw GitHub URL):
     NEXT_PUBLIC_PRAVESH_DATA_URL   raw URL of data/latest.json
     NEXT_PUBLIC_SUPABASE_URL       project URL          ┐ both required
     NEXT_PUBLIC_SUPABASE_ANON_KEY  anon (public) key    ┘ for Supabase
     NEXT_PUBLIC_PRAVESH_LATEST_TABLE  defaults to pravesh_latest

   The engine is a separate repo. Everything below is read-only: the
   browser never scrapes, never scores, never recomputes an accuracy.
   ================================================================ */

const REPO = "hardik-goel/pravesh-engine";
const RAW = (branch) => `https://raw.githubusercontent.com/${REPO}/${branch}/data/latest.json`;
/* The engine's default branch is master. main is kept as a fallback only because
   the repo was renamed from it — GitHub's redirect covers older links today, and
   this survives it going away. */
const DEFAULT_DATA_URL = RAW("master");
const FALLBACK_DATA_URL = RAW("main");

/* These MUST be literal `process.env.NAME` reads. Next inlines NEXT_PUBLIC_*
   into the client bundle by textual substitution — a dynamic process.env[key]
   lookup compiles to undefined in the browser and the env var silently does
   nothing, which is exactly how this file used to behave. */
const ENV = {
  dataUrl: process.env.NEXT_PUBLIC_PRAVESH_DATA_URL || "",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  latestTable: process.env.NEXT_PUBLIC_PRAVESH_LATEST_TABLE || "",
};

export function praveshSource() {
  const supabaseUrl = ENV.supabaseUrl;
  const supabaseKey = ENV.supabaseKey;
  if (supabaseUrl && supabaseKey) {
    const table = ENV.latestTable || "pravesh_latest";
    return {
      kind: "supabase",
      label: "Supabase",
      configured: true,
      url: `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}?key=eq.current&select=payload`,
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    };
  }
  const explicit = ENV.dataUrl;
  return {
    kind: "json",
    /* Say where the snapshot actually came from — "GitHub" on a self-hosted
       URL would be a small lie in the one line that reports provenance. */
    label: !explicit || /githubusercontent\.com/.test(explicit) ? "GitHub" : "configured feed",
    configured: !!explicit, // false = we are guessing at the engine's default branch
    url: explicit || DEFAULT_DATA_URL,
    fallbackUrl: explicit ? "" : FALLBACK_DATA_URL,
    headers: {},
  };
}

/* The engine's contract is documented in pravesh-engine/README.md → "Web contract".
   Every scalar is nullable and a few have drifted names across engine versions, so
   the UI reads through normalize(), never the raw payload. */
export async function fetchPravesh(signal) {
  const src = praveshSource();
  let res;
  try {
    res = await fetch(src.url, { headers: src.headers, cache: "no-store", signal });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new Error(`could not reach ${src.label} (${src.url})`);
  }
  if (!res.ok && src.fallbackUrl) {
    res = await fetch(src.fallbackUrl, { cache: "no-store", signal }).catch(() => res);
  }
  if (!res.ok) throw new Error(`${src.label} returned HTTP ${res.status}`);

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error("the feed did not return JSON — check the URL points at data/latest.json");
  }
  const payload = src.kind === "supabase" ? body?.[0]?.payload : body;
  if (!payload || typeof payload !== "object") throw new Error("no Pravesh snapshot found at that URL");
  return { ...normalize(payload), _source: src.label };
}

/* ── normalization ────────────────────────────────────────────────
   Anything the engine states is passed through untouched. Anything it
   omits is derived only where the derivation is mechanical (a date is
   tomorrow, a count is a length). Verdicts, accuracies and rationales
   are never invented here — a missing one stays missing.               */

const str = (v) => (v == null ? "" : String(v));
const upper = (v) => str(v).toUpperCase().replace(/[\s-]+/g, "_");
const num = (v) => (v == null || v === "" || Number.isNaN(+v) ? null : +v);
const arr = (v) => (Array.isArray(v) ? v : []);
const pick = (o, ...keys) => {
  for (const k of keys) if (o?.[k] != null && o[k] !== "") return o[k];
  return null;
};
const slugify = (s) =>
  str(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ipo";

/* Market dates are Indian dates — comparing against the browser's midnight
   would call an IPO "closing tomorrow" a few hours early or late. */
export const istDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayISO = (iso) => (iso ? str(iso).slice(0, 10) : "");
const shift = (isoDay, days) => {
  const d = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(+d)) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function normalize(p) {
  /* Some engine builds ship the bare array of IPOs; later ones wrap it. */
  const root = Array.isArray(p) ? { ipos: p } : p;
  const today = istDate();
  const tomorrow = shift(today, 1);

  /* Engine schema 3+. An empty array means no expert source published per-issue
     discovery this run, which is the same amount of knowledge as the block being
     absent — so both collapse to "untracked" rather than to "checked". */
  const reachRows = arr(pick(root, "expert_reachability", "expertReachability")).map(normReach);
  const reachTracked = reachRows.length > 0;
  const reachBySlug = new Map(reachRows.map((r) => [r.slug, r]));

  const ipos = arr(pick(root, "ipos", "issues", "data"))
    .map((i) => normIpo(i, today, tomorrow, reachBySlug, reachTracked));
  const counts = root.counts || {
    open: ipos.filter((i) => i.status === "OPEN").length,
    closing_tomorrow: ipos.filter((i) => i.closing_tomorrow).length,
    upcoming: ipos.filter((i) => i.status === "UPCOMING").length,
    watch: ipos.filter((i) => i.status === "CLOSED").length,
  };

  return {
    schemaVersion: root.schema_version ?? 1,
    brand: root.brand || { name: "Trinetra Pravesh", tagline: "" },
    generatedAt: root.generated_at || null,
    generatedAtMarket: root.generated_at_market || root.generated_at || null,
    runDate: root.run_date || null,
    counts,
    ipos,
    leaderboard: arr(pick(root, "leaderboard", "sources", "source_leaderboard")).map(normSource),
    ownAccuracy: root.own_accuracy || { label: "insufficient history (n=0)", n_all: 0 },
    history: arr(root.history).map(normHistory),
    sourcesOk: arr(root.sources_ok),
    sourcesFailed: arr(root.sources_failed),
    expertCoverage: arr(pick(root, "expert_coverage", "expertCoverage")).map(normExpertCoverage),
    /* Run-level counts, derived only by counting rows the engine already stated. */
    coverage: {
      tracked: reachTracked,
      issues: reachRows.length,
      unchecked: reachRows.filter((r) => !r.reachable).length,
      partial: reachRows.filter((r) => r.reachable && r.checked < r.total).length,
    },
    disclaimer:
      root.disclaimer ||
      "Informational only. Not investment advice. Do your own research — the final call is yours.",
  };
}

const VERDICT_ALIASES = {
  APPLY: "APPLY",
  SUBSCRIBE: "APPLY",
  SUBSCRIBE_LONG_TERM: "APPLY",
  APPLY_LONG_TERM: "APPLY",
  LISTING_GAINS: "LISTING_GAINS",
  APPLY_LISTING_GAINS: "LISTING_GAINS",
  RISKY: "RISKY",
  NEUTRAL: "RISKY",
  AVOID: "AVOID",
  PRELIMINARY: "PRELIMINARY",
  NO_VIEW: "PRELIMINARY",
};
const VERDICT_TEXT = {
  APPLY: { label: "APPLY", emoji: "✓" },
  LISTING_GAINS: { label: "LISTING GAINS ONLY", emoji: "→" },
  RISKY: { label: "RISKY — NO CALL", emoji: "◐" },
  AVOID: { label: "AVOID", emoji: "✕" },
  PRELIMINARY: { label: "PRELIMINARY", emoji: "…" },
};

function normTake(raw) {
  const t = raw && typeof raw === "object" ? raw : null;
  if (!t) return null;
  const key = VERDICT_ALIASES[upper(pick(t, "verdict_key", "verdict"))] || "PRELIMINARY";
  const score = num(t.score);
  return {
    verdict_key: key,
    verdict_label: t.verdict_label || VERDICT_TEXT[key].label,
    verdict_emoji: t.verdict_emoji || VERDICT_TEXT[key].emoji,
    paragraph:
      str(pick(t, "paragraph", "reasoning", "reasoned_paragraph", "rationale", "text")) ||
      "No reasoned take has been written for this issue yet.",
    score,
    has_score: t.has_score === false ? false : score != null,
    modifiers: arr(t.modifiers).map(str),
  };
}

/* ── expert reachability ──────────────────────────────────────────
   The question an empty evidence table cannot answer by itself is "was THIS
   issue checked". Google News RSS rate-limits per query, so a source stays
   alive for the run while going silent on specific issues — a source-level
   flag reports the run and says nothing about the issue in front of you.
   Rendering an unchecked issue as "nobody published a view" states a coverage
   fact that was never established.                                        */

function normReach(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const routes = arr(r.routes).map((x) => ({
    expert: str(pick(x, "expert", "name")) || "Unnamed expert",
    reachable: !!x.reachable,
    via: str(pick(x, "via", "foundVia")),
    answeredRoutes: arr(pick(x, "answeredRoutes", "answered_routes")).map(str),
    quietRoutes: arr(pick(x, "quietRoutes", "quiet_routes")).map(str),
  }));
  const total = num(pick(r, "expertsTotal", "experts_total")) ?? routes.length;
  const checked = num(pick(r, "expertsChecked", "experts_checked")) ?? routes.filter((x) => x.reachable).length;
  return {
    slug: str(pick(r, "ipoSlug", "ipo_slug")) || slugify(pick(r, "ipoName", "ipo_name")),
    reachable: r.reachable != null ? !!r.reachable : checked > 0,
    checked,
    total,
    routes,
  };
}

/* Four states, and only one of them ("full") lets an empty table be read as an
   absence of views. The others are gaps in checking and must say so. */
function coverageOf(reach, tracked) {
  if (!tracked) return { state: "unknown", checked: 0, total: 0, routes: [] };
  /* Tracked, but this issue has no row: no expert was asked about it at all —
     the engine omits an issue nobody's discovery covered. */
  if (!reach) return { state: "unasked", checked: 0, total: 0, routes: [] };
  const state = !reach.reachable ? "none" : reach.checked < reach.total ? "partial" : "full";
  return { state, checked: reach.checked, total: reach.total, routes: reach.routes };
}

function normExpertCoverage(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    expert: str(pick(r, "expert", "name")) || "Unnamed expert",
    queried: num(r.queried) ?? 0,
    calls: num(r.calls) ?? 0,
    noView: num(pick(r, "noView", "no_view")) ?? 0,
    /* The subset of noView that was never actually asked. noView on its own
       conflates "he had no view" with "we could not reach the source". */
    unreachable: num(r.unreachable) ?? 0,
    droppedNoUrl: num(pick(r, "droppedNoUrl", "dropped_no_url")) ?? 0,
  };
}

const SINGHVI_BANNER = "⚠ Anil Singhvi says AVOID";

function normIpo(raw, today, tomorrow, reachBySlug, reachTracked) {
  const i = raw && typeof raw === "object" ? raw : {};
  const name = str(pick(i, "name", "ipo_name", "company")) || "Unnamed issue";
  const open_date = dayISO(pick(i, "open_date", "open", "opens"));
  const close_date = dayISO(pick(i, "close_date", "close", "closes"));

  let status = upper(i.status);
  if (!["OPEN", "UPCOMING", "CLOSED"].includes(status)) {
    status = !open_date || !close_date
      ? "UPCOMING"
      : today < open_date ? "UPCOMING" : today > close_date ? "CLOSED" : "OPEN";
  }

  const veto = i.singhvi_veto === true || i.singhvi_veto === "true";
  const flags = arr(i.flags).map(str);
  /* The veto is the loudest thing on the card, so it is guaranteed present
     whether the engine sends it as a flag string or as the boolean. */
  if (veto && !flags.some((f) => /singhvi/i.test(f))) flags.unshift(SINGHVI_BANNER);

  const s = i.subscription || i.subs || {};
  const slug = str(i.slug) || slugify(name);
  return {
    slug,
    name,
    /* Whether this issue was checked at all — the only honest basis for
       reading an empty evidence table. Never derived from the run. */
    coverage: coverageOf(reachBySlug?.get(slug), !!reachTracked),
    segment: upper(i.segment) === "SME" ? "SME" : "MAINBOARD",
    status,
    closing_tomorrow:
      i.closing_tomorrow != null ? !!i.closing_tomorrow : status !== "CLOSED" && !!close_date && close_date === tomorrow,
    singhvi_veto: veto,
    flags,
    open_date,
    close_date,
    allotment_date: dayISO(pick(i, "allotment_date", "allotment")),
    listing_date: dayISO(pick(i, "listing_date", "listing")),
    price_band_label:
      str(pick(i, "price_band_label", "price_band")) ||
      (num(i.price_band_low) != null && num(i.price_band_high) != null
        ? `₹${num(i.price_band_low)}–₹${num(i.price_band_high)}`
        : ""),
    lot_size: num(pick(i, "lot_size", "lot")),
    min_investment: num(pick(i, "min_investment", "min_amount")),
    issue_size_cr: num(pick(i, "issue_size_cr", "issue_size")),
    fresh_issue_cr: num(pick(i, "fresh_issue_cr", "fresh_issue")),
    ofs_cr: num(pick(i, "ofs_cr", "ofs")),
    ofs_pct: num(i.ofs_pct),
    subscription: {
      qib: num(pick(s, "qib", "QIB")),
      nii: num(pick(s, "nii", "NII", "hni")),
      retail: num(pick(s, "retail", "RETAIL")),
      total: num(pick(s, "total", "overall")),
    },
    gmp: num(i.gmp),
    gmp_pct: num(pick(i, "gmp_pct", "gmp_percent")),
    evidence: arr(pick(i, "evidence", "evidence_table", "sources")).map(normEvidence),
    take: normTake(pick(i, "take", "my_take", "myTake")),
  };
}

function normEvidence(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const accuracy_pct = num(pick(r, "accuracy_pct", "accuracy", "accuracy_all"));
  const accuracy_n = num(pick(r, "accuracy_n", "n", "n_all")) ?? 0;
  return {
    source_name: str(pick(r, "source_name", "source", "name")) || "Unnamed source",
    url: str(r.url) || "",
    stance: upper(pick(r, "stance", "call", "view")),
    stance_label: str(pick(r, "stance_label", "stance", "call")),
    rationale: str(pick(r, "rationale", "why", "reason", "snippet")),
    accuracy_pct,
    accuracy_n,
    /* Engine-authored label wins; the fallback applies the same n<5 rule. */
    accuracy_label: str(r.accuracy_label) || defaultAccuracyLabel(accuracy_pct, accuracy_n),
    is_synthetic: !!pick(r, "is_synthetic", "synthetic"),
  };
}

function normSource(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    source_name: str(pick(r, "source_name", "source", "name")) || "Unnamed source",
    accuracy_all: num(pick(r, "accuracy_all", "accuracy")),
    accuracy_recent: num(pick(r, "accuracy_recent", "accuracy_15", "recent")),
    n_all: num(pick(r, "n_all", "n")) ?? 0,
    is_synthetic: !!pick(r, "is_synthetic", "synthetic"),
  };
}

function normHistory(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const key = VERDICT_ALIASES[upper(pick(r, "verdict_key", "verdict"))] || null;
  const gain = num(pick(r, "listing_gain_pct", "listing_gain", "gain_pct"));
  let correct = r.correct;
  /* Only graded here when the engine left it blank, and only by the rule the
     History view states on screen: ±5%, RISKY excluded as a refusal to call. */
  if (correct == null && gain != null && (key === "APPLY" || key === "LISTING_GAINS" || key === "AVOID")) {
    correct = key === "AVOID" ? gain <= 5 : gain >= 5;
  }
  return {
    ipo_slug: str(pick(r, "ipo_slug", "slug")) || slugify(pick(r, "ipo_name", "name")),
    ipo_name: str(pick(r, "ipo_name", "name")) || "Unnamed issue",
    segment: upper(r.segment) === "SME" ? "SME" : "MAINBOARD",
    listing_date: dayISO(pick(r, "listing_date", "listed_on")),
    verdict_key: key,
    listing_gain_pct: gain,
    correct: correct == null ? null : !!correct,
    flags: arr(r.flags).map(str),
  };
}

/* ── presentation helpers (shared by the tab's three views) ── */

export const STANCE_TONE = {
  APPLY: "good",
  SUBSCRIBE: "good",
  SUBSCRIBE_LONG_TERM: "good",
  APPLY_LISTING_GAINS: "ok",
  LISTING_GAINS: "ok",
  NEUTRAL: "flat",
  AVOID: "bad",
  NO_VIEW: "none",
};

export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(+d)
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

export const fmtMoney = (v, digits = 0) =>
  v == null || Number.isNaN(+v)
    ? "—"
    : "₹" + (+v).toLocaleString("en-IN", { maximumFractionDigits: digits });

export const fmtX = (v) => (v == null || Number.isNaN(+v) ? "—" : `${(+v).toFixed(2)}×`);

export const fmtPct = (v, sign = false) =>
  v == null || Number.isNaN(+v) ? "—" : `${sign && +v > 0 ? "+" : ""}${(+v).toFixed(1)}%`;

/* Accuracy is ALWAYS rendered from a label that carries n: a bare percentage
   with a hidden sample size is a way to lie. n<5 is never shown as a number. */
function defaultAccuracyLabel(pct, n) {
  const count = n ?? 0;
  if (count < 5 || pct == null) return `insufficient history (n=${count})`;
  return `${Math.round(pct)}% (n=${count})`;
}
export const accuracyText = (row) => row?.accuracy_label || defaultAccuracyLabel(row?.accuracy_pct, row?.accuracy_n);

export const isSufficient = (row) => (row?.accuracy_n ?? 0) >= 5 && row?.accuracy_pct != null;

/* One sentence per coverage state, in both places it is needed:
     `empty` — the whole message when the evidence table has no rows.
     `note`  — the qualifier under a table that DOES have rows, because a
               partially checked issue can show one view and still be short
               of what was said.
   Only "full" earns the reading that an absence is itself information. Every
   other state is a gap in checking and has to be named as one — the engine
   ships this precisely so the UI stops guessing. */
export function coverageText(c) {
  const routes = arr(c?.routes);
  const names = (list) => list.map((r) => r.expert).join(", ");
  const answered = names(routes.filter((r) => r.reachable));
  const quiet = names(routes.filter((r) => !r.reachable));
  const total = c?.total ?? 0;

  switch (c?.state) {
    case "full":
      return {
        empty: `No named source has published a view on this issue — ${total === 1 ? "the one expert" : `all ${total} experts`} covered here ${total === 1 ? "was" : "were"} checked. That absence is itself information.`,
        note: "",
      };
    case "partial":
      return {
        empty: `Only ${c.checked} of ${total} experts could be checked on this issue${answered ? ` — ${answered} answered` : ""}${quiet ? `, ${quiet} stayed quiet` : ""}. This blank is partly a gap in checking, so it is not an absence of views.`,
        note: `Partial coverage — ${c.checked} of ${total} experts answered about this issue${quiet ? `; ${quiet} could not be reached` : ""}. What is below may be short of what was actually said.`,
      };
    case "none":
      return {
        empty: `Nothing could be checked about this issue on the last run${quiet ? ` — ${quiet} stayed quiet` : ""}. This blank carries no information about what anyone thinks.`,
        note: "No expert discovery answered about this issue on the last run, so this table is not a complete record of what was said.",
      };
    case "unasked":
      return {
        empty: "No expert was asked about this issue on the last run — its segment or status puts it outside their coverage. This blank says nothing about what anyone thinks.",
        note: "No expert covers this issue, so this table is only the non-expert sources.",
      };
    default: // "unknown" — the feed predates per-issue reachability
      return {
        empty: "This feed does not report which experts were checked, so an empty table cannot be read as an absence of views.",
        note: "",
      };
  }
}
