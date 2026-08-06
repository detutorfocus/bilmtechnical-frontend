import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";

// ─── Logo ──────────────────────────────────────────────────────────────────
// FIX: previously this was a giant hardcoded base64 string baked directly
// into the JS bundle. That meant "changing the logo" required manually
// re-encoding a new image to base64 and pasting it in — and worse, editing
// src={LOGO} in only ONE of its 4 usages (navbar/login/sidebar/loading
// screen) left the other 3 showing the old image, since they all reference
// this SAME constant.
//
// Now LOGO is just a path string pointing at a real file in the Vite
// public/ folder. To change the logo going forward: replace the file at
// bilm-frontend/public/logo.png — no code edits needed anywhere, and it
// updates in all 4 places (navbar, login page, sidebar, loading screen)
// simultaneously since they all read this one constant.
const LOGO = "/logo.png";

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SHARED CONSTANTS ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const API = import.meta.env.VITE_API_URL || "http://localhost:8100/api";
// WebSocket URL derived from API — swaps http(s) for ws(s), keeps same host/port.
// If VITE_API_URL is "http://localhost:8100/api", this becomes "ws://localhost:8100/api".
const WS_URL = API.replace(/^http/, "ws");

const G = {
  bg: "#060e1c", side: "#080f1d", card: "#0d1b2e",
  border: "rgba(34,197,94,0.15)", green: "#22c55e",
  gdim: "rgba(34,197,94,0.1)", text: "#c8d8eb",
  muted: "#5a7a9a", blue: "#3b82f6", amber: "#f59e0b", red: "#ef4444",
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("bilm_token");
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    // FastAPI's `detail` can be either a plain string OR a structured
    // object (e.g. { message, existing_client } for 409 duplicate-client
    // responses). Preserve both shapes so callers can branch on them —
    // previously this always coerced to a string, silently discarding
    // the existing_client payload the backend intentionally sends back.
    const message = typeof err.detail === "string" ? err.detail : (err.detail?.message || "Request failed");
    const error = new Error(message);
    error.status = res.status;
    error.detail = err.detail; // full structured detail, if any
    throw error;
  }
  return res.json();
}

/**
 * Dedicated file-upload helper — deliberately NOT built on apiFetch, since
 * apiFetch hardcodes "Content-Type": "application/json", which is wrong
 * for file uploads. FormData needs the browser to set its own
 * "multipart/form-data; boundary=..." header automatically — manually
 * setting Content-Type here would break the upload silently.
 * Posts to POST /api/upload/image, returns the Cloudinary URL string.
 */
