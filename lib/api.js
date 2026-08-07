/* ================================================================
   THE ONE PLACE A REQUEST TO THE BACKEND IS MADE.

   Backend a9d587b put the whole instance behind a session. Two things
   are now true of EVERY call, and both fail silently if a call site
   forgets them — which is why no call site is allowed to make its own
   fetch any more:

     · `credentials: "include"`. The session is an httpOnly cookie, not
       a bearer token. Without this the browser does not attach it, the
       request is anonymous, and the 401 that comes back looks exactly
       like a login that did not take. There is deliberately no token to
       store: localStorage is readable by any script on the page, so one
       bad dependency would own every account.

     · `x-csrf-token` on anything that is not a GET, echoing the value
       the server hands back from /auth/login, /auth/signup and
       /auth/me. The `trinetra_csrf` cookie carries the same value and
       is readable, but reading the body is simpler and cannot be
       confused by a stale cookie.

   The token lives in memory only, for the same reason the session does.
   A reload re-reads it from /auth/me, which the boot sequence does
   before anything renders.
   ================================================================ */

const clean = (b) => String(b || "").replace(/\/$/, "");

let csrf = null;
/* Notified when a call comes back 401 so the shell can route to the
   login screen from anywhere, including a poll that fires while the
   user is looking at a different panel. */
let onUnauthorized = null;

export const setCsrf = (t) => { csrf = t || null; };
export const getCsrf = () => csrf;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

/** Thrown instead of a bare Error so a caller can branch on the status
    without parsing the message — and so the server's own wording is the
    thing that reaches the screen. */
export class ApiError extends Error {
  constructor(status, body, fallback) {
    super(body?.error || fallback || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body || null;
    // 401 from the backend carries this; a network 401 from anywhere
    // else does not, and must not be treated as "please log in".
    this.authRequired = !!body?.authRequired;
    this.detail = body?.detail || null;
  }
}

/**
 * @param base    backend origin
 * @param path    "/snapshot", "/auth/me", …
 * @param opts.method, opts.body, opts.headers
 * @param opts.raw     resolve the Response instead of the parsed body
 * @param opts.quiet   do not fire the unauthorized handler on a 401.
 *                     Used by the boot probe, where 401 is the ANSWER —
 *                     routing to login from inside the call that is
 *                     asking "am I logged in?" is a loop.
 */
export async function request(base, path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const res = await fetch(clean(base) + path, {
    method,
    // Not negotiable, and not per-call. See the header comment.
    credentials: "include",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" && csrf ? { "x-csrf-token": csrf } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
    signal: opts.signal,
  });

  if (opts.raw) return res;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(res.status, json);
    if (res.status === 401 && !opts.quiet && onUnauthorized) onUnauthorized(err);
    throw err;
  }
  /* Any authenticated response may carry a rotated token. Picking it up
     here means no screen has to remember to. */
  if (json && typeof json === "object" && json.csrfToken) csrf = json.csrfToken;
  return json;
}

export const qs = (o) => {
  const p = Object.entries(o)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return p.length ? "?" + p.join("&") : "";
};

/* ── auth surface ────────────────────────────────────────────────── */

export function authApi(base) {
  return {
    /* Which form to show, before anything else renders. `mode:
       "single-user"` means this instance has no accounts at all and the
       app runs exactly as it did — dev and local instances are like
       that, so it is a supported state, not a fallback. */
    config:   ()      => request(base, "/auth/config", { quiet: true }),
    /* 401 here is an answer, not a failure — hence quiet. */
    me:       ()      => request(base, "/auth/me", { quiet: true }),
    login:    (body)  => request(base, "/auth/login",  { method: "POST", body, quiet: true }),
    signup:   (body)  => request(base, "/auth/signup", { method: "POST", body, quiet: true }),
    logout:   ()      => request(base, "/auth/logout", { method: "POST", quiet: true }),

    changePassword: (body) => request(base, "/auth/password", { method: "POST", body }),
    sessions:       ()     => request(base, "/auth/sessions"),
    revokeOthers:   ()     => request(base, "/auth/sessions/revoke-all", { method: "POST" }),

    prefs:     ()     => request(base, "/me/prefs"),
    savePrefs: (body) => request(base, "/me/prefs", { method: "POST", body }),
    testAlert: ()     => request(base, "/me/prefs/test", { method: "POST" }),

    // owner only — 403 for everyone else
    createInvite: (body) => request(base, "/admin/invites", { method: "POST", body: body || {} }),
    invites:      ()     => request(base, "/admin/invites"),
    users:        ()     => request(base, "/admin/users"),
    setUserStatus: (id, status) => request(base, `/admin/users/${id}`, { method: "PATCH", body: { status } }),
  };
}