async function uploadImage(file) {
  const token = localStorage.getItem("bilm_token");
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API}/upload/image`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const message = typeof err.detail === "string" ? err.detail : "Upload failed";
    throw new Error(message);
  }
  const data = await res.json();
  return data.url; // matches { "url": result["secure_url"] } from the backend
}

const AuthCtx = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem("bilm_token");
    if (token) {
      apiFetch("/auth/me").then(setUser).catch(() => localStorage.removeItem("bilm_token")).finally(() => setReady(true));
    } else setReady(true);
  }, []);
  /**
   * Step 1 of 2. Posts email+password to /auth/login. The backend returns
   * {otp_required, message} instead of a token directly — it emails a
   * 6-digit code and waits for verifyOtp() below to actually complete
   * the sign-in.
   */
  const requestOtp = async (email, password) => {
    const form = new URLSearchParams({ username: email, password });
    const res = await fetch(`${API}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "Login failed");
    return data; // { otp_required: true, message: "A verification code was sent to ..." }
  };

  /**
   * Step 2 of 2. Posts the emailed code to /auth/verify-otp. On success
   * returns a real access_token — same shape the old single-step
   * /auth/login used to return directly.
   */
  const verifyOtp = async (email, code) => {
    const data = await fetch(`${API}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    }).then(r => r.json());
    if (!data.access_token) throw new Error(data.detail || "Invalid or expired code");
    localStorage.setItem("bilm_token", data.access_token);
    const me = await apiFetch("/auth/me");
    setUser(me);
    return me;
  };

  const logout = () => { localStorage.removeItem("bilm_token"); setUser(null); };
  return <AuthCtx.Provider value={{ user, requestOtp, verifyOtp, logout, ready }}>{children}</AuthCtx.Provider>;
}

const useAuth = () => useContext(AuthCtx);

// ─── Data hook ────────────────────────────────────────────────────────────────
function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try { setData(await apiFetch(path)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PORTAL ICONS ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const Ico = {
  Dash: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  Users: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>,
  Quote: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  Truck: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="3" width="15" height="13" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>,
  Wrench: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>,
  Mail: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
  Chart: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" /></svg>,
  Gear: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>,
  Shield: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  Save: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>,
  Menu: () => <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
  Refresh: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg>,
  Check: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>,
  Eye: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
  Bell: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>,
  Box: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>,
  Plus: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  Edit: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
  Chat: () => <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>,
  Send: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
  X: () => <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SHARED PORTAL UI ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function Spinner() {
  return (
    <div className="w-5 h-5 rounded-full border-2 animate-spin"
      style={{ borderColor: `${G.green} transparent transparent transparent` }} />
  );
}

function Badge({ s }) {
  const M = {
    new: { c: "#3b82f6", l: "NEW" }, warm: { c: "#f59e0b", l: "WARM" }, hot: { c: "#ef4444", l: "HOT" },
    cold: { c: "#6b7280", l: "COLD" }, converted: { c: "#22c55e", l: "CONVERTED" },
    draft: { c: "#6b7280", l: "DRAFT" }, sent: { c: "#3b82f6", l: "SENT" },
    negotiating: { c: "#f59e0b", l: "NEGOTIATING" }, accepted: { c: "#22c55e", l: "ACCEPTED" },
    expired: { c: "#ef4444", l: "EXPIRED" }, active: { c: "#22c55e", l: "ACTIVE" },
    due: { c: "#f59e0b", l: "DUE" }, overdue: { c: "#ef4444", l: "OVERDUE" },
    completed: { c: "#6b7280", l: "DONE" }, scheduled: { c: "#3b82f6", l: "SCHEDULED" },
    in_progress: { c: "#f59e0b", l: "IN PROGRESS" }, queued: { c: "#8b5cf6", l: "QUEUED" },
    failed: { c: "#ef4444", l: "FAILED" }, cancelled: { c: "#6b7280", l: "CANCELLED" },
  };
  const x = M[s] || { c: "#6b7280", l: (s || "").toUpperCase() };
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold tracking-wider"
      style={{ background: `${x.c}20`, color: x.c, border: `1px solid ${x.c}50`, fontFamily: "Barlow Condensed,sans-serif" }}>
      {x.l}
    </span>
  );
}

function Card({ children, className = "", style = {} }) {
  return (
    <div className={`rounded-xl p-5 ${className}`}
      style={{ background: G.card, border: `1px solid ${G.border}`, ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-xs font-bold tracking-widest mb-4 flex items-center gap-2"
      style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>
      <div className="h-px w-4" style={{ background: G.green }} />
      {children}
      <div className="h-px flex-1" style={{ background: `${G.green}30` }} />
    </div>
  );
}

function KPI({ label, value, icon, color = G.green, sub }) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs font-bold tracking-widest" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>{label}</div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div className="text-4xl font-black leading-none" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>
        {value ?? <Spinner />}
      </div>
      {sub && <div className="text-xs mt-1.5" style={{ color: G.muted }}>{sub}</div>}
    </Card>
  );
}

function HealthBar({ pct }) {
  const c = pct >= 80 ? G.green : pct >= 60 ? G.amber : G.red;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: c }} />
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{ color: c, fontFamily: "Barlow Condensed,sans-serif" }}>{pct}%</span>
    </div>
  );
}

function MiniChart({ data, color = G.green }) {
  const max = Math.max(...data.map(d => d.v), 1);
  return (
    <div className="flex items-end gap-1.5 h-20 mt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t-sm" style={{ height: `${(d.v / max) * 56}px`, background: `linear-gradient(to top, ${color}60, ${color})` }} />
          <span style={{ color: G.muted, fontSize: "0.55rem", fontFamily: "Barlow Condensed,sans-serif", letterSpacing: "0.05em" }}>{d.l}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ msg = "No records found" }) {
  return (
    <div className="py-14 text-center">
      <div className="text-4xl mb-3 opacity-30">⚙</div>
      <div className="text-xs font-bold tracking-widest" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>{msg.toUpperCase()}</div>
    </div>
  );
}

function ErrBox({ msg }) {
  return (
    <div className="p-4 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.08)", color: G.red, border: `1px solid rgba(239,68,68,0.25)` }}>
      ⚠ {msg}
    </div>
  );
}

const INP = {
  background: "rgba(255,255,255,0.05)", border: `1px solid rgba(34,197,94,0.2)`,
  color: "white", borderRadius: "0.5rem", padding: "0.7rem 1rem",
  width: "100%", fontSize: "0.85rem", fontFamily: "Barlow,sans-serif", outline: "none",
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── LANDING PAGE (bilm-website) ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

const Icon = {
  Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>,
  Bolt: () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
  Truck: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6"><rect x="1" y="3" width="15" height="13" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>,
  Wrench: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>,
  Package: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>,
  HardHat: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6"><path d="M2 18a1 1 0 001 1h18a1 1 0 001-1v-2a1 1 0 00-1-1H3a1 1 0 00-1 1v2z" /><path d="M10 10V7a2 2 0 114 0v3" /><path d="M4 15V9a8 8 0 0116 0v6" /></svg>,
  Shield: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  Clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5"><polyline points="20 6 9 17 4 12" /></svg>,
  Arrow: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>,
  Mail: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
  Phone: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.7A2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.72 6.72l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>,
  MapPin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>,
  MenuIcon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
  X: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  ChartBar: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" /></svg>,
  Users: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  Lock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
};

// ─── Logo ─────────────────────────────────────────────────────────────────────
function SiteLogo({ size = "md" }) {
  const h = size === "lg" ? 56 : size === "sm" ? 32 : 40;
  const maxW = size === "lg" ? 180 : size === "sm" ? 110 : 145;
  return (
    <img
      src={LOGO}
      alt="Bilm Technical Services"
      style={{ height: h, width: "auto", maxWidth: maxW, objectFit: "contain", display: "block" }}
    />
  );
}

// ─── Site Navbar (with Portal Login button) ───────────────────────────────────
function SiteNavbar({ activePage, setActivePage, onPortalLogin }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navLinks = ["Home", "About", "Services", "Equipment", "Quote", "Contact"];

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "shadow-2xl" : ""}`}
      style={{ background: scrolled ? "rgba(10,22,40,0.97)" : "rgba(10,22,40,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(34,197,94,0.15)" }}>
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        <SiteLogo />
        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(l => (
            <button key={l} onClick={() => setActivePage(l)}
              className="px-4 py-2 text-sm font-semibold tracking-widest transition-all duration-200 rounded"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                color: activePage === l ? "#22c55e" : "#c8d6e5",
                background: activePage === l ? "rgba(34,197,94,0.1)" : "transparent",
                letterSpacing: "0.1em",
                borderBottom: activePage === l ? "2px solid #22c55e" : "2px solid transparent"
              }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-5 py-2 font-bold text-sm rounded transition-all hover:opacity-90"
            style={{ background: "#22c55e", color: "#0a1628", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em" }}
            onClick={() => setActivePage("Quote")}>
            REQUEST QUOTE
          </button>
          {/* ── PORTAL LOGIN BUTTON ── */}
          <button
            onClick={onPortalLogin}
            className="flex items-center gap-2 px-4 py-2 font-bold text-sm rounded border transition-all hover:opacity-90"
            style={{ background: "transparent", color: "#22c55e", border: "1px solid rgba(34,197,94,0.5)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em" }}>
            <Icon.Lock /> PORTAL LOGIN
          </button>
        </div>
        <button className="md:hidden text-white" onClick={() => setMobileOpen(v => !v)}>
          {mobileOpen ? <Icon.X /> : <Icon.MenuIcon />}
        </button>
      </div>
      {/* Mobile menu */}
      {mobileOpen && (
        <div style={{ background: "#0a1628", borderTop: "1px solid rgba(34,197,94,0.2)" }} className="md:hidden px-4 py-4 flex flex-col gap-2">
          {navLinks.map(l => (
            <button key={l} onClick={() => { setActivePage(l); setMobileOpen(false); }}
              className="text-left px-3 py-2 rounded font-semibold text-sm tracking-widest"
              style={{ color: activePage === l ? "#22c55e" : "#c8d6e5", fontFamily: "'Barlow Condensed', sans-serif" }}>
              {l.toUpperCase()}
            </button>
          ))}
          {/* Mobile portal login */}
          <button onClick={() => { onPortalLogin(); setMobileOpen(false); }}
            className="flex items-center gap-2 px-3 py-2 rounded font-bold text-sm tracking-widest mt-1"
            style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", fontFamily: "'Barlow Condensed', sans-serif" }}>
            <Icon.Lock /> PORTAL LOGIN
          </button>
        </div>
      )}
    </nav>
  );
}

// ─── FadeSection ──────────────────────────────────────────────────────────────
function FadeSection({ children, className = "", style = {} }) {
  const [ref, visible] = useInView();
  return (
    <div ref={ref} className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`} style={style}>
      {children}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ tag, title, accent, subtitle, light = false }) {
  return (
    <FadeSection className="text-center mb-12">
      <div className="flex items-center justify-center gap-3 mb-3">
        <div className="h-px w-8" style={{ background: "#22c55e" }} />
        <span className="text-xs font-bold tracking-widest" style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>{tag}</span>
        <div className="h-px w-8" style={{ background: "#22c55e" }} />
      </div>
      <h2 className="font-black text-4xl md:text-5xl" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: light ? "#0a1628" : "white", letterSpacing: "-0.01em" }}>
        {title} <span style={{ color: "#22c55e" }}>{accent}</span>
      </h2>
      {subtitle && <p className="mt-4 max-w-xl mx-auto text-base" style={{ color: light ? "#4a5568" : "#8fadc8", fontFamily: "'Barlow', sans-serif" }}>{subtitle}</p>}
    </FadeSection>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function HeroSection({ setActivePage, onPortalLogin }) {
  const [counter, setCounter] = useState({ years: 0, projects: 0, fleet: 0, staff: 0 });
  const targets = { years: 20, projects: 200, fleet: 10, staff: 15 };

  useEffect(() => {
    const timer = setTimeout(() => {
      const steps = 60;
      let step = 0;
      const t = setInterval(() => {
        step++;
        const ease = 1 - Math.pow(1 - step / steps, 3);
        setCounter({
          years: Math.floor(targets.years * ease),
          projects: Math.floor(targets.projects * ease),
          fleet: Math.floor(targets.fleet * ease),
          staff: Math.floor(targets.staff * ease),
        });
        if (step >= steps) clearInterval(t);
      }, 2000 / steps);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const stats = [
    { val: counter.years + "+", label: "Years Experience" },
    { val: counter.projects + "+", label: "Projects Completed" },
    { val: counter.fleet + "+", label: "Equipment Fleet" },
    { val: counter.staff + "+", label: "Technical Staff" },
  ];

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden" style={{ paddingTop: "64px" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #040d1a 0%, #0a1628 50%, #061020 100%)" }} />
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `linear-gradient(rgba(34,197,94,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.3) 1px, transparent 1px)`, backgroundSize: "60px 60px" }} />
      <div className="absolute right-0 top-0 bottom-0 w-1/2 hidden lg:block" style={{ background: "linear-gradient(135deg, transparent 0%, rgba(34,197,94,0.04) 50%, rgba(34,197,94,0.08) 100%)", clipPath: "polygon(20% 0, 100% 0, 100% 100%, 0% 100%)" }} />
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: "linear-gradient(to bottom, transparent, #22c55e, transparent)" }} />

      <div className="relative max-w-7xl mx-auto px-4 py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-12" style={{ background: "#22c55e" }} />
              <span className="text-xs font-bold tracking-widest" style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>
                ESTABLISHED 2001 · PORT HARCOURT, NIGERIA
              </span>
            </div>
            <h1 className="font-black leading-none mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(2.8rem, 7vw, 5.5rem)", color: "white", lineHeight: 0.95 }}>
              YOUR TRUSTED<br /><span style={{ color: "#22c55e" }}>INDUSTRIAL</span><br />PARTNER
            </h1>
            <p className="mt-5 text-base leading-relaxed max-w-md" style={{ color: "#8fadc8", fontFamily: "'Barlow', sans-serif" }}>
              Generator & forklift rental, equipment maintenance, and industrial technical services — engineered for reliability since 2001.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <button onClick={() => setActivePage("Quote")}
                className="px-6 py-3 font-bold text-sm tracking-widest rounded transition-all hover:opacity-80"
                style={{ background: "#22c55e", color: "#0a1628", border: "2px solid #22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>
                REQUEST EQUIPMENT
              </button>
              <button onClick={() => setActivePage("Quote")}
                className="px-6 py-3 font-bold text-sm tracking-widest rounded transition-all hover:opacity-80"
                style={{ background: "transparent", color: "#22c55e", border: "2px solid #22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>
                GET A QUOTE
              </button>
              {/* Portal login from hero */}
              <button onClick={onPortalLogin}
                className="flex items-center gap-2 px-6 py-3 font-bold text-sm tracking-widest rounded transition-all hover:opacity-80"
                style={{ background: "transparent", color: "#8fadc8", border: "2px solid rgba(143,173,200,0.4)", fontFamily: "'Barlow Condensed', sans-serif" }}>
                <Icon.Lock /> CLIENT PORTAL
              </button>
            </div>
            <div className="flex flex-wrap gap-4 mt-8">
              {["Reliable Equipment", "Expert Support", "Fast Response", "Safety First"].map(t => (
                <span key={t} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#22c55e", fontFamily: "'Barlow', sans-serif" }}>
                  <Icon.Check /> <span style={{ color: "#8fadc8" }}>{t}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="hidden lg:grid grid-cols-2 gap-4">
            {stats.map(s => (
              <div key={s.label} className="rounded-lg p-6 text-center transition-transform duration-300 hover:-translate-y-1"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(34,197,94,0.2)", backdropFilter: "blur(8px)" }}>
                <div className="text-5xl font-black mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#22c55e" }}>{s.val}</div>
                <div className="text-xs tracking-widest font-semibold uppercase" style={{ color: "#8fadc8", fontFamily: "'Barlow Condensed', sans-serif" }}>{s.label}</div>
              </div>
            ))}
            <div className="col-span-2 grid grid-cols-4 gap-2 mt-2">
              {[{ icon: <Icon.Shield />, label: "Industrial Grade" }, { icon: <Icon.Users />, label: "Expert Team" }, { icon: <Icon.Clock />, label: "24/7 Support" }, { icon: <Icon.Gear />, label: "Maintenance" }].map(({ icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2 py-3 px-2 rounded"
                  style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <span style={{ color: "#22c55e" }}>{icon}</span>
                  <span className="text-center leading-tight" style={{ color: "#8fadc8", fontSize: "0.6rem", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em" }}>{label.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: "linear-gradient(90deg, transparent, #22c55e, transparent)" }} />
    </section>
  );
}

// ─── About ────────────────────────────────────────────────────────────────────
function AboutSection() {
  return (
    <section className="py-24" style={{ background: "#f8fafc" }}>
      <div className="max-w-7xl mx-auto px-4">
        <SectionHeader tag="WHO WE ARE" title="ABOUT" accent="BILM TECHNICAL" subtitle="Founded in Port Harcourt, Nigeria, we are a premier industrial services company delivering generator, forklift, and heavy equipment solutions since 2001." light />
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <FadeSection>
            <div className="rounded-xl overflow-hidden shadow-2xl" style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d1f3a 100%)", padding: "2px" }}>
              <div className="rounded-xl p-8" style={{ background: "#0a1628" }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid #22c55e" }}>
                    <span style={{ color: "#22c55e" }}><Icon.Bolt /></span>
                  </div>
                  <div>
                    <div className="font-black text-xl" style={{ color: "white", fontFamily: "'Barlow Condensed', sans-serif" }}>BILM TECHNICAL SERVICES</div>
                    <div className="text-xs" style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em" }}>POWERING OPERATIONS. DELIVERING RELIABILITY.</div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed mb-4" style={{ color: "#8fadc8" }}>
                  Established on September 11, 2001, Bilm Technical Services has experienced steady and consistent growth to become a trusted name in industrial equipment rental and technical services across Nigeria.
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "#8fadc8" }}>
                  Our staff are constantly trained and retrained to meet the highest standards of quality service delivery, ensuring your operations run smoothly and efficiently at all times.
                </p>
                <div className="mt-6 pt-6 grid grid-cols-2 gap-4" style={{ borderTop: "1px solid rgba(34,197,94,0.15)" }}>
                  {[["Ref No", "BTS/IL/0069"], ["HQ", "Trans Amadi, PH"], ["State", "Rivers State"], ["Country", "Nigeria"]].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-xs tracking-widest mb-1" style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>{k.toUpperCase()}</div>
                      <div className="text-sm font-semibold" style={{ color: "white", fontFamily: "'Barlow', sans-serif" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeSection>
          <FadeSection>
            <div className="space-y-4">
              {[
                { title: "Generator Rental & Sales", desc: "Diesel engine driven generators from 20KVA to 2000KVA for all industrial applications.", icon: <Icon.Bolt /> },
                { title: "Forklift & Construction Equipment", desc: "Reliable forklift solutions and construction equipment rental for heavy-duty operations.", icon: <Icon.Truck /> },
                { title: "Equipment Maintenance", desc: "Preventive and corrective maintenance by skilled technicians to keep equipment at peak.", icon: <Icon.Wrench /> },
                { title: "Caterpillar & Perkins Spare Parts", desc: "Genuine and quality spare parts for generators, forklifts and heavy equipment.", icon: <Icon.Package /> },
              ].map(({ title, desc, icon }) => (
                <div key={title} className="flex gap-4 p-4 rounded-lg transition-all duration-200 hover:shadow-md" style={{ background: "white", border: "1px solid #e2e8f0" }}>
                  <div className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center mt-0.5" style={{ background: "#0a1628" }}>
                    <span style={{ color: "#22c55e" }}>{icon}</span>
                  </div>
                  <div>
                    <div className="font-bold text-sm mb-1" style={{ color: "#0a1628", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.05em" }}>{title.toUpperCase()}</div>
                    <div className="text-xs leading-relaxed" style={{ color: "#64748b" }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </FadeSection>
        </div>
      </div>
    </section>
  );
}

// ─── Services ─────────────────────────────────────────────────────────────────
const services = [
  { title: "Generator Rental", desc: "Wide range of generators from 20KVA to 2000KVA for all industrial needs. Diesel engine driven with full maintenance support.", icon: <Icon.Bolt />, badge: "Most Popular", image: "/equipment/generator.jpg" },
  { title: "Forklift Rental", desc: "Reliable forklift solutions for material handling, loading and unloading operations at industrial sites.", icon: <Icon.Truck />, image: "/equipment/forklift.jpg" },
  { title: "Construction Equipment", desc: "Excavators, wheel loaders, breakers and more for your heavy-duty construction and industrial projects.", icon: <Icon.HardHat />, image: "/equipment/excavator.jpg" },
  { title: "Equipment Maintenance", desc: "Preventive and corrective maintenance by certified technicians to keep your equipment running at peak performance.", icon: <Icon.Wrench />, image: "/equipment/maintenance.jpg" },
  { title: "Spare Parts Supply", desc: "Genuine Caterpillar and Perkins engine spare parts for generators, forklifts and heavy equipment.", icon: <Icon.Package />, image: "/equipment/parts.jpg" },
  { title: "Industrial Technical Services", desc: "Expert technical support, installation, troubleshooting and project-based industrial services.", icon: <Icon.Gear />, image: "/equipment/technical.jpg" },
];

function ServicesSection({ setActivePage }) {
  return (
    <section className="py-24" style={{ background: "#0a1628" }}>
      <div className="max-w-7xl mx-auto px-4">
        <SectionHeader tag="WHAT WE DO" title="OUR" accent="SERVICES" subtitle="Comprehensive industrial equipment and technical solutions tailored for demanding operational environments." />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((s, i) => (
            <FadeSection key={s.title} style={{ transitionDelay: `${i * 80}ms` }}>
              <div className="group h-full rounded-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl relative overflow-hidden"
                style={{ border: "1px solid rgba(34,197,94,0.12)", minHeight: 280 }}>

                <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
                  style={{
                    backgroundImage: `url(${s.image})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundColor: "#0d1f3a",
                  }} />

                <div className="absolute inset-0 transition-all duration-300"
                  style={{ background: "linear-gradient(180deg, rgba(10,22,40,0.55) 0%, rgba(10,22,40,0.88) 75%)" }} />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: "rgba(34,197,94,0.12)" }} />

                <div className="relative p-6 h-full flex flex-col">
                  {s.badge && (
                    <div className="absolute top-0 right-0 text-xs font-bold px-2 py-0.5 rounded"
                      style={{ background: "#22c55e", color: "#0a1628", fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {s.badge}
                    </div>
                  )}
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-all group-hover:scale-110"
                    style={{ background: "rgba(34,197,94,0.18)", border: "1px solid rgba(34,197,94,0.4)", backdropFilter: "blur(4px)" }}>
                    <span style={{ color: "#22c55e" }}>{s.icon}</span>
                  </div>
                  <h3 className="font-black text-lg mb-2" style={{ color: "white", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
                    {s.title.toUpperCase()}
                  </h3>
                  <p className="text-sm leading-relaxed mb-4 flex-1" style={{ color: "#c8d8ea", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>{s.desc}</p>
                  <button onClick={() => setActivePage("Quote")} className="flex items-center gap-2 text-xs font-bold tracking-wider transition-colors hover:gap-3"
                    style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    REQUEST SERVICE <Icon.Arrow />
                  </button>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-0.5 transition-all duration-300 group-hover:opacity-100 opacity-0"
                  style={{ background: "linear-gradient(90deg, transparent, #22c55e, transparent)" }} />
              </div>
            </FadeSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Equipment ────────────────────────────────────────────────────────────────
// NOTE: equipment is fetched live from GET /api/equipment/ (public, no auth) —
// the same endpoint the admin dashboard's Equipment panel writes to. Adding or
// editing equipment there reflects here automatically, no code changes needed.

function EquipmentSection({ setActivePage }) {
  const { data, loading, error } = useApi("/equipment/?size=100");
  const equipment = (data || []).map(e => ({
    name:  e.name,
    cat:   (e.category || "").toUpperCase(),
    specs: e.specs && e.specs.length ? e.specs : [e.make, e.model, e.capacity].filter(Boolean),
    avail: e.is_available,
    image: e.image_url || null,
  }));

  const [filter, setFilter] = useState("ALL");
  const cats = ["ALL", ...Array.from(new Set(equipment.map(e => e.cat))).sort()];
  const filtered = filter === "ALL" ? equipment : equipment.filter(e => e.cat === filter);

  return (
    <section className="py-24" style={{ background: "#f8fafc" }}>
      <div className="max-w-7xl mx-auto px-4">
        <SectionHeader tag="EQUIPMENT FLEET" title="OUR" accent="EQUIPMENT" subtitle="Industrial-grade equipment maintained to manufacturer specifications, ready for immediate deployment." light />

        {loading && <div className="flex justify-center py-16"><Spinner /></div>}

        {error && !loading && (
          <div className="text-center py-16 text-sm" style={{ color: "#94a3b8" }}>
            Unable to load equipment right now. Please try again shortly.
          </div>
        )}

        {!loading && !error && equipment.length === 0 && (
          <div className="text-center py-16 text-sm" style={{ color: "#94a3b8" }}>
            Equipment listings are being updated. Please contact us directly for current availability.
          </div>
        )}

        {!loading && !error && equipment.length > 0 && (
          <>
            <FadeSection className="flex flex-wrap justify-center gap-2 mb-10">
              {cats.map(c => (
                <button key={c} onClick={() => setFilter(c)}
                  className="px-5 py-2 text-xs font-bold tracking-widest rounded transition-all duration-200"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", background: filter === c ? "#0a1628" : "white", color: filter === c ? "#22c55e" : "#64748b", border: `1px solid ${filter === c ? "#0a1628" : "#e2e8f0"}` }}>
                  {c}
                </button>
              ))}
            </FadeSection>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((eq, i) => (
                <FadeSection key={`${eq.name}-${i}`} style={{ transitionDelay: `${i * 60}ms` }}>
                  <div className="rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                    style={{ background: "white", border: "1px solid #e2e8f0" }}>
                    <div className="h-44 relative flex items-center justify-center overflow-hidden"
                      style={eq.image ? {} : { background: "linear-gradient(135deg, #0a1628 0%, #0d1f3a 100%)" }}>
                      {eq.image ? (
                        <>
                          <img src={eq.image} alt={eq.name} className="absolute inset-0 w-full h-full object-cover"
                            onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
                          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,22,40,0.15) 0%, rgba(10,22,40,0.65) 100%)" }} />
                          <div className="relative text-center">
                            <div className="text-xs font-bold tracking-widest" style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>{eq.cat}</div>
                          </div>
                        </>
                      ) : null}
                      <div className="text-center" style={{ display: eq.image ? "none" : "block" }}>
                        <div className="w-16 h-16 mx-auto mb-2 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.12)", border: "2px solid rgba(34,197,94,0.3)" }}>
                          <span style={{ color: "#22c55e", transform: "scale(1.8)", display: "block" }}>
                            {eq.cat === "GENERATOR" ? <Icon.Bolt /> : eq.cat === "FORKLIFT" ? <Icon.Truck /> : eq.cat === "PARTS" ? <Icon.Package /> : <Icon.HardHat />}
                          </span>
                        </div>
                        <div className="text-xs font-bold tracking-widest" style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>{eq.cat}</div>
                      </div>
                      <div className="absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded"
                        style={{ background: eq.avail ? "#22c55e" : "#ef4444", color: "white", fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {eq.avail ? "AVAILABLE" : "IN USE"}
                      </div>
                    </div>
                    <div className="p-5">
                      <h3 className="font-black text-lg mb-3" style={{ color: "#0a1628", fontFamily: "'Barlow Condensed', sans-serif" }}>{eq.name.toUpperCase()}</h3>
                      <div className="grid grid-cols-2 gap-1.5 mb-4">
                        {eq.specs.map(sp => (
                          <div key={sp} className="flex items-center gap-1.5 text-xs" style={{ color: "#64748b" }}>
                            <span style={{ color: "#22c55e", flexShrink: 0 }}><Icon.Check /></span> {sp}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setActivePage("Quote")} className="w-full py-2.5 text-xs font-bold tracking-widest rounded transition-all hover:opacity-90"
                        style={{ background: "#0a1628", color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>
                        REQUEST RENTAL
                      </button>
                    </div>
                  </div>
                </FadeSection>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ─── Why Choose Us ────────────────────────────────────────────────────────────
function WhyChooseUs() {
  const reasons = [
    { icon: <Icon.Shield />, title: "20+ Years Experience", desc: "Two decades of industrial excellence delivering reliable solutions to Nigeria's most demanding operations." },
    { icon: <Icon.Clock />, title: "24/7 Rapid Response", desc: "Round-the-clock technical support with fast deployment times to minimize your operational downtime." },
    { icon: <Icon.Gear />, title: "Industrial-Grade Fleet", desc: "Modern, well-maintained Caterpillar and Perkins equipment serviced to manufacturer specifications." },
    { icon: <Icon.Users />, title: "Certified Technical Team", desc: "Constantly trained technicians meeting the highest standards of quality service delivery." },
    { icon: <Icon.Bolt />, title: "Cost-Effective Solutions", desc: "Competitive rental and service rates without compromising on quality, safety, or reliability." },
    { icon: <Icon.ChartBar />, title: "Proven Track Record", desc: "500+ completed projects across Rivers State and beyond — a trusted name in industrial services." },
  ];
  return (
    <section className="py-24" style={{ background: "#0a1628" }}>
      <div className="max-w-7xl mx-auto px-4">
        <SectionHeader tag="WHY US" title="WHY CHOOSE" accent="BILM TECHNICAL" subtitle="The qualities that set us apart in Nigeria's competitive industrial services market." />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {reasons.map((r, i) => (
            <FadeSection key={r.title} style={{ transitionDelay: `${i * 70}ms` }}>
              <div className="group p-6 rounded-xl transition-all duration-300"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
                    <span style={{ color: "#22c55e" }}>{r.icon}</span>
                  </div>
                  <div>
                    <h4 className="font-black text-sm mb-2" style={{ color: "white", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.05em" }}>{r.title.toUpperCase()}</h4>
                    <p className="text-xs leading-relaxed" style={{ color: "#8fadc8" }}>{r.desc}</p>
                  </div>
                </div>
              </div>
            </FadeSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA Banner ───────────────────────────────────────────────────────────────
function CTABanner({ setActivePage }) {
  return (
    <section className="py-16 relative overflow-hidden" style={{ background: "#22c55e" }}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.4) 1px, transparent 1px)`, backgroundSize: "40px 40px" }} />
      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <FadeSection>
          <div className="text-xs font-bold tracking-widest mb-3" style={{ color: "#0a1628", fontFamily: "'Barlow Condensed', sans-serif", opacity: 0.7 }}>NEED EQUIPMENT OR SERVICE?</div>
          <h2 className="font-black text-4xl md:text-5xl mb-4" style={{ color: "#0a1628", fontFamily: "'Barlow Condensed', sans-serif" }}>REQUEST A QUOTE TODAY!</h2>
          <p className="mb-7 text-base" style={{ color: "#0a1628", opacity: 0.8, fontFamily: "'Barlow', sans-serif" }}>Quick response · Competitive rates · Reliable solutions</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => setActivePage("Quote")} className="px-8 py-3 font-black text-sm tracking-widest rounded transition-all hover:opacity-90"
              style={{ background: "#0a1628", color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>
              REQUEST A QUOTE
            </button>
            <button onClick={() => setActivePage("Contact")} className="px-8 py-3 font-black text-sm tracking-widest rounded transition-all hover:opacity-90"
              style={{ background: "transparent", color: "#0a1628", border: "2px solid #0a1628", fontFamily: "'Barlow Condensed', sans-serif" }}>
              CONTACT US
            </button>
          </div>
        </FadeSection>
      </div>
    </section>
  );
}

// ─── Quote Section ────────────────────────────────────────────────────────────
function QuoteSection() {
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", service: "", equipment: "", duration: "", description: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // FIX: was a fake setTimeout mock — now calls the real API.
  // Field names are mapped to match the backend LeadCreate schema:
  //   name       → contact_person
  //   company    → company_name   (required by backend)
  //   service    → service_type
  //   equipment  → equipment_type
  //   duration   → rental_duration
  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.service) return;
    if (!form.company) { setError("Please enter your company name."); return; }
    setError("");
    setLoading(true);
    try {
      await apiFetch("/leads/", {
        method: "POST",
        body: JSON.stringify({
          contact_person:  form.name,
          company_name:    form.company,
          email:           form.email,
          phone:           form.phone,
          service_type:    form.service,
          equipment_type:  form.equipment,
          rental_duration: form.duration,
          description:     form.description,
          source:          "website",
        }),
      });
      setSubmitted(true);
    } catch (e) {
      setError(e.message || "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(34,197,94,0.2)", color: "white", borderRadius: "0.5rem", padding: "0.75rem 1rem", width: "100%", fontSize: "0.875rem", fontFamily: "'Barlow', sans-serif", outline: "none" };
  const labelStyle = { color: "#8fadc8", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", fontFamily: "'Barlow Condensed', sans-serif", display: "block", marginBottom: "0.4rem" };

  if (submitted) return (
    <section className="py-24 flex items-center justify-center" style={{ background: "#0a1628", minHeight: "60vh" }}>
      <FadeSection className="text-center max-w-md mx-auto px-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(34,197,94,0.15)", border: "2px solid #22c55e" }}>
          <span style={{ color: "#22c55e", transform: "scale(2)", display: "block" }}><Icon.Check /></span>
        </div>
        <h3 className="font-black text-3xl mb-3" style={{ color: "white", fontFamily: "'Barlow Condensed', sans-serif" }}>QUOTE REQUEST RECEIVED</h3>
        <p className="text-sm leading-relaxed mb-6" style={{ color: "#8fadc8" }}>Thank you! Your request has been submitted. You'll receive an automated confirmation shortly, followed by our team's response within 24 hours.</p>
        <button onClick={() => { setSubmitted(false); setError(""); setForm({ name:"", company:"", email:"", phone:"", service:"", equipment:"", duration:"", description:"" }); }}
          className="px-6 py-2 text-sm font-bold tracking-widest rounded"
          style={{ background: "#22c55e", color: "#0a1628", fontFamily: "'Barlow Condensed', sans-serif" }}>
          SUBMIT ANOTHER REQUEST
        </button>
      </FadeSection>
    </section>
  );

  return (
    <section className="py-24" style={{ background: "#0a1628" }}>
      <div className="max-w-3xl mx-auto px-4">
        <SectionHeader tag="GET STARTED" title="REQUEST" accent="A QUOTE" subtitle="Fill out the form below and our team will respond within 24 hours with a competitive proposal." />
        <FadeSection>
          <div className="rounded-xl p-8" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(34,197,94,0.15)" }}>
            <div className="grid md:grid-cols-2 gap-5">
              {[{ key: "name", label: "FULL NAME *", type: "text", placeholder: "Your full name" }, { key: "company", label: "COMPANY NAME", type: "text", placeholder: "Your company" }, { key: "email", label: "EMAIL ADDRESS *", type: "email", placeholder: "email@company.com" }, { key: "phone", label: "PHONE NUMBER", type: "tel", placeholder: "+234 xxx xxx xxxx" }].map(f => (
                <div key={f.key}>
                  <label style={labelStyle}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={labelStyle}>SERVICE TYPE *</label>
                <select value={form.service} onChange={e => setForm(v => ({ ...v, service: e.target.value }))} style={inputStyle}>
                  <option value="" style={{ background: "#0a1628" }}>Select service...</option>
                  {["Generator Rental", "Forklift Rental", "Construction Equipment", "Equipment Maintenance", "Spare Parts", "Technical Services"].map(s => (
                    <option key={s} value={s} style={{ background: "#0a1628" }}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>EQUIPMENT / CAPACITY</label>
                <input type="text" placeholder="e.g. 200KVA Generator" value={form.equipment} onChange={e => setForm(v => ({ ...v, equipment: e.target.value }))} style={inputStyle} />
              </div>
              <div className="md:col-span-2">
                <label style={labelStyle}>RENTAL DURATION / TIMELINE</label>
                <input type="text" placeholder="e.g. 3 months, ongoing, 1 week..." value={form.duration} onChange={e => setForm(v => ({ ...v, duration: e.target.value }))} style={inputStyle} />
              </div>
              <div className="md:col-span-2">
                <label style={labelStyle}>PROJECT DESCRIPTION</label>
                <textarea rows={4} placeholder="Describe your project, requirements, and any specific needs..." value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>
            {error && (
              <div className="mt-4 px-4 py-3 rounded-lg text-sm font-semibold"
                style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
                ⚠ {error}
              </div>
            )}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 items-center">
              <button onClick={handleSubmit} disabled={loading}
                className="flex items-center gap-2 px-8 py-3 font-black text-sm tracking-widest rounded transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: "#22c55e", color: "#0a1628", fontFamily: "'Barlow Condensed', sans-serif" }}>
                {loading ? "SUBMITTING..." : (<>SUBMIT QUOTE REQUEST <Icon.Arrow /></>)}
              </button>
              <p className="text-xs" style={{ color: "#8fadc8" }}>* Required fields. Response within 24 hours.</p>
            </div>
          </div>
        </FadeSection>
      </div>
    </section>
  );
}

// ─── Contact Section ──────────────────────────────────────────────────────────
function ContactSection() {
  return (
    <section className="py-24" style={{ background: "#f8fafc" }}>
      <div className="max-w-7xl mx-auto px-4">
        <SectionHeader tag="REACH US" title="CONTACT" accent="US" subtitle="Our team is ready to assist you with equipment rental, maintenance, and technical services." light />
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: <Icon.Phone />, title: "CALL US", lines: ["08037815188", "+234 803 781 5188"] },
            { icon: <Icon.Mail />, title: "EMAIL US", lines: ["admin@bilmtechnical.com", "info@bilmtechnical.com"] },
            { icon: <Icon.MapPin />, title: "VISIT US", lines: ["23 Chief Nwuke Street", "Trans Amadi Industrial Layout", "Port Harcourt, Rivers State"] },
          ].map(c => (
            <FadeSection key={c.title}>
              <div className="rounded-xl p-7 text-center hover:shadow-xl transition-all" style={{ background: "#0a1628", border: "1px solid rgba(34,197,94,0.15)" }}>
                <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.4)" }}>
                  <span style={{ color: "#22c55e" }}>{c.icon}</span>
                </div>
                <div className="font-black text-sm mb-3 tracking-widest" style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>{c.title}</div>
                {c.lines.map((l, i) => <div key={i} className="text-sm mb-1" style={{ color: "#c8d6e5", fontFamily: "'Barlow', sans-serif" }}>{l}</div>)}
              </div>
            </FadeSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Site Footer ──────────────────────────────────────────────────────────────
function SiteFooter({ setActivePage, onPortalLogin }) {
  return (
    <footer style={{ background: "#040d1a", borderTop: "1px solid rgba(34,197,94,0.15)" }}>
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <SiteLogo />
            <p className="mt-4 text-sm leading-relaxed max-w-sm" style={{ color: "#8fadc8", fontFamily: "'Barlow', sans-serif" }}>
              Premier industrial equipment rental and technical services company. Powering operations and delivering reliability since 2001.
            </p>
            <div className="mt-4 text-xs" style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em" }}>
              POWERING INDUSTRY. BUILDING TOMORROW.
            </div>
          </div>
          <div>
            <div className="text-xs font-bold tracking-widest mb-4" style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>NAVIGATION</div>
            {["Home", "About", "Services", "Equipment", "Quote", "Contact"].map(l => (
              <button key={l} onClick={() => setActivePage(l)} className="block text-sm mb-2 hover:text-white transition-colors" style={{ color: "#8fadc8", fontFamily: "'Barlow', sans-serif" }}>{l}</button>
            ))}
            <button onClick={onPortalLogin} className="flex items-center gap-1.5 text-sm mt-3 hover:text-white transition-colors" style={{ color: "#22c55e", fontFamily: "'Barlow', sans-serif" }}>
              <Icon.Lock /> Staff / Client Portal
            </button>
          </div>
          <div>
            <div className="text-xs font-bold tracking-widest mb-4" style={{ color: "#22c55e", fontFamily: "'Barlow Condensed', sans-serif" }}>CONTACT INFO</div>
            <div className="space-y-2 text-sm" style={{ color: "#8fadc8", fontFamily: "'Barlow', sans-serif" }}>
              <div>08037815188</div>
              <div>admin@bilmtechnical.com</div>
              <div>Trans Amadi Industrial Layout</div>
              <div>Port Harcourt, Rivers State</div>
              <div>Nigeria</div>
            </div>
          </div>
        </div>
        <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="text-xs" style={{ color: "#4a5568", fontFamily: "'Barlow', sans-serif" }}>
            © 2026 Bilm Technical Services. All rights reserved. Ref: BTS/IL/0069
          </div>
          <div className="text-xs" style={{ color: "#4a5568", fontFamily: "'Barlow', sans-serif" }}>
            Port Harcourt, Nigeria
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Landing page content router ──────────────────────────────────────────────
function LandingPageContent({ activePage, setActivePage, onPortalLogin }) {
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [activePage]);
  return (
    <main>
      {activePage === "Home" && (
        <>
          <HeroSection setActivePage={setActivePage} onPortalLogin={onPortalLogin} />
          <AboutSection />
          <ServicesSection setActivePage={setActivePage} />
          <EquipmentSection setActivePage={setActivePage} />
          <WhyChooseUs />
          <CTABanner setActivePage={setActivePage} />
          <ContactSection />
        </>
      )}
      {activePage === "About" && <><div style={{ paddingTop: "64px" }} /><AboutSection /></>}
      {activePage === "Services" && <><div style={{ paddingTop: "64px" }} /><ServicesSection setActivePage={setActivePage} /></>}
      {activePage === "Equipment" && <><div style={{ paddingTop: "64px" }} /><EquipmentSection setActivePage={setActivePage} /></>}
      {activePage === "Quote" && <><div style={{ paddingTop: "64px" }} /><QuoteSection /></>}
      {activePage === "Contact" && <><div style={{ paddingTop: "64px" }} /><ContactSection /><CTABanner setActivePage={setActivePage} /></>}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── LIVE CHAT — VISITOR WIDGET ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Real WebSocket chat widget for public website visitors.
 * Connects to ws://.../api/chat/ws/visitor/{visitor_id}
 *
 * visitor_id is a random ID generated once and persisted in localStorage,
 * so refreshing the page reconnects to the SAME chat thread instead of
 * starting a new one each time.
 */
function getOrCreateVisitorId() {
  let id = localStorage.getItem("bilm_visitor_id");
  if (!id) {
    id = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("bilm_visitor_id", id);
  }
  return id;
}

function VisitorChatWidget() {
  const [open, setOpen]         = useState(false);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [name, setName]         = useState(localStorage.getItem("bilm_visitor_name") || "");
  const [nameSet, setNameSet]   = useState(!!localStorage.getItem("bilm_visitor_name"));
  const wsRef       = useRef(null);
  const visitorId   = useRef(getOrCreateVisitorId());
  const scrollRef   = useRef(null);

  useEffect(() => {
    if (!open) return; // only connect once the widget is opened — no need to hold a socket open for every site visitor
    const ws = new WebSocket(`${WS_URL}/chat/ws/visitor/${visitorId.current}`);
    ws.onopen  = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.type === "history") { setMessages(data.messages); return; }
      if (data.type === "message") { setMessages(prev => [...prev, data]); }
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ text: input.trim(), sender: name || "Visitor" }));
    setInput("");
  };

  const saveName = () => {
    if (!name.trim()) return;
    localStorage.setItem("bilm_visitor_name", name.trim());
    setNameSet(true);
  };

  return (
    <>
      {/* Floating toggle button + label — label only shows when the widget is closed,
          so it doesn't clutter the open chat panel which already has its own header */}
      {!open && (
        <div className="fixed bottom-6 right-24 z-50 px-3 py-2 rounded-lg shadow-lg text-xs font-black hidden sm:block"
          style={{ background: "#0d1b2e", color: "white", border: `1px solid ${G.green}30`, fontFamily: "Barlow Condensed,sans-serif" }}>
          Chat with Us
        </div>
      )}
      <button onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-110"
        style={{ background: G.green, color: "#060e1c" }}>
        {open ? <Ico.X /> : <Ico.Chat />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ background: "#0d1b2e", border: `1px solid ${G.green}30`, maxHeight: 480 }}>

          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#0a1628", borderBottom: `1px solid ${G.border}` }}>
            <div>
              <div className="text-sm font-black" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>Chat with us</div>
              <div className="text-xs flex items-center gap-1.5" style={{ color: connected ? G.green : G.muted }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: connected ? G.green : G.muted }} />
                {connected ? "Online" : "Connecting..."}
              </div>
            </div>
          </div>

          {!nameSet ? (
            // First-time visitor: ask for a name before starting chat
            <div className="p-4 flex-1 flex flex-col gap-3">
              <div className="text-xs" style={{ color: G.muted }}>What's your name? So our team knows who they're talking to.</div>
              <input value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveName()}
                placeholder="Your name" autoFocus
                className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, color: "white", outline: "none" }} />
              <button onClick={saveName} className="py-2 rounded-lg text-xs font-black"
                style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
                START CHAT
              </button>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 260 }}>
                {messages.length === 0 && (
                  <div className="text-center text-xs py-8" style={{ color: G.muted }}>
                    👋 Send a message and our team will respond as soon as possible.
                  </div>
                )}
                {messages.map((m, i) => {
                  const isMine = m.from === "visitor" || m.from === "visitor_echo";
                  return (
                    <div key={i} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[75%] px-3 py-2 rounded-xl text-xs"
                        style={{ background: isMine ? G.green : "rgba(255,255,255,0.08)", color: isMine ? "#060e1c" : "white" }}>
                        {!isMine && <div className="font-bold mb-0.5" style={{ fontSize: "0.65rem", color: G.green }}>{m.sender}</div>}
                        {m.text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input */}
              <div className="p-3 flex gap-2" style={{ borderTop: `1px solid ${G.border}` }}>
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && send()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, color: "white", outline: "none" }} />
                <button onClick={send} className="px-3 py-2 rounded-lg" style={{ background: G.green, color: "#060e1c" }}>
                  <Ico.Send />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

// ─── Full Landing Page wrapper ────────────────────────────────────────────────
function LandingPage({ onPortalLogin }) {
  const [activePage, setActivePage] = useState("Home");
  return (
    <>
      <SiteNavbar activePage={activePage} setActivePage={setActivePage} onPortalLogin={onPortalLogin} />
      <LandingPageContent activePage={activePage} setActivePage={setActivePage} onPortalLogin={onPortalLogin} />
      <SiteFooter setActivePage={setActivePage} onPortalLogin={onPortalLogin} />
      <VisitorChatWidget />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PORTAL: LOGIN PAGE ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function LoginPage({ onBackToSite }) {
  const { requestOtp, verifyOtp } = useAuth();

  // step: "password" -> "otp". Starts on password, advances to otp once
  // requestOtp() succeeds (i.e. password was correct and a code was emailed).
  const [step, setStep] = useState("password");
  const [form, setForm] = useState({ email: "", password: "" });
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState(""); // "A verification code was sent to ..."
  const [loading, setLoading] = useState(false);

  const submitPassword = async () => {
    if (!form.email || !form.password) return setErr("Please fill in both fields");
    setErr(""); setLoading(true);
    try {
      const res = await requestOtp(form.email, form.password);
      setInfo(res.message || `A verification code was sent to ${form.email}.`);
      setStep("otp");
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const submitCode = async () => {
    if (!code || code.length !== 6) return setErr("Enter the 6-digit code from your email");
    setErr(""); setLoading(true);
    try { await verifyOtp(form.email, code); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const backToPassword = () => {
    setStep("password"); setCode(""); setErr(""); setInfo("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: `radial-gradient(ellipse at 50% 0%, rgba(34,197,94,0.08) 0%, #060e1c 60%)` }}>
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "linear-gradient(rgba(34,197,94,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(34,197,94,0.5) 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

      <button onClick={onBackToSite}
        className="absolute top-5 left-5 flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all hover:opacity-80"
        style={{ background: "rgba(34,197,94,0.08)", color: G.green, border: `1px solid ${G.green}30`, fontFamily: "Barlow Condensed,sans-serif", letterSpacing: "0.08em" }}>
        ← BACK TO WEBSITE
      </button>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{ background: "rgba(34,197,94,0.08)", border: "2px solid rgba(34,197,94,0.3)" }}>
            <img src={LOGO} alt="Bilm" style={{ height: 48, width: "auto", objectFit: "contain", display: "block" }} onError={e => { e.target.style.display = "none"; }} />
          </div>
          <div className="font-black text-2xl tracking-widest" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>BILM TECHNICAL</div>
          <div className="text-xs tracking-widest mt-1 font-semibold" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>ADMIN & CLIENT PORTAL</div>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(13,27,46,0.95)", border: "1px solid rgba(34,197,94,0.2)", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
          <div className="h-1" style={{ background: "linear-gradient(90deg,transparent,#22c55e,transparent)" }} />
          <div className="p-8">

            {step === "password" ? (
              <>
                <div className="font-black text-lg tracking-widest mb-6" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>SIGN IN</div>
                {err && (
                  <div className="mb-4 px-3 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(239,68,68,0.1)", color: G.red, border: "1px solid rgba(239,68,68,0.2)" }}>{err}</div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold tracking-widest mb-2" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>EMAIL ADDRESS</label>
                    <input type="email" value={form.email} placeholder="admin@bilmtechnical.com"
                      onChange={e => setForm(v => ({ ...v, email: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && submitPassword()}
                      style={{ ...INP, border: err ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(34,197,94,0.2)" }} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold tracking-widest mb-2" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>PASSWORD</label>
                    <input type="password" value={form.password} placeholder="••••••••"
                      onChange={e => setForm(v => ({ ...v, password: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && submitPassword()}
                      style={{ ...INP, border: err ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(34,197,94,0.2)" }} />
                  </div>
                  <button onClick={submitPassword} disabled={loading}
                    className="w-full py-3.5 font-black text-sm tracking-widest rounded-lg transition-all duration-200"
                    style={{ background: loading ? "rgba(34,197,94,0.5)" : "#22c55e", color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif", boxShadow: loading ? "none" : "0 4px 20px rgba(34,197,94,0.3)", cursor: loading ? "not-allowed" : "pointer" }}>
                    {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> SENDING CODE...</span> : "CONTINUE →"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="font-black text-lg tracking-widest mb-2" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>ENTER CODE</div>
                {info && (
                  <div className="mb-4 text-xs" style={{ color: G.muted, lineHeight: 1.5 }}>{info}</div>
                )}
                {err && (
                  <div className="mb-4 px-3 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(239,68,68,0.1)", color: G.red, border: "1px solid rgba(239,68,68,0.2)" }}>{err}</div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold tracking-widest mb-2" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>6-DIGIT CODE</label>
                    <input type="text" inputMode="numeric" maxLength={6} value={code}
                      placeholder="000000" autoFocus
                      onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={e => e.key === "Enter" && submitCode()}
                      style={{ ...INP, border: err ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(34,197,94,0.2)", letterSpacing: "0.4em", textAlign: "center", fontSize: "1.1rem" }} />
                  </div>
                  <button onClick={submitCode} disabled={loading}
                    className="w-full py-3.5 font-black text-sm tracking-widest rounded-lg transition-all duration-200"
                    style={{ background: loading ? "rgba(34,197,94,0.5)" : "#22c55e", color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif", boxShadow: loading ? "none" : "0 4px 20px rgba(34,197,94,0.3)", cursor: loading ? "not-allowed" : "pointer" }}>
                    {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> VERIFYING...</span> : "VERIFY & SIGN IN →"}
                  </button>
                  <button onClick={backToPassword}
                    className="w-full py-2 text-xs font-bold tracking-widest"
                    style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>
                    ← BACK / RESEND CODE
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
        <p className="text-center text-xs mt-5" style={{ color: "rgba(90,122,154,0.6)", fontFamily: "Barlow Condensed,sans-serif", letterSpacing: "0.1em" }}>
          BILM TECHNICAL SERVICES · BTS/IL/0069
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PORTAL: SIDEBAR ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function Sidebar({ active, setActive, open, setOpen, user, onBackToSite }) {
  const { logout } = useAuth();
  const isAdmin = ["admin", "staff"].includes(user?.role);
  const nav = isAdmin ? [
    { key: "overview", label: "OVERVIEW", icon: <Ico.Dash /> },
    { key: "leads", label: "LEADS", icon: <Ico.Users /> },
    { key: "quotes", label: "QUOTATIONS", icon: <Ico.Quote /> },
    { key: "rentals", label: "RENTALS", icon: <Ico.Truck /> },
    { key: "equipment", label: "EQUIPMENT", icon: <Ico.Box /> },
    { key: "livechat", label: "LIVE CHAT", icon: <Ico.Chat /> },
    { key: "maintenance", label: "MAINTENANCE", icon: <Ico.Wrench /> },
    { key: "email_logs", label: "EMAIL LOGS", icon: <Ico.Mail /> },
    { key: "templates", label: "EMAIL TEMPLATES", icon: <Ico.Mail /> },
    { key: "settings", label: "SETTINGS", icon: <Ico.Gear /> },
    { key: "reports", label: "REPORTS", icon: <Ico.Chart /> },
  ] : [
    { key: "client_dash", label: "MY DASHBOARD", icon: <Ico.Dash /> },
    { key: "client_quotes", label: "MY QUOTES", icon: <Ico.Quote /> },
    { key: "client_rent", label: "MY EQUIPMENT", icon: <Ico.Truck /> },
  ];

  return (
    <>
      {open && <div className="fixed inset-0 z-30 lg:hidden" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setOpen(false)} />}
      <aside className={`fixed lg:static z-40 inset-y-0 left-0 w-60 flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ background: G.side, borderRight: `1px solid ${G.border}` }}>
        <div className="px-5 py-5 flex items-center gap-3" style={{ borderBottom: `1px solid ${G.border}` }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "8px", padding: "4px" }}>
            <img src={LOGO} alt="Bilm" style={{ height: 28, width: "auto", objectFit: "contain", display: "block" }} onError={e => { e.target.style.display = "none"; }} />
          </div>
          <div>
            <div className="font-black text-sm tracking-wider" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>BILM TECHNICAL</div>
            <div style={{ color: G.green, fontSize: "0.5rem", fontFamily: "Barlow Condensed,sans-serif", letterSpacing: "0.15em" }}>SERVICES</div>
          </div>
        </div>
        <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${G.border}` }}>
          <div className="text-xs px-2.5 py-1 rounded-full text-center font-bold tracking-widest"
            style={{ background: `${G.green}15`, color: G.green, fontFamily: "Barlow Condensed,sans-serif", border: `1px solid ${G.green}30` }}>
            {isAdmin ? "ADMIN PORTAL" : "CLIENT PORTAL"}
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {nav.map(n => (
            <button key={n.key} onClick={() => { setActive(n.key); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150"
              style={{ background: active === n.key ? `${G.green}15` : "transparent", color: active === n.key ? G.green : G.muted, borderLeft: `3px solid ${active === n.key ? G.green : "transparent"}` }}>
              <span style={{ opacity: active === n.key ? 1 : 0.7 }}>{n.icon}</span>
              <span className="text-xs font-bold tracking-wider" style={{ fontFamily: "Barlow Condensed,sans-serif" }}>{n.label}</span>
              {active === n.key && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: G.green }} />}
            </button>
          ))}
          {/* Back to website link */}
          <button onClick={onBackToSite}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 mt-2"
            style={{ background: "transparent", color: G.muted, borderLeft: `3px solid transparent`, borderTop: `1px solid ${G.border}` }}>
            <span style={{ opacity: 0.7 }}><Ico.Dash /></span>
            <span className="text-xs font-bold tracking-wider" style={{ fontFamily: "Barlow Condensed,sans-serif" }}>← WEBSITE</span>
          </button>
        </nav>
        <div className="p-4" style={{ borderTop: `1px solid ${G.border}` }}>
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0"
              style={{ background: `${G.green}20`, color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>
              {(user?.full_name || user?.email || "U")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>
                {user?.full_name || user?.email}
              </div>
              <div style={{ color: G.green, fontSize: "0.55rem", fontFamily: "Barlow Condensed,sans-serif", letterSpacing: "0.1em" }}>
                {user?.role?.toUpperCase()}
              </div>
            </div>
            <button onClick={logout} title="Sign out" className="text-xs px-2 py-1 rounded-lg font-bold"
              style={{ background: "rgba(239,68,68,0.1)", color: G.red, fontFamily: "Barlow Condensed,sans-serif" }}>
              OUT
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
function Topbar({ title, sub, onMenu }) {
  return (
    <header className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
      style={{ background: G.side, borderBottom: `1px solid ${G.border}` }}>
      <div className="flex items-center gap-3">
        <button className="lg:hidden p-1.5 rounded-lg" onClick={onMenu} style={{ background: G.gdim, color: G.green }}>
          <Ico.Menu />
        </button>
        <div>
          <div className="font-black text-lg leading-none" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif", letterSpacing: "0.04em" }}>{title}</div>
          {sub && <div className="text-xs mt-0.5" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif", letterSpacing: "0.08em" }}>{sub}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
        style={{ background: "rgba(34,197,94,0.08)", border: `1px solid ${G.green}30` }}>
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: G.green }} />
        <span className="text-xs font-bold tracking-wider" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>LIVE</span>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PORTAL: DASHBOARD PANELS ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function Overview() {
  const { data: kpi, loading: kl, error: ke, reload } = useApi("/reports/overview");
  const { data: flu } = useApi("/reports/fleet-utilization");
  const { data: rev } = useApi("/reports/revenue?months=6");
  const { data: pipe } = useApi("/reports/leads-pipeline");
  const revChart = (rev || []).map(r => ({ l: r.period?.slice(0, 3) || "", v: Number(r.revenue) / 1e6 || 0 }));
  const pipeChart = pipe ? Object.entries(pipe).map(([k, v]) => ({ l: k.slice(0, 4).toUpperCase(), v })) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold tracking-widest" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>
          LIVE METRICS — {new Date().toLocaleDateString("en-NG", { dateStyle: "long" })}
        </div>
        <button onClick={reload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: G.gdim, color: G.green, fontFamily: "Barlow Condensed,sans-serif", border: `1px solid ${G.green}30` }}>
          <Ico.Refresh /> REFRESH
        </button>
      </div>
      {ke && <ErrBox msg={ke} />}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI label="TOTAL LEADS" value={kl ? null : kpi?.total_leads} sub={`${kpi?.hot_leads || 0} hot`} icon={<Ico.Users />} />
        <KPI label="OPEN QUOTES" value={kl ? null : kpi?.open_quotes} sub={kpi?.open_quotes_value ? `₦${(Number(kpi.open_quotes_value) / 1e6).toFixed(1)}M total` : ""} icon={<Ico.Quote />} color={G.blue} />
        <KPI label="ACTIVE RENTALS" value={kl ? null : kpi?.active_rentals} sub={kpi?.overdue_rentals ? `${kpi.overdue_rentals} overdue` : ""} icon={<Ico.Truck />} color={G.amber} />
        <KPI label="QUEUED EMAILS" value={kl ? null : kpi?.queued_emails} icon={<Ico.Mail />} color="#8b5cf6" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <SectionLabel>FLEET STATUS</SectionLabel>
          <div className="space-y-3">
            {[["Total Fleet", flu?.total, "white"], ["In Use", flu?.in_use, G.amber], ["Available", flu?.available, G.green], ["Utilization", flu ? `${flu.utilization_pct}%` : null, G.blue], ["Avg Health", flu ? `${flu.avg_health_score}%` : null, G.green]].map(([l, v, c]) => (
              <div key={l} className="flex items-center justify-between">
                <span className="text-xs" style={{ color: G.muted }}>{l}</span>
                <span className="text-sm font-black" style={{ color: c, fontFamily: "Barlow Condensed,sans-serif" }}>{v ?? <Spinner />}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card><SectionLabel>REVENUE TREND ₦M</SectionLabel>{revChart.length ? <MiniChart data={revChart} color={G.green} /> : <EmptyState msg="No revenue data yet" />}</Card>
        <Card><SectionLabel>LEADS PIPELINE</SectionLabel>{pipeChart.length ? <MiniChart data={pipeChart} color={G.blue} /> : <EmptyState msg="No leads yet" />}</Card>
      </div>
    </div>
  );
}

function Leads() {
  const [filter, setFilter] = useState("");
  const [search, setSearch]  = useState("");
  const path = `/leads/?size=50${filter ? `&status=${filter}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const { data, loading, error, reload } = useApi(path, [filter, search]);
  const leads = data?.items || [];
  const [converting, setConverting] = useState(null); // lead id being converted
  const [convertMsg, setConvertMsg] = useState({});   // { [lead_id]: "success" | "error msg" }

  // FIX: "converted" removed from this dropdown's options entirely.
  // Root cause of the bug you hit: this dropdown let admins manually set
  // status="converted" via PATCH /leads/{id}, which only flips a status
  // label — it never actually creates a Client row. Meanwhile the REAL
  // conversion button below only showed itself when status !== "converted",
  // so once someone picked "Converted" here by mistake, the real convert
  // button vanished — permanently hiding the only path that actually
  // creates the Client, with no error or warning shown anywhere.
  const updateStatus = async (id, status) => {
    await apiFetch(`/leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    reload();
  };

  /**
   * Convert a lead into a Client record — the ONLY correct way to do this.
   * Calls POST /leads/{id}/convert, which creates the Client AND sets
   * status="converted" server-side as a single atomic operation.
   * Flow: Lead → Convert → Client → Create Rental → Auto-Quote → Send
   */
  const convertToClient = async (lead) => {
    setConverting(lead.id);
    try {
      await apiFetch(`/leads/${lead.id}/convert`, { method: "POST" });
      setConvertMsg(p => ({ ...p, [lead.id]: "✅ Converted to client! Go to Rentals to create a rental." }));
      reload();
    } catch (e) {
      setConvertMsg(p => ({ ...p, [lead.id]: `❌ ${e.message}` }));
    } finally {
      setConverting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Workflow guide banner */}
      <div className="px-4 py-3 rounded-xl text-xs" style={{ background: "rgba(34,197,94,0.06)", border: `1px solid ${G.border}`, color: G.muted }}>
        <span style={{ color: G.green, fontWeight: 700 }}>WORKFLOW: </span>
        Website Form → <strong style={{ color: G.text }}>Lead</strong> →
        Click <strong style={{ color: "#60a5fa" }}>→ CLIENT</strong> to convert →
        Create <strong style={{ color: G.text }}>Rental</strong> (auto-generates Quote) →
        Review & <strong style={{ color: G.green }}>Send Quote</strong>
        <div className="mt-1" style={{ color: G.amber }}>
          ⚠ The status dropdown below is for lead temperature only (New/Warm/Hot/Cold/Lost).
          It does NOT create a client — only the <strong>→ CLIENT</strong> button does that.
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {["", "hot", "warm", "new", "cold", "converted"].map(s => (
            <button key={s} onClick={() => setFilter(s)} className="px-3 py-1.5 text-xs font-bold tracking-wider rounded-lg transition-all"
              style={{ fontFamily: "Barlow Condensed,sans-serif", background: filter === s ? G.green : "rgba(255,255,255,0.04)", color: filter === s ? "#060e1c" : G.muted, border: `1px solid ${filter === s ? G.green : G.border}` }}>
              {s || "ALL"}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company..."
          style={{ ...INP, width: 200, padding: "0.5rem 0.75rem" }} />
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <ErrBox msg={error} />}
      {!loading && !leads.length && <EmptyState msg="No leads yet — submit the website quote form to create one" />}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {leads.map(l => (
          <Card key={l.id} className="hover:-translate-y-0.5 transition-transform duration-200">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-black tracking-wider" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>{l.ref_code}</span>
              <Badge s={l.status} />
            </div>
            <div className="font-black text-base mb-1 leading-tight" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>
              {l.company_name?.toUpperCase()}
            </div>
            <div className="text-xs mb-3" style={{ color: G.muted }}>{l.contact_person || "—"} · {l.email}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-4">
              {[["Service", l.service_type], ["Equipment", l.equipment_type], ["Duration", l.rental_duration], ["Source", l.source]].map(([k, v]) =>
                v ? <div key={k}><span style={{ color: G.muted }}>{k}: </span><span style={{ color: G.text }}>{v}</span></div> : null
              )}
            </div>

            {/* Conversion feedback message */}
            {convertMsg[l.id] && (
              <div className="mb-3 px-2 py-1.5 rounded-lg text-xs"
                style={{ background: convertMsg[l.id].startsWith("✅") ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: convertMsg[l.id].startsWith("✅") ? G.green : G.red }}>
                {convertMsg[l.id]}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {/* Status dropdown — lead temperature ONLY, "converted"/"lost" excluded.
                  "lost" stays out too since it's a terminal state that should only
                  happen deliberately, not via casual dropdown browsing. */}
              <select value={["new","warm","hot","cold"].includes(l.status) ? l.status : "new"}
                onChange={e => updateStatus(l.id, e.target.value)}
                className="flex-1 text-xs font-bold rounded-lg px-2 py-1.5"
                style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, color: G.green, fontFamily: "Barlow Condensed,sans-serif", outline: "none" }}>
                {["new", "warm", "hot", "cold"].map(s =>
                  <option key={s} value={s} style={{ background: "#0d1b2e" }}>{s.toUpperCase()}</option>
                )}
              </select>

              {/* Convert to Client button — shown for ANY lead not already
                  converted/lost. Since status="converted" can legitimately
                  exist on leads from before this fix (like the ones in your
                  screenshots) without a real Client behind them, we can't
                  fully trust the status field alone here. Showing this
                  button whenever status suggests "not yet handled" is the
                  safer default — clicking it again if a Client already
                  exists is harmless (backend just returns the existing
                  client, no duplicate is created, per the 409 fix). */}
              {l.status !== "lost" && (
                <button
                  onClick={() => convertToClient(l)}
                  disabled={converting === l.id}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap"
                  style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)", fontFamily: "Barlow Condensed,sans-serif" }}
                  title="Convert this lead into a Client so you can create a Rental for them">
                  {converting === l.id ? "..." : (l.status === "converted" ? "↻ RE-SYNC CLIENT" : "→ CLIENT")}
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Quotes() {
  const [statusF, setStatusF] = useState("");
  const { data, loading, error, reload } = useApi(`/quotes/?size=30${statusF ? `&status=${statusF}` : ""}`, [statusF]);
  const quotes = data?.items || [];

  // Inline amount editor state
  const [editing, setEditing]   = useState(null); // quote id being edited
  const [editAmt, setEditAmt]   = useState("");
  const [saving, setSaving]     = useState(false);

  const sendQuote = async id => {
    try { await apiFetch(`/quotes/${id}/send`, { method: "POST" }); reload(); }
    catch (e) { alert("Send failed: " + e.message); }
  };

  const saveAmount = async (id) => {
    if (!editAmt) { setEditing(null); return; }
    setSaving(true);
    try {
      await apiFetch(`/quotes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ amount: parseFloat(editAmt) }),
      });
      reload();
      setEditing(null);
    } catch (e) { alert("Update failed: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {/* Info banner — explains where quotes come from */}
      <div className="px-4 py-3 rounded-xl text-xs flex items-start gap-2"
        style={{ background: "rgba(34,197,94,0.06)", border: `1px solid ${G.border}`, color: G.muted }}>
        <span style={{ color: G.green, fontSize: "1rem" }}>ℹ</span>
        <span>
          Quotes are <strong style={{ color: G.text }}>auto-generated</strong> when you create a Rental.
          The system calculates <strong style={{ color: G.text }}>monthly rate × duration</strong> and creates a draft quote automatically.
          Review the amount below, adjust if needed, then click <strong style={{ color: G.green }}>SEND</strong> to email the client.
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {["", "draft", "sent", "negotiating", "accepted", "expired"].map(s => (
          <button key={s} onClick={() => setStatusF(s)} className="px-3 py-1.5 text-xs font-bold rounded-lg"
            style={{ fontFamily: "Barlow Condensed,sans-serif", background: statusF === s ? G.green : "rgba(255,255,255,0.04)", color: statusF === s ? "#060e1c" : G.muted, border: `1px solid ${statusF === s ? G.green : G.border}` }}>
            {s || "ALL"}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <ErrBox msg={error} />}

      <Card style={{ padding: 0 }}>
        <div className="overflow-x-auto rounded-xl">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: `1px solid ${G.border}` }}>
                {["QUOTE #", "SERVICE", "AMOUNT", "STATUS", "VALID UNTIL", "ACTIONS"].map(h => (
                  <th key={h} className="py-3 px-4 text-left text-xs font-bold tracking-wider whitespace-nowrap"
                    style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!quotes.length && !loading && (
                <tr><td colSpan={6}>
                  <EmptyState msg="No quotes yet — create a Rental first and a draft quote will be auto-generated" />
                </td></tr>
              )}
              {quotes.map((q, i) => (
                <tr key={q.id} className="transition-colors hover:bg-white hover:bg-opacity-5"
                  style={{ borderBottom: i < quotes.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>

                  {/* Quote number */}
                  <td className="py-3 px-4 text-xs font-black whitespace-nowrap"
                    style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>
                    {q.quote_number}
                  </td>

                  {/* Service description */}
                  <td className="py-3 px-4 text-xs" style={{ color: G.text, maxWidth: 220 }}>
                    <div className="truncate">{q.service_desc || "—"}</div>
                    {q.notes && q.notes.includes("Auto-generated") && (
                      <div className="text-xs mt-0.5" style={{ color: G.muted, fontSize: "0.65rem" }}>Auto-generated</div>
                    )}
                  </td>

                  {/* Amount — editable inline for draft quotes */}
                  <td className="py-3 px-4 text-xs font-bold whitespace-nowrap" style={{ color: G.green }}>
                    {editing === q.id ? (
                      <div className="flex items-center gap-1">
                        <span style={{ color: G.muted }}>₦</span>
                        <input
                          type="number"
                          value={editAmt}
                          onChange={e => setEditAmt(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveAmount(q.id); if (e.key === "Escape") setEditing(null); }}
                          autoFocus
                          className="w-28 px-2 py-1 rounded text-xs"
                          style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${G.green}`, color: "white", outline: "none" }}
                        />
                        <button onClick={() => saveAmount(q.id)} disabled={saving}
                          className="px-2 py-1 rounded text-xs font-bold"
                          style={{ background: G.green, color: "#060e1c" }}>
                          {saving ? "..." : "✓"}
                        </button>
                        <button onClick={() => setEditing(null)} className="px-2 py-1 rounded text-xs" style={{ color: G.muted }}>✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group">
                        <span>{q.amount ? `₦${Number(q.amount).toLocaleString()}` : "TBD"}</span>
                        {q.status === "draft" && (
                          <button
                            onClick={() => { setEditing(q.id); setEditAmt(q.amount || ""); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded text-xs"
                            style={{ background: "rgba(34,197,94,0.15)", color: G.green, fontSize: "0.6rem" }}
                            title="Edit amount">
                            ✏
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-4"><Badge s={q.status} /></td>

                  <td className="py-3 px-4 text-xs whitespace-nowrap" style={{ color: G.muted }}>
                    {q.valid_until || "—"}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4">
                    {q.status === "draft" && (
                      <div className="flex gap-2">
                        <button onClick={() => sendQuote(q.id)}
                          className="px-3 py-1 text-xs font-bold rounded-lg whitespace-nowrap"
                          style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
                          ✉ SEND
                        </button>
                      </div>
                    )}
                    {q.status === "sent" && (
                      <span className="text-xs" style={{ color: G.muted }}>Awaiting response</span>
                    )}
                    {q.status === "accepted" && (
                      <span className="text-xs font-bold" style={{ color: G.green }}>✓ Accepted</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Rentals() {
  const [statusF, setStatusF] = useState("");
  const { data, loading, error, reload } = useApi(`/rentals/?size=30${statusF ? `&status=${statusF}` : ""}`, [statusF]);
  const { data: clientsData, reload: reloadClients } = useApi("/clients/?size=100");
  const { data: equipmentData } = useApi("/equipment/?size=100");
  const rentals   = data?.items || [];
  const clients   = clientsData?.items || [];
  const equipment = equipmentData || [];

  // ── Rental form state ──────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    client_id: "", equipment_id: "", start_date: "", end_date: "",
    monthly_rate: "", site_location: "", notes: "",
  });
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState("");

  // ── Inline new-client form state ───────────────────────────────────────────
  // Shown when admin wants to create a client on the spot,
  // without navigating to Leads panel first.
  const [showNewClient, setShowNewClient] = useState(false);
  const [nc, setNc] = useState({ company_name: "", contact_person: "", email: "", phone: "" });
  const [ncSaving, setNcSaving] = useState(false);
  const [ncErr, setNcErr]       = useState("");

  const INP = {
    background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`,
    color: "white", borderRadius: "0.5rem", padding: "0.6rem 0.9rem",
    width: "100%", fontSize: "0.82rem", outline: "none",
  };

  // Create a brand-new client inline, then auto-select them in the rental form.
  // If a client with this email already exists (409), don't dead-end —
  // offer to reuse that existing client instead, since this is very
  // likely a returning client (repeat rental), not actually a mistake.
  const createClientInline = async () => {
    if (!nc.company_name || !nc.email) { setNcErr("Company name and email are required."); return; }
    setNcSaving(true); setNcErr("");
    try {
      const created = await apiFetch("/clients/", {
        method: "POST",
        body: JSON.stringify({
          company_name:   nc.company_name,
          contact_person: nc.contact_person || null,
          email:          nc.email,
          phone:          nc.phone || null,
        }),
      });
      await reloadClients();
      setForm(v => ({ ...v, client_id: String(created.id) }));
      setShowNewClient(false);
      setNc({ company_name: "", contact_person: "", email: "", phone: "" });
    } catch (e) {
      if (e.status === 409 && e.detail?.existing_client) {
        const ex = e.detail.existing_client;
        // Offer one-click reuse instead of a dead-end error —
        // this is the "renting a second time" case.
        setNcErr(
          `A client with this email already exists: "${ex.company_name}"${ex.contact_person ? ` (${ex.contact_person})` : ""}. ` +
          `Use the button below to select them instead of creating a duplicate.`
        );
        setNcExisting(ex);
      } else {
        setNcErr(e.message);
        setNcExisting(null);
      }
    }
    finally { setNcSaving(false); }
  };

  // Reuse an existing client found via the 409 duplicate check —
  // selects them in the rental form without creating a new row.
  const [ncExisting, setNcExisting] = useState(null);
  const useExistingClient = () => {
    if (!ncExisting) return;
    setForm(v => ({ ...v, client_id: String(ncExisting.id) }));
    setShowNewClient(false);
    setNc({ company_name: "", contact_person: "", email: "", phone: "" });
    setNcErr(""); setNcExisting(null);
  };

  // Create the rental (auto-generates a linked draft quote on the backend)
  const submit = async () => {
    if (!form.client_id || !form.equipment_id || !form.start_date || !form.end_date) {
      setFormErr("Client, Equipment, Start Date and End Date are required."); return;
    }
    setSaving(true); setFormErr("");
    try {
      await apiFetch("/rentals/", {
        method: "POST",
        body: JSON.stringify({
          client_id:     parseInt(form.client_id),
          equipment_id:  parseInt(form.equipment_id),
          start_date:    form.start_date,
          end_date:      form.end_date,
          monthly_rate:  form.monthly_rate ? parseFloat(form.monthly_rate) : null,
          site_location: form.site_location || null,
          notes:         form.notes || null,
        }),
      });
      setShowForm(false);
      setForm({ client_id: "", equipment_id: "", start_date: "", end_date: "", monthly_rate: "", site_location: "", notes: "" });
      reload();
    } catch (e) { setFormErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">

      {/* Status filter + Create button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-2">
          {["", "active", "due", "overdue", "completed"].map(s => (
            <button key={s} onClick={() => setStatusF(s)} className="px-3 py-1.5 text-xs font-bold rounded-lg"
              style={{ fontFamily: "Barlow Condensed,sans-serif", background: statusF === s ? G.green : "rgba(255,255,255,0.04)", color: statusF === s ? "#060e1c" : G.muted, border: `1px solid ${statusF === s ? G.green : G.border}` }}>
              {s || "ALL"}
            </button>
          ))}
        </div>
        <button onClick={() => { setShowForm(v => !v); setFormErr(""); }}
          className="px-4 py-2 text-xs font-black rounded-lg"
          style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
          + NEW RENTAL
        </button>
      </div>

      {/* ── Create Rental Form ─────────────────────────────────────────────── */}
      {showForm && (
        <Card style={{ border: `1px solid ${G.green}40` }}>
          <div className="text-xs font-black tracking-widest mb-1" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>
            CREATE NEW RENTAL
          </div>
          <div className="text-xs mb-4" style={{ color: G.muted }}>
            A draft quote is automatically calculated (rate × duration) and linked to this rental.
          </div>

          {formErr && <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(239,68,68,0.1)", color: G.red }}>{formErr}</div>}

          <div className="grid md:grid-cols-2 gap-4">

            {/* ── CLIENT FIELD ───────────────────────────────────────────── */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold" style={{ color: G.muted }}>CLIENT *</label>
                <button
                  onClick={() => { setShowNewClient(v => !v); setNcErr(""); }}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg"
                  style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)", fontFamily: "Barlow Condensed,sans-serif" }}>
                  {showNewClient ? "▲ CANCEL NEW CLIENT" : "+ CREATE NEW CLIENT"}
                </button>
              </div>

              {/* Inline new-client mini-form */}
              {showNewClient && (
                <div className="mb-3 p-4 rounded-xl" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
                  <div className="text-xs font-black tracking-widest mb-3" style={{ color: "#60a5fa", fontFamily: "Barlow Condensed,sans-serif" }}>
                    NEW CLIENT — fill in and click ADD
                  </div>
                  {ncErr && (
                    <div className="mb-2 text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: G.red }}>
                      <div>{ncErr}</div>
                      {ncExisting && (
                        <button onClick={useExistingClient}
                          className="mt-2 px-3 py-1.5 rounded-lg text-xs font-black"
                          style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
                          ✓ USE EXISTING CLIENT: {ncExisting.company_name}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>COMPANY NAME *</label>
                      <input value={nc.company_name} onChange={e => setNc(v => ({ ...v, company_name: e.target.value }))}
                        placeholder="e.g. Shell Nigeria Exploration" style={INP} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>CONTACT PERSON</label>
                      <input value={nc.contact_person} onChange={e => setNc(v => ({ ...v, contact_person: e.target.value }))}
                        placeholder="Full name" style={INP} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>EMAIL *</label>
                      <input type="email" value={nc.email} onChange={e => setNc(v => ({ ...v, email: e.target.value }))}
                        placeholder="contact@company.com" style={INP} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>PHONE</label>
                      <input value={nc.phone} onChange={e => setNc(v => ({ ...v, phone: e.target.value }))}
                        placeholder="+234 xxx xxx xxxx" style={INP} />
                    </div>
                    <div className="flex items-end">
                      <button onClick={createClientInline} disabled={ncSaving}
                        className="w-full py-2.5 text-xs font-black rounded-lg"
                        style={{ background: "#3b82f6", color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>
                        {ncSaving ? "ADDING..." : "ADD CLIENT →"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Client dropdown */}
              <select value={form.client_id} onChange={e => setForm(v => ({ ...v, client_id: e.target.value }))} style={INP}>
                <option value="" style={{ background: "#0d1b2e" }}>
                  {clients.length === 0 ? "No clients yet — create one above ↑" : "Select client..."}
                </option>
                {clients.map(c => (
                  <option key={c.id} value={c.id} style={{ background: "#0d1b2e" }}>
                    {c.company_name}{c.contact_person ? ` — ${c.contact_person}` : ""}
                  </option>
                ))}
              </select>

              {clients.length === 0 && (
                <div className="mt-1.5 text-xs" style={{ color: G.muted }}>
                  ℹ Clients are created when you convert a Lead (Leads panel → "→ CLIENT"), or click "+ CREATE NEW CLIENT" above.
                </div>
              )}
            </div>

            {/* ── EQUIPMENT ─────────────────────────────────────────────── */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>EQUIPMENT *</label>
              <select value={form.equipment_id} onChange={e => setForm(v => ({ ...v, equipment_id: e.target.value }))} style={INP}>
                <option value="" style={{ background: "#0d1b2e" }}>
                  {equipment.filter(e => e.is_available).length === 0 ? "No available equipment — add some in the database first" : "Select equipment..."}
                </option>
                {equipment.filter(e => e.is_available).map(e => (
                  <option key={e.id} value={e.id} style={{ background: "#0d1b2e" }}>
                    {e.name}{e.capacity ? ` (${e.capacity})` : ""}
                    {e.monthly_rate ? ` — ₦${Number(e.monthly_rate).toLocaleString()}/mo` : ""}
                  </option>
                ))}
              </select>
              {equipment.filter(e => e.is_available).length === 0 && equipment.length > 0 && (
                <div className="mt-1.5 text-xs" style={{ color: G.amber }}>
                  ⚠ All equipment is currently in use (unavailable). Complete an existing rental to free equipment.
                </div>
              )}
            </div>

            {/* ── DATES ─────────────────────────────────────────────────── */}
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>START DATE *</label>
              <input type="date" value={form.start_date} onChange={e => setForm(v => ({ ...v, start_date: e.target.value }))} style={INP} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>END DATE *</label>
              <input type="date" value={form.end_date} onChange={e => setForm(v => ({ ...v, end_date: e.target.value }))} style={INP} />
            </div>

            {/* ── RATE + LOCATION ───────────────────────────────────────── */}
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>
                MONTHLY RATE (₦)
                <span className="ml-1 font-normal" style={{ color: G.muted }}>— leave blank to use equipment default</span>
              </label>
              <input type="number" placeholder="e.g. 250000" value={form.monthly_rate}
                onChange={e => setForm(v => ({ ...v, monthly_rate: e.target.value }))} style={INP} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>SITE LOCATION</label>
              <input type="text" placeholder="e.g. Trans Amadi, Port Harcourt"
                value={form.site_location} onChange={e => setForm(v => ({ ...v, site_location: e.target.value }))} style={INP} />
            </div>

            {/* ── NOTES ─────────────────────────────────────────────────── */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>NOTES</label>
              <textarea rows={2} placeholder="Any additional notes about this rental..."
                value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))}
                style={{ ...INP, resize: "vertical" }} />
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={submit} disabled={saving}
              className="px-6 py-2.5 text-xs font-black rounded-lg"
              style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
              {saving ? "CREATING..." : "✓ CREATE RENTAL + AUTO-QUOTE"}
            </button>
            <button onClick={() => { setShowForm(false); setShowNewClient(false); setFormErr(""); }}
              className="px-6 py-2.5 text-xs font-bold rounded-lg"
              style={{ background: "rgba(255,255,255,0.05)", color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>
              CANCEL
            </button>
          </div>
        </Card>
      )}

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <ErrBox msg={error} />}
      {!loading && !rentals.length && (
        <EmptyState msg="No rentals yet — click + NEW RENTAL to create one" />
      )}

      <div className="space-y-3">
        {rentals.map(r => (
          <Card key={r.id} className="hover:-translate-y-0.5 transition-transform duration-200">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <span style={{ color: G.green }}><Ico.Truck /></span>
                </div>
                <div>
                  <div className="font-black text-base leading-tight" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>
                    {r.equipment?.name || `Equipment #${r.equipment_id}`}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: G.muted }}>
                    {r.client?.company_name || `Client #${r.client_id}`}
                    {r.client?.contact_person ? ` — ${r.client.contact_person}` : ""}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: G.muted }}>{r.start_date} → {r.end_date}</div>
                  {r.site_location && <div className="text-xs mt-0.5" style={{ color: G.muted }}>📍 {r.site_location}</div>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>{r.rental_code}</span>
                  <Badge s={r.status} />
                </div>
                <div className="w-36"><HealthBar pct={r.health_score} /></div>
                {r.monthly_rate && (
                  <div className="text-xs font-bold" style={{ color: G.green }}>
                    ₦{Number(r.monthly_rate).toLocaleString()}/mo
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── EQUIPMENT ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Full CRUD for the equipment fleet — the previously missing admin module.
 *
 * Backend contract this matches exactly (app/routers/resources.py):
 *   GET    /api/equipment/          public, no auth
 *   POST   /api/equipment/          staff/admin
 *   PATCH  /api/equipment/{eq_id}   staff/admin
 *   DELETE /api/equipment/{eq_id}   admin only
 *
 * This is the single source of truth that feeds:
 *   1. The Rentals panel's equipment dropdown (via /equipment/?size=100)
 *   2. The public website's Equipment Showcase section
 * Without real rows here, both of those show empty/fallback data —
 * which is exactly the "All equipment is currently in use" false
 * warning you saw on the Rentals form.
 */
function Equipment() {
  const { data, loading, error, reload } = useApi("/equipment/?size=100");
  const equipment = data || [];

  const [categoryF, setCategoryF]   = useState("");
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState(null); // null = creating new, else editing this id

  const emptyForm = {
    name: "", category: "generator", make: "", model: "", capacity: "",
    year: "", serial_number: "", daily_rate: "", monthly_rate: "",
    image_url: "", notes: "", specs: "", // specs entered as comma-separated, split on submit
  };
  const [form, setForm]       = useState(emptyForm);
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState("");
  const [uploading, setUploading] = useState(false); // true while the image is actively uploading to Cloudinary

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormErr("");
    try {
      const url = await uploadImage(file);
      setForm(v => ({ ...v, image_url: url }));
    } catch (err) {
      setFormErr(`Image upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const INP = {
    background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`,
    color: "white", borderRadius: "0.5rem", padding: "0.6rem 0.9rem",
    width: "100%", fontSize: "0.82rem", outline: "none",
  };

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setFormErr(""); setShowForm(true); };
  const openEdit = (eq) => {
    setEditingId(eq.id);
    setForm({
      name: eq.name || "", category: eq.category || "generator",
      make: eq.make || "", model: eq.model || "", capacity: eq.capacity || "",
      year: eq.year || "", serial_number: eq.serial_number || "",
      daily_rate: eq.daily_rate || "", monthly_rate: eq.monthly_rate || "",
      image_url: eq.image_url || "", notes: eq.notes || "",
      specs: (eq.specs || []).join(", "),
    });
    setFormErr(""); setShowForm(true);
  };

  const submit = async () => {
    if (!form.name || !form.category) { setFormErr("Name and Category are required."); return; }
    setSaving(true); setFormErr("");

    const payload = {
      name:          form.name,
      category:      form.category,
      make:          form.make || null,
      model:         form.model || null,
      capacity:      form.capacity || null,
      year:          form.year ? parseInt(form.year) : null,
      serial_number: form.serial_number || null,
      daily_rate:    form.daily_rate ? parseFloat(form.daily_rate) : null,
      monthly_rate:  form.monthly_rate ? parseFloat(form.monthly_rate) : null,
      image_url:     form.image_url || null,
      notes:         form.notes || null,
      specs:         form.specs ? form.specs.split(",").map(s => s.trim()).filter(Boolean) : null,
    };

    try {
      if (editingId) {
        // PATCH — editing an existing equipment record
        await apiFetch(`/equipment/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        // POST — creating a brand-new equipment record
        await apiFetch("/equipment/", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      reload();
    } catch (e) { setFormErr(e.message); }
    finally { setSaving(false); }
  };

  // Toggle availability without opening the full edit form —
  // useful for quickly marking equipment "down for maintenance"
  const toggleAvailable = async (eq) => {
    try {
      await apiFetch(`/equipment/${eq.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_available: !eq.is_available }),
      });
      reload();
    } catch (e) { alert("Update failed: " + e.message); }
  };

  const deleteEquipment = async (eq) => {
    if (!confirm(`Delete "${eq.name}"? This cannot be undone. Equipment with existing rental history should be marked unavailable instead of deleted.`)) return;
    try {
      await apiFetch(`/equipment/${eq.id}`, { method: "DELETE" });
      reload();
    } catch (e) { alert("Delete failed: " + e.message); }
  };

  const filtered = categoryF ? equipment.filter(e => e.category === categoryF) : equipment;

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="px-4 py-3 rounded-xl text-xs flex items-start gap-2"
        style={{ background: "rgba(34,197,94,0.06)", border: `1px solid ${G.border}`, color: G.muted }}>
        <span style={{ color: G.green, fontSize: "1rem" }}>ℹ</span>
        <span>
          Equipment added here automatically appears in the <strong style={{ color: G.text }}>Rentals</strong> form's
          equipment dropdown and on the <strong style={{ color: G.text }}>public website's</strong> Equipment Showcase section.
        </span>
      </div>

      {/* Filter + Create button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-2">
          {["", "generator", "forklift", "construction", "other"].map(c => (
            <button key={c} onClick={() => setCategoryF(c)} className="px-3 py-1.5 text-xs font-bold rounded-lg capitalize"
              style={{ fontFamily: "Barlow Condensed,sans-serif", background: categoryF === c ? G.green : "rgba(255,255,255,0.04)", color: categoryF === c ? "#060e1c" : G.muted, border: `1px solid ${categoryF === c ? G.green : G.border}` }}>
              {c || "ALL"}
            </button>
          ))}
        </div>
        <button onClick={openCreate}
          className="px-4 py-2 text-xs font-black rounded-lg flex items-center gap-1.5"
          style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
          <Ico.Plus /> ADD EQUIPMENT
        </button>
      </div>

      {/* ── Create/Edit Equipment Form ─────────────────────────────────────── */}
      {showForm && (
        <Card style={{ border: `1px solid ${G.green}40` }}>
          <div className="text-xs font-black tracking-widest mb-4" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>
            {editingId ? "EDIT EQUIPMENT" : "ADD NEW EQUIPMENT"}
          </div>

          {formErr && <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(239,68,68,0.1)", color: G.red }}>{formErr}</div>}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>EQUIPMENT NAME *</label>
              <input value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
                placeholder="e.g. 250KVA Diesel Generator" style={INP} />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>CATEGORY *</label>
              <select value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))} style={INP}>
                {["generator", "forklift", "construction", "other"].map(c => (
                  <option key={c} value={c} style={{ background: "#0d1b2e" }}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>CAPACITY</label>
              <input value={form.capacity} onChange={e => setForm(v => ({ ...v, capacity: e.target.value }))}
                placeholder="e.g. 250KVA, 3-Ton, 20-Tonne" style={INP} />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>MAKE</label>
              <input value={form.make} onChange={e => setForm(v => ({ ...v, make: e.target.value }))}
                placeholder="e.g. Caterpillar, Perkins" style={INP} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>MODEL</label>
              <input value={form.model} onChange={e => setForm(v => ({ ...v, model: e.target.value }))}
                placeholder="e.g. C9 ATAAC" style={INP} />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>YEAR</label>
              <input type="number" value={form.year} onChange={e => setForm(v => ({ ...v, year: e.target.value }))}
                placeholder="e.g. 2022" style={INP} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>SERIAL NUMBER</label>
              <input value={form.serial_number} onChange={e => setForm(v => ({ ...v, serial_number: e.target.value }))}
                placeholder="Optional" style={INP} />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>DAILY RATE (₦)</label>
              <input type="number" value={form.daily_rate} onChange={e => setForm(v => ({ ...v, daily_rate: e.target.value }))}
                placeholder="e.g. 15000" style={INP} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>MONTHLY RATE (₦)</label>
              <input type="number" value={form.monthly_rate} onChange={e => setForm(v => ({ ...v, monthly_rate: e.target.value }))}
                placeholder="e.g. 250000" style={INP} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>EQUIPMENT PHOTO</label>
              <div className="flex items-center gap-3">
                <label className="px-4 py-2.5 text-xs font-bold rounded-lg cursor-pointer transition-all"
                  style={{ background: uploading ? "rgba(34,197,94,0.15)" : G.gdim, color: G.green, border: `1px solid ${G.green}40`, fontFamily: "Barlow Condensed,sans-serif", opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? "UPLOADING..." : "CHOOSE PHOTO"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageSelect}
                    disabled={uploading} style={{ display: "none" }} />
                </label>
                {uploading && <Spinner />}
                {!uploading && form.image_url && (
                  <span className="text-xs" style={{ color: G.muted }}>✓ Photo uploaded</span>
                )}
              </div>
              {form.image_url && (
                <div className="mt-3 relative inline-block">
                  <img src={form.image_url} alt="Equipment preview" className="rounded-lg object-cover"
                    style={{ width: 140, height: 100, border: `1px solid ${G.border}` }} />
                  <button type="button" onClick={() => setForm(v => ({ ...v, image_url: "" }))}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: G.red, color: "white" }} title="Remove photo">
                    ✕
                  </button>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>
                SPECS <span className="font-normal">— comma-separated, shown as bullet points on the website</span>
              </label>
              <input value={form.specs} onChange={e => setForm(v => ({ ...v, specs: e.target.value }))}
                placeholder="e.g. Soundproof canopy, Auto start, ATS compatible" style={INP} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>INTERNAL NOTES</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))}
                placeholder="Not shown publicly — maintenance history, quirks, etc." style={{ ...INP, resize: "vertical" }} />
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={submit} disabled={saving}
              className="px-6 py-2.5 text-xs font-black rounded-lg"
              style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
              {saving ? "SAVING..." : (editingId ? "✓ SAVE CHANGES" : "✓ ADD EQUIPMENT")}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); setFormErr(""); }}
              className="px-6 py-2.5 text-xs font-bold rounded-lg"
              style={{ background: "rgba(255,255,255,0.05)", color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>
              CANCEL
            </button>
          </div>
        </Card>
      )}

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <ErrBox msg={error} />}
      {!loading && !filtered.length && (
        <EmptyState msg={equipment.length === 0 ? "No equipment registered yet — click + ADD EQUIPMENT to get started" : "No equipment in this category"} />
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(eq => (
          <Card key={eq.id} className="hover:-translate-y-0.5 transition-transform duration-200">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-black tracking-wider" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>
                {eq.ref_code}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: eq.is_available ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                  color: eq.is_available ? G.green : G.red,
                }}>
                {eq.is_available ? "AVAILABLE" : "IN USE"}
              </span>
            </div>

            <div className="font-black text-base mb-1 leading-tight" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>
              {eq.name}
            </div>
            <div className="text-xs mb-3 capitalize" style={{ color: G.muted }}>
              {eq.category}{eq.make ? ` · ${eq.make}` : ""}{eq.model ? ` ${eq.model}` : ""}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
              {[["Capacity", eq.capacity], ["Year", eq.year], ["Daily", eq.daily_rate ? `₦${Number(eq.daily_rate).toLocaleString()}` : null], ["Monthly", eq.monthly_rate ? `₦${Number(eq.monthly_rate).toLocaleString()}` : null]].map(([k, v]) =>
                v ? <div key={k}><span style={{ color: G.muted }}>{k}: </span><span style={{ color: G.text }}>{v}</span></div> : null
              )}
            </div>

            {eq.health_score != null && (
              <div className="mb-3">
                <div className="text-xs mb-1" style={{ color: G.muted }}>Health Score</div>
                <HealthBar pct={eq.health_score} />
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => openEdit(eq)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg"
                style={{ background: G.gdim, color: G.green, fontFamily: "Barlow Condensed,sans-serif", border: `1px solid ${G.green}30` }}>
                <Ico.Edit /> EDIT
              </button>
              <button onClick={() => toggleAvailable(eq)}
                className="flex-1 py-2 text-xs font-bold rounded-lg"
                style={{
                  background: eq.is_available ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)",
                  color: eq.is_available ? G.amber : G.green,
                  border: `1px solid ${eq.is_available ? G.amber : G.green}30`,
                  fontFamily: "Barlow Condensed,sans-serif",
                }}>
                {eq.is_available ? "MARK IN USE" : "MARK AVAILABLE"}
              </button>
              <button onClick={() => deleteEquipment(eq)}
                className="px-3 py-2 text-xs font-bold rounded-lg"
                style={{ background: "rgba(239,68,68,0.1)", color: G.red, border: "1px solid rgba(239,68,68,0.25)" }}>
                ✕
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── LIVE CHAT — ADMIN PANEL ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Admin side of the live chat. Connects to ws://.../api/chat/ws/admin/{token}
 * using the SAME JWT already stored from login — no separate chat login needed.
 *
 * Shows a list of active visitors on the left, and the conversation
 * thread with whichever visitor is selected on the right — standard
 * live-chat-dashboard layout (Intercom/Crisp-style, simplified).
 */
function AdminLiveChat() {
  const { user } = useAuth();
  // NOTE: token is read directly from localStorage, matching the same
  // pattern apiFetch() already uses elsewhere in this file — the auth
  // context only exposes {user, login, logout, ready}, not the raw token.
  const token = localStorage.getItem("bilm_token");
  const [visitors, setVisitors]   = useState([]); // [{visitor_id, message_count}]
  const [activeId, setActiveId]   = useState(null);
  const [messages, setMessages]   = useState({}); // { visitor_id: [messages] }
  const [connected, setConnected] = useState(false);
  const [input, setInput]         = useState("");
  const wsRef     = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}/chat/ws/admin/${token}`);
    ws.onopen  = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.type === "active_visitors") { setVisitors(data.visitors); return; }
      if (data.type === "visitor_connected") {
        setVisitors(prev => prev.some(v => v.visitor_id === data.visitor_id) ? prev : [...prev, { visitor_id: data.visitor_id, message_count: 0 }]);
        return;
      }
      if (data.type === "visitor_disconnected") {
        setVisitors(prev => prev.filter(v => v.visitor_id !== data.visitor_id));
        return;
      }
      if (data.type === "message") {
        setMessages(prev => ({
          ...prev,
          [data.visitor_id]: [...(prev[data.visitor_id] || []), data],
        }));
      }
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeId]);

  const send = () => {
    if (!input.trim() || !activeId || !wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ visitor_id: activeId, text: input.trim(), sender: user?.full_name || "Support" }));
    setInput("");
  };

  const activeMessages = messages[activeId] || [];

  return (
    <div className="grid md:grid-cols-3 gap-4" style={{ height: "calc(100vh - 200px)" }}>
      {/* Visitor list */}
      <Card style={{ padding: 0, overflow: "hidden" }} className="flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${G.border}` }}>
          <span className="text-xs font-black tracking-widest" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>
            VISITORS ({visitors.length})
          </span>
          <span className="w-2 h-2 rounded-full" style={{ background: connected ? G.green : G.red }} title={connected ? "Connected" : "Disconnected"} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {visitors.length === 0 && (
            <div className="p-4 text-xs text-center" style={{ color: G.muted }}>
              No visitors online right now. This list updates live as people open the chat widget on the website.
            </div>
          )}
          {visitors.map(v => (
            <button key={v.visitor_id} onClick={() => setActiveId(v.visitor_id)}
              className="w-full text-left px-4 py-3 text-xs transition-colors"
              style={{
                background: activeId === v.visitor_id ? "rgba(34,197,94,0.1)" : "transparent",
                borderBottom: `1px solid ${G.border}`,
                color: activeId === v.visitor_id ? G.green : G.text,
              }}>
              <div className="font-bold">Visitor {v.visitor_id.slice(-6)}</div>
              <div style={{ color: G.muted }}>{(messages[v.visitor_id] || []).length || v.message_count} message(s)</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Conversation */}
      <Card style={{ padding: 0, overflow: "hidden" }} className="md:col-span-2 flex flex-col">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-xs" style={{ color: G.muted }}>
            Select a visitor from the left to view and reply to their conversation.
          </div>
        ) : (
          <>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${G.border}` }}>
              <span className="text-xs font-black" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>
                Visitor {activeId.slice(-6)}
              </span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {activeMessages.map((m, i) => {
                const isMine = m.from === "admin" || m.from === "admin_echo";
                return (
                  <div key={i} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[70%] px-3 py-2 rounded-xl text-xs"
                      style={{ background: isMine ? G.green : "rgba(255,255,255,0.08)", color: isMine ? "#060e1c" : "white" }}>
                      {!isMine && <div className="font-bold mb-0.5" style={{ fontSize: "0.65rem", color: G.green }}>{m.sender}</div>}
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 flex gap-2" style={{ borderTop: `1px solid ${G.border}` }}>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
                placeholder="Reply to visitor..."
                className="flex-1 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, color: "white", outline: "none" }} />
              <button onClick={send} className="px-3 py-2 rounded-lg" style={{ background: G.green, color: "#060e1c" }}>
                <Ico.Send />
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Maintenance() {
  const { data, loading, error, reload } = useApi("/maintenance/?size=30");
  const { data: equipmentData } = useApi("/equipment/?size=100");
  const records = data?.items || [];
  const equipment = equipmentData || [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ equipment_id: "", maint_type: "scheduled", technician: "", scheduled_date: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const INP = { background: "rgba(255,255,255,0.05)", border: `1px solid ${G.border}`, color: "white", borderRadius: "0.5rem", padding: "0.6rem 0.9rem", width: "100%", fontSize: "0.82rem", outline: "none" };

  const submit = async () => {
    if (!form.equipment_id || !form.maint_type) { setFormErr("Equipment and Type are required."); return; }
    setSaving(true); setFormErr("");
    try {
      await apiFetch("/maintenance/", {
        method: "POST",
        body: JSON.stringify({
          equipment_id:   parseInt(form.equipment_id),
          maint_type:     form.maint_type,
          technician:     form.technician || null,
          scheduled_date: form.scheduled_date || null,
          notes:          form.notes || null,
        }),
      });
      setShowForm(false);
      setForm({ equipment_id: "", maint_type: "scheduled", technician: "", scheduled_date: "", notes: "" });
      reload();
    } catch (e) { setFormErr(e.message); }
    finally { setSaving(false); }
  };

  const startMaint = async id => { await apiFetch(`/maintenance/${id}/start`, { method: "PATCH" }); reload(); };

  return (
    <div className="space-y-4">
      {/* Header + Create button */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold tracking-widest" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>
          {records.length} RECORD{records.length !== 1 ? "S" : ""}
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 text-xs font-black rounded-lg flex items-center gap-1.5"
          style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
          + SCHEDULE MAINTENANCE
        </button>
      </div>

      {/* Create Maintenance Form */}
      {showForm && (
        <Card style={{ border: `1px solid ${G.green}40` }}>
          <div className="text-xs font-black tracking-widest mb-4" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>SCHEDULE NEW MAINTENANCE</div>
          {formErr && <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(239,68,68,0.1)", color: G.red }}>{formErr}</div>}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>EQUIPMENT *</label>
              <select value={form.equipment_id} onChange={e => setForm(v => ({ ...v, equipment_id: e.target.value }))} style={INP}>
                <option value="" style={{ background: "#0d1b2e" }}>Select equipment...</option>
                {equipment.map(e => <option key={e.id} value={e.id} style={{ background: "#0d1b2e" }}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>TYPE *</label>
              <select value={form.maint_type} onChange={e => setForm(v => ({ ...v, maint_type: e.target.value }))} style={INP}>
                {["scheduled", "preventive", "corrective", "emergency"].map(t => (
                  <option key={t} value={t} style={{ background: "#0d1b2e" }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>TECHNICIAN</label>
              <input type="text" placeholder="e.g. John Okoro" value={form.technician} onChange={e => setForm(v => ({ ...v, technician: e.target.value }))} style={INP} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>SCHEDULED DATE</label>
              <input type="date" value={form.scheduled_date} onChange={e => setForm(v => ({ ...v, scheduled_date: e.target.value }))} style={INP} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1" style={{ color: G.muted }}>NOTES</label>
              <textarea rows={2} placeholder="Describe the maintenance work required..." value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))} style={{ ...INP, resize: "vertical" }} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={submit} disabled={saving}
              className="px-6 py-2.5 text-xs font-black rounded-lg"
              style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
              {saving ? "SCHEDULING..." : "SCHEDULE"}
            </button>
            <button onClick={() => { setShowForm(false); setFormErr(""); }}
              className="px-6 py-2.5 text-xs font-bold rounded-lg"
              style={{ background: "rgba(255,255,255,0.05)", color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>
              CANCEL
            </button>
          </div>
        </Card>
      )}

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <ErrBox msg={error} />}
      {!loading && !records.length && <EmptyState msg="No maintenance records — click + SCHEDULE MAINTENANCE to add one" />}
      <div className="grid md:grid-cols-2 gap-4">
        {records.map(m => (
          <Card key={m.id} className="hover:-translate-y-0.5 transition-transform duration-200">
            <div className="flex items-start justify-between mb-3">
              <span className="font-black text-xs tracking-wider" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>{m.maint_code}</span>
              <Badge s={m.status} />
            </div>
            <div className="font-black text-base mb-3 leading-tight" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>
              {m.equipment?.name || `Equipment #${m.equipment_id}`}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[["Type", m.maint_type], ["Technician", m.technician || "TBD"], ["Date", m.scheduled_date || "—"], ["Cost", m.cost ? `₦${Number(m.cost).toLocaleString()}` : "—"]].map(([k, v]) => (
                <div key={k}><span style={{ color: G.muted }}>{k}: </span><span style={{ color: k === "Type" && m.maint_type === "emergency" ? G.red : G.text }}>{v}</span></div>
              ))}
            </div>
            {m.status === "scheduled" && (
              <button onClick={() => startMaint(m.id)} className="mt-3 w-full py-2 text-xs font-bold rounded-lg"
                style={{ background: G.gdim, color: G.green, fontFamily: "Barlow Condensed,sans-serif", border: `1px solid ${G.green}30` }}>
                MARK IN PROGRESS
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function EmailLogs() {
  const [statusF, setStatusF] = useState("");
  const { data, loading, error } = useApi(`/email-logs/?size=30${statusF ? `&status=${statusF}` : ""}`, [statusF]);
  const logs = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["", "queued", "sent", "failed", "cancelled"].map(s => (
          <button key={s} onClick={() => setStatusF(s)} className="px-3 py-1.5 text-xs font-bold rounded-lg"
            style={{ fontFamily: "Barlow Condensed,sans-serif", background: statusF === s ? G.green : "rgba(255,255,255,0.04)", color: statusF === s ? "#060e1c" : G.muted, border: `1px solid ${statusF === s ? G.green : G.border}` }}>
            {s || "ALL"}
          </button>
        ))}
      </div>
      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <ErrBox msg={error} />}
      <Card style={{ padding: 0 }}>
        <div className="overflow-x-auto rounded-xl">
          <table className="w-full">
            <thead><tr style={{ borderBottom: `1px solid ${G.border}` }}>
              {["RECIPIENT", "TEMPLATE", "SUBJECT", "SCHEDULED", "STATUS"].map(h => (
                <th key={h} className="py-3 px-4 text-left text-xs font-bold tracking-wider whitespace-nowrap" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {!logs.length && !loading && <tr><td colSpan={5}><EmptyState msg="No email logs" /></td></tr>}
              {logs.map((l, i) => (
                <tr key={l.id} className="transition-colors hover:bg-white hover:bg-opacity-5"
                  style={{ borderBottom: i < logs.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
                  <td className="py-3 px-4 text-xs font-bold" style={{ color: "white" }}>{l.recipient_name || l.recipient_email}</td>
                  <td className="py-3 px-4 text-xs" style={{ color: G.muted }}>{l.template_slug || "—"}</td>
                  <td className="py-3 px-4 text-xs" style={{ color: G.text, maxWidth: 220 }}>{l.subject || "—"}</td>
                  <td className="py-3 px-4 text-xs whitespace-nowrap" style={{ color: G.muted }}>{l.scheduled_at || l.sent_at || "—"}</td>
                  <td className="py-3 px-4"><Badge s={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Templates() {
  const { data, loading, reload } = useApi("/email-templates/");
  const [sel, setSel] = useState(null);
  const [ed, setEd] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [testEmail, setTestEmail] = useState("");

  const open = t => { setSel(t); setEd({ ...t }); setMsg(""); };
  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/email-templates/${ed.slug}`, { method: "PUT", body: JSON.stringify({ name: ed.name, subject: ed.subject, body_html: ed.body_html, body_text: ed.body_text, is_active: ed.is_active }) });
      setMsg("✅ Saved successfully"); reload();
    } catch (e) { setMsg("❌ " + e.message); }
    finally { setSaving(false); }
  };
  const sendTest = async () => {
    if (!testEmail) return;
    try { await apiFetch(`/email-templates/${ed.slug}/send-test`, { method: "POST", body: JSON.stringify({ recipient_email: testEmail, context: {} }) }); setMsg(`✅ Test sent to ${testEmail}`); }
    catch (e) { setMsg("❌ " + e.message); }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-5 h-full">
      <div className="space-y-2">
        <SectionLabel>TEMPLATES ({data?.length || 0})</SectionLabel>
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}
        {(data || []).map(t => (
          <button key={t.slug} onClick={() => open(t)} className="w-full text-left p-4 rounded-xl transition-all duration-150 hover:-translate-y-0.5"
            style={{ background: sel?.slug === t.slug ? `${G.green}10` : "rgba(255,255,255,0.03)", border: `1px solid ${sel?.slug === t.slug ? G.green + "50" : G.border}` }}>
            <div className="text-xs font-bold leading-tight" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>{t.name}</div>
            <div className="text-xs mt-1" style={{ color: G.muted }}>{t.slug}</div>
            <div className="mt-2"><Badge s={t.is_active ? "active" : "cancelled"} /></div>
          </button>
        ))}
      </div>
      {ed ? (
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel>EDITING: {ed.slug}</SectionLabel>
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg"
              style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
              <Ico.Save /> {saving ? "SAVING..." : "SAVE"}
            </button>
          </div>
          {msg && <div className="px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ background: msg.startsWith("✅") ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", color: msg.startsWith("✅") ? G.green : G.red, border: `1px solid ${msg.startsWith("✅") ? G.green + "30" : G.red + "30"}` }}>{msg}</div>}
          {[["TEMPLATE NAME", "name", "text"], ["SUBJECT LINE", "subject", "text"]].map(([lbl, key, type]) => (
            <div key={key}>
              <label className="block text-xs font-bold tracking-widest mb-1.5" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>{lbl}</label>
              <input type={type} value={ed[key] || ""} onChange={e => setEd(v => ({ ...v, [key]: e.target.value }))} style={INP} />
            </div>
          ))}
          <div>
            <label className="block text-xs font-bold tracking-widest mb-1.5" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>HTML BODY</label>
            <textarea rows={14} value={ed.body_html || ""} onChange={e => setEd(v => ({ ...v, body_html: e.target.value }))}
              style={{ ...INP, resize: "vertical", fontFamily: "'Courier New',monospace", fontSize: "0.72rem", lineHeight: 1.6 }} />
          </div>
          <div className="flex gap-2">
            <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Send test to: email@example.com"
              style={{ ...INP, flex: 1, padding: "0.6rem 0.9rem" }} />
            <button onClick={sendTest} className="px-4 py-2 text-xs font-bold rounded-lg whitespace-nowrap"
              style={{ background: "rgba(59,130,246,0.15)", color: G.blue, border: `1px solid rgba(59,130,246,0.3)`, fontFamily: "Barlow Condensed,sans-serif" }}>
              SEND TEST
            </button>
          </div>
        </div>
      ) : (
        <div className="lg:col-span-2 flex items-center justify-center" style={{ color: G.muted }}>
          <div className="text-center">
            <div className="text-5xl mb-3 opacity-20">✉</div>
            <div className="text-xs font-bold tracking-widest" style={{ fontFamily: "Barlow Condensed,sans-serif" }}>SELECT A TEMPLATE TO EDIT</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Settings() {
  const { data, loading, error } = useApi("/settings/");
  const [vals, setVals] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { if (data) setVals(Object.fromEntries(data.map(s => [s.key, s.value || ""]))); }, [data]);

  const save = async () => {
    setSaving(true);
    try { await apiFetch("/settings/bulk", { method: "PUT", body: JSON.stringify(vals) }); setMsg("✅ All settings saved!"); }
    catch (e) { setMsg("❌ " + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return <ErrBox msg={error} />;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <SectionLabel>COMPANY SETTINGS</SectionLabel>
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg"
          style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
          <Ico.Save /> {saving ? "SAVING..." : "SAVE ALL"}
        </button>
      </div>
      {msg && <div className="px-3 py-2 rounded-lg text-xs font-semibold"
        style={{ background: msg.startsWith("✅") ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", color: msg.startsWith("✅") ? G.green : G.red }}>{msg}</div>}
      <div className="grid md:grid-cols-2 gap-4">
        {(data || []).map(s => (
          <div key={s.key}>
            <label className="block text-xs font-bold tracking-widest mb-1" style={{ color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>
              {s.key.replace(/_/g, " ").toUpperCase()}
            </label>
            {s.description && <div className="text-xs mb-1.5" style={{ color: "rgba(90,122,154,0.6)", fontFamily: "Barlow Condensed,sans-serif" }}>{s.description}</div>}
            <input value={vals[s.key] || ""} onChange={e => setVals(v => ({ ...v, [s.key]: e.target.value }))} style={INP} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Reports() {
  const { data: kpi } = useApi("/reports/overview");
  const { data: flu } = useApi("/reports/fleet-utilization");
  const { data: rev } = useApi("/reports/revenue?months=12");
  const { data: pipe } = useApi("/reports/leads-pipeline");
  const revChart = (rev || []).map(r => ({ l: r.period?.slice(0, 3) || "", v: Number(r.revenue) / 1e6 || 0 }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI label="TOTAL LEADS" value={kpi?.total_leads} icon={<Ico.Users />} />
        <KPI label="OPEN QUOTE VAL" value={kpi?.open_quotes_value ? `₦${(Number(kpi.open_quotes_value) / 1e6).toFixed(1)}M` : kpi ? "₦0" : null} icon={<Ico.Quote />} color={G.blue} />
        <KPI label="FLEET UTIL." value={flu ? `${flu.utilization_pct}%` : null} icon={<Ico.Truck />} color={G.amber} />
        <KPI label="AVG HEALTH" value={flu ? `${flu.avg_health_score}%` : null} icon={<Ico.Shield />} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><SectionLabel>MONTHLY REVENUE (₦M)</SectionLabel>{revChart.length ? <MiniChart data={revChart} color={G.green} /> : <EmptyState msg="No revenue data yet" />}</Card>
        <Card>
          <SectionLabel>LEADS BY STATUS</SectionLabel>
          {pipe ? (
            <div className="space-y-3 mt-1">
              {Object.entries(pipe).map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-xs w-24 font-bold" style={{ color: G.text, fontFamily: "Barlow Condensed,sans-serif" }}>{k.toUpperCase()}</span>
                  <div className="flex-1 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(v * 8, 100)}%`, background: G.blue }} />
                  </div>
                  <span className="text-xs font-black w-5 text-right" style={{ color: G.blue, fontFamily: "Barlow Condensed,sans-serif" }}>{v}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState msg="No leads yet" />}
        </Card>
      </div>
    </div>
  );
}

function ClientDash() {
  const { data: quotes, loading: ql } = useApi("/quotes/my");
  const { data: rentals, loading: rl } = useApi("/rentals/my");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <KPI label="MY RENTALS" value={rl ? null : rentals?.length} icon={<Ico.Truck />} />
        <KPI label="MY QUOTES" value={ql ? null : quotes?.length} icon={<Ico.Quote />} color={G.blue} />
        <KPI label="ACTIVE" value={rl ? null : rentals?.filter(r => r.status === "active").length} icon={<Ico.Check />} />
      </div>
      <Card>
        <SectionLabel>MY ACTIVE EQUIPMENT</SectionLabel>
        {rl && <div className="flex justify-center py-6"><Spinner /></div>}
        {(rentals || []).filter(r => r.status !== "completed").map(r => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 p-4 mb-3 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${G.border}` }}>
            <div>
              <div className="font-black" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>{r.equipment?.name || r.rental_code}</div>
              <div className="text-xs mt-0.5" style={{ color: G.muted }}>{r.start_date} → {r.end_date}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge s={r.status} />
              <div className="w-28"><HealthBar pct={r.health_score} /></div>
            </div>
          </div>
        ))}
        {!rl && !rentals?.filter(r => r.status !== "completed").length && <EmptyState msg="No active rentals" />}
      </Card>
      <Card>
        <SectionLabel>RECENT QUOTES</SectionLabel>
        {ql && <div className="flex justify-center py-6"><Spinner /></div>}
        {(quotes || []).slice(0, 5).map(q => (
          <div key={q.id} className="flex items-center justify-between p-3 mb-2 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${G.border}` }}>
            <div>
              <div className="text-xs font-black" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>{q.quote_number}</div>
              <div className="text-xs mt-0.5" style={{ color: G.muted }}>{q.service_desc || "—"}</div>
            </div>
            <div className="flex items-center gap-3">
              {q.amount && <span className="font-black" style={{ color: G.green, fontFamily: "Barlow Condensed,sans-serif" }}>₦{Number(q.amount).toLocaleString()}</span>}
              <Badge s={q.status} />
            </div>
          </div>
        ))}
        {!ql && !quotes?.length && <EmptyState msg="No quotes found" />}
      </Card>
    </div>
  );
}

// ─── Page map ─────────────────────────────────────────────────────────────────
const PAGES = {
  overview: { title: "Business Overview", sub: "REAL-TIME METRICS", comp: <Overview /> },
  leads: { title: "Lead Management", sub: "INQUIRIES & PIPELINE", comp: <Leads /> },
  quotes: { title: "Quotations", sub: "PROPOSALS & AGREEMENTS", comp: <Quotes /> },
  rentals: { title: "Rental Tracking", sub: "ACTIVE EQUIPMENT", comp: <Rentals /> },
  equipment: { title: "Equipment Fleet", sub: "REGISTER & MANAGE INVENTORY", comp: <Equipment /> },
  livechat: { title: "Live Chat", sub: "REAL-TIME VISITOR SUPPORT", comp: <AdminLiveChat /> },
  maintenance: { title: "Maintenance", sub: "SCHEDULED & CORRECTIVE", comp: <Maintenance /> },
  email_logs: { title: "Email Logs", sub: "AUTOMATION HISTORY", comp: <EmailLogs /> },
  templates: { title: "Email Templates", sub: "EDIT & TEST", comp: <Templates /> },
  settings: { title: "Company Settings", sub: "PROFILE & CONFIGURATION", comp: <Settings /> },
  reports: { title: "Reports & Analytics", sub: "PERFORMANCE SUMMARY", comp: <Reports /> },
  client_dash: { title: "My Dashboard", sub: "CLIENT OVERVIEW", comp: <ClientDash /> },
  client_quotes: { title: "My Quotations", sub: "", comp: <Quotes /> },
  client_rent: { title: "My Equipment", sub: "", comp: <Rentals /> },
};

// ─── Dashboard Shell ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// ─── TUTORIAL TOUR ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * First-login walkthrough. Pure frontend, no backend dependency.
 * Shows once per browser (tracked via localStorage), walks through the
 * real workflow this system was built around: Lead -> Client -> Rental
 * (auto-quote) -> Send -> Equipment management -> Live Chat.
 *
 * Deliberately NOT a DOM-element-highlighting tour (no getBoundingClientRect
 * measuring of sidebar items, no fragile CSS selector targeting that breaks
 * the moment someone reorders the sidebar). Instead it's a focused modal
 * sequence describing what to actually do, in the correct order — more
 * durable to maintain and just as useful for a small internal team.
 */
const TOUR_STEPS = [
  {
    title: "Welcome to the Bilm Technical Services Portal",
    body: "This quick walkthrough shows the actual day-to-day flow — how a website inquiry becomes a rental and gets billed. Takes about a minute.",
    icon: "👋",
  },
  {
    title: "1. Leads come in automatically",
    body: "When someone submits the \"Request a Quote\" form on the public website, it shows up here as a Lead — no action needed from you yet.",
    icon: "📥",
  },
  {
    title: "2. Convert a Lead to a Client",
    body: "Open the Leads panel and click the → CLIENT button on any lead. This creates a proper Client record you can create rentals against. You can also add a client directly if they didn't come through the website.",
    icon: "🤝",
  },
  {
    title: "3. Create a Rental",
    body: "In the Rentals panel, click + NEW RENTAL. Pick the client, pick equipment, set the dates. A draft Quote is calculated and linked automatically — rate × duration, done for you.",
    icon: "🚚",
  },
  {
    title: "4. Review & Send the Quote",
    body: "Open Quotations, double-check the auto-calculated amount (editable if needed), then click SEND. The client gets an emailed link to view and accept — no login required on their end.",
    icon: "📄",
  },
  {
    title: "5. Manage your Equipment Fleet",
    body: "Register generators, forklifts, and other equipment in the Equipment panel. This feeds both the Rentals dropdown and the public website's equipment showcase.",
    icon: "⚙️",
  },
  {
    title: "6. Live Chat with website visitors",
    body: "When someone opens the chat widget on your website, they'll appear here in real time. Click their name to reply directly.",
    icon: "💬",
  },
];

function TutorialTour({ onClose }) {
  const [step, setStep] = useState(0);
  const isLast = step === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[step];

  const finish = () => {
    localStorage.setItem("bilm_tour_completed", "true");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(6,14,28,0.85)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#0d1b2e", border: `1px solid ${G.green}30` }}>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-5">
          {TOUR_STEPS.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full" style={{ background: i <= step ? G.green : "rgba(255,255,255,0.1)" }} />
          ))}
        </div>

        <div className="text-4xl mb-3">{current.icon}</div>
        <div className="text-lg font-black mb-2" style={{ color: "white", fontFamily: "Barlow Condensed,sans-serif" }}>{current.title}</div>
        <div className="text-sm mb-6" style={{ color: G.muted, lineHeight: 1.6 }}>{current.body}</div>

        <div className="flex items-center justify-between">
          <button onClick={finish} className="text-xs font-bold" style={{ color: G.muted }}>
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                className="px-4 py-2 text-xs font-bold rounded-lg"
                style={{ background: "rgba(255,255,255,0.05)", color: G.muted, fontFamily: "Barlow Condensed,sans-serif" }}>
                BACK
              </button>
            )}
            <button onClick={() => isLast ? finish() : setStep(s => s + 1)}
              className="px-5 py-2 text-xs font-black rounded-lg"
              style={{ background: G.green, color: "#060e1c", fontFamily: "Barlow Condensed,sans-serif" }}>
              {isLast ? "GOT IT — START WORKING" : "NEXT"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ onBackToSite }) {
  const { user } = useAuth();
  const defaultPage = user?.role === "client" ? "client_dash" : "overview";
  const [active, setActive] = useState(defaultPage);
  const [sideOpen, setSideOpen] = useState(false);
  const page = PAGES[active] || PAGES.overview;

  // Show the tutorial tour once per browser, only for admin/staff
  // (clients get their own simpler portal — a full ops walkthrough
  // covering Leads/Rentals/Equipment doesn't apply to them).
  const [showTour, setShowTour] = useState(
    () => user?.role !== "client" && !localStorage.getItem("bilm_tour_completed")
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: G.bg }}>
      <Sidebar active={active} setActive={setActive} open={sideOpen} setOpen={setSideOpen} user={user} onBackToSite={onBackToSite} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar title={page.title} sub={page.sub} onMenu={() => setSideOpen(v => !v)} />
        <main className="flex-1 overflow-y-auto p-5 lg:p-6">
          {page.comp}
        </main>
      </div>
      {showTour && <TutorialTour onClose={() => setShowTour(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── ROOT: APP ROUTER ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * App flow:
 *  "landing"  → Public website (bilm-website). "PORTAL LOGIN" button → "login"
 *  "login"    → Login page. On success → "portal". "← Back" → "landing"
 *  "portal"   → Admin/Client dashboard. "← Website" in sidebar → "landing"
 *
 * If user already has a valid token (returning session), we bypass landing
 * and go straight to the portal. They can still navigate back.
 */
function AppRouter() {
  const { user, ready } = useAuth();
  // view: "landing" | "login" | "portal"
  const [view, setView] = useState("landing");

  // Once auth is resolved: if already logged in, jump to portal
  useEffect(() => {
    if (ready && user) setView("portal");
  }, [ready, user]);

  // When user logs in successfully, switch to portal
  useEffect(() => {
    if (user && view === "login") setView("portal");
  }, [user]);

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: G.bg }}>
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "12px", padding: "8px" }}>
          <img src={LOGO} alt="Bilm" style={{ height: 40, width: "auto", objectFit: "contain", display: "block" }} onError={e => { e.target.style.display = "none"; }} />
        </div>
        <div className="flex justify-center"><Spinner /></div>
      </div>
    </div>
  );

  if (view === "portal" && user) return <Dashboard onBackToSite={() => setView("landing")} />;
  if (view === "login" || (view === "portal" && !user)) return <LoginPage onBackToSite={() => setView("landing")} />;
  return <LandingPage onPortalLogin={() => setView("login")} />;
}

// ─── Global styles ────────────────────────────────────────────────────────────
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a1628; }
  input, select, textarea { color-scheme: dark; }
  input::placeholder, textarea::placeholder { color: rgba(143,173,200,0.5); }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0a1628; }
  ::-webkit-scrollbar-thumb { background: rgba(34,197,94,0.4); border-radius: 3px; }
`;

export default function App() {
  return (
    <AuthProvider>
      <style>{globalStyles}</style>
      <AppRouter />
    </AuthProvider>
  );
}
