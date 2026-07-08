import { useState, useEffect, useCallback, useRef } from "react";

// ─── Real Logo (embedded) ─────────────────────────────────────────────────────
const LOGO_SRC = "data:image/png;base64,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";

// ─── API Client ───────────────────────────────────────────────────────────────
// Change this line in bilm-dashboard-v2.jsx
const API = import.meta?.env?.VITE_API_URL || "http://localhost:8100/api";

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
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

// ─── Auth Context ─────────────────────────────────────────────────────────────
import { createContext, useContext } from "react";
const AuthCtx = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("bilm_token");
    if (token) {
      apiFetch("/auth/me")
        .then(setUser)
        .catch(() => localStorage.removeItem("bilm_token"))
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  const login = async (email, password) => {
    const form = new URLSearchParams({ username: email, password });
    const data = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    }).then(r => r.json());
    if (!data.access_token) throw new Error(data.detail || "Login failed");
    localStorage.setItem("bilm_token", data.access_token);
    const me = await apiFetch("/auth/me");
    setUser(me);
    return me;
  };

  const logout = () => {
    localStorage.removeItem("bilm_token");
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, login, logout, ready }}>{children}</AuthCtx.Provider>;
}
const useAuth = () => useContext(AuthCtx);

// ─── Data hook ────────────────────────────────────────────────────────────────
function useApi(path, deps = []) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const d = await apiFetch(path);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path, ...deps]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ico = {
  Dash:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  Users:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  Quote:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Truck:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  Wrench:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  Mail:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  Chart:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  Gear:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  Bell:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  Plus:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Check:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>,
  X:       ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Menu:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Arrow:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Eye:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Refresh: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  Save:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Shield:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg:"#060e1c", sidebar:"#080f1d", card:"#0c1829",
  border:"rgba(34,197,94,0.12)", green:"#22c55e",
  greenDim:"rgba(34,197,94,0.1)", text:"#c8d8eb",
  muted:"#5a7a9a", white:"#ffffff", blue:"#3b82f6",
  amber:"#f59e0b", red:"#ef4444",
};
const FH = "'Barlow Condensed',sans-serif";
const FB = "'Barlow',sans-serif";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const MAP = {
    new:{bg:"#3b82f6",l:"NEW"}, warm:{bg:"#f59e0b",l:"WARM"}, hot:{bg:"#ef4444",l:"HOT"},
    cold:{bg:"#6b7280",l:"COLD"}, converted:{bg:"#22c55e",l:"CONVERTED"},
    draft:{bg:"#6b7280",l:"DRAFT"}, sent:{bg:"#3b82f6",l:"SENT"},
    negotiating:{bg:"#f59e0b",l:"NEGOTIATING"}, accepted:{bg:"#22c55e",l:"ACCEPTED"},
    expired:{bg:"#ef4444",l:"EXPIRED"},
    active:{bg:"#22c55e",l:"ACTIVE"}, due:{bg:"#f59e0b",l:"DUE SOON"},
    overdue:{bg:"#ef4444",l:"OVERDUE"}, completed:{bg:"#6b7280",l:"COMPLETED"},
    scheduled:{bg:"#3b82f6",l:"SCHEDULED"}, in_progress:{bg:"#f59e0b",l:"IN PROGRESS"},
    queued:{bg:"#8b5cf6",l:"QUEUED"}, failed:{bg:"#ef4444",l:"FAILED"},
    cancelled:{bg:"#6b7280",l:"CANCELLED"},
  };
  const s = MAP[status] || {bg:"#6b7280",l:(status||"").toUpperCase()};
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold"
      style={{background:`${s.bg}22`,color:s.bg,border:`1px solid ${s.bg}55`,fontFamily:FH,letterSpacing:"0.08em"}}>
      {s.l}
    </span>
  );
}

function Card({children,className="",style={}}) {
  return <div className={`rounded-xl p-5 ${className}`} style={{background:C.card,border:`1px solid ${C.border}`,...style}}>{children}</div>;
}

function CardLabel({children}) {
  return <div className="text-xs font-bold tracking-widest mb-3" style={{color:C.green,fontFamily:FH}}>{children}</div>;
}

function KPICard({label,value,sub,icon,color=C.green,trend}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-bold tracking-widest mb-1" style={{color:C.muted,fontFamily:FH}}>{label}</div>
          <div className="font-black text-3xl" style={{color:"white",fontFamily:FH}}>{value??<Spin/>}</div>
          {sub&&<div className="text-xs mt-1" style={{color:C.muted}}>{sub}</div>}
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{background:`${color}18`,border:`1px solid ${color}44`}}>
          <span style={{color}}>{icon}</span>
        </div>
      </div>
      {trend!==undefined&&(
        <div className="mt-3 text-xs font-bold" style={{color:trend>=0?C.green:C.red,fontFamily:FH}}>
          {trend>=0?"▲":"▼"} {Math.abs(trend)}% this month
        </div>
      )}
    </Card>
  );
}

function Spin() {
  return <span className="inline-block w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor:`${C.green} transparent transparent transparent`}}/>;
}

function Err({msg}) {
  return <div className="p-4 rounded-lg text-sm" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)"}}>{msg}</div>;
}

function EmptyState({msg="No records found"}) {
  return <div className="py-12 text-center" style={{color:C.muted,fontFamily:FH,fontSize:"0.8rem",letterSpacing:"0.1em"}}>{msg.toUpperCase()}</div>;
}

function HealthBar({pct}) {
  const col=pct>=80?C.green:pct>=60?C.amber:C.red;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full h-1.5" style={{background:"rgba(255,255,255,0.08)"}}>
        <div className="h-1.5 rounded-full" style={{width:`${pct}%`,background:col}}/>
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{color:col,fontFamily:FH}}>{pct}%</span>
    </div>
  );
}

function MiniBar({data,color=C.green}) {
  const max=Math.max(...data.map(d=>d.v),1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d,i)=>(
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-sm" style={{height:`${(d.v/max)*48}px`,background:color,opacity:0.85}}/>
          <span style={{color:C.muted,fontFamily:FH,fontSize:"0.55rem"}}>{d.l}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage() {
  const {login}=useAuth();
  const [form,setForm]=useState({email:"",password:""});
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  const submit=async()=>{
    setErr(""); setLoading(true);
    try { await login(form.email,form.password); }
    catch(e){ setErr(e.message); }
    finally{ setLoading(false); }
  };

  const inp={background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,
    color:"white",borderRadius:"0.5rem",padding:"0.75rem 1rem",width:"100%",
    fontSize:"0.875rem",fontFamily:FB,outline:"none"};

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background:C.bg}}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={LOGO_SRC} alt="Bilm Technical Services" className="h-16 mx-auto mb-4 object-contain"/>
          <div className="text-xs tracking-widest font-bold" style={{color:C.green,fontFamily:FH}}>ADMIN / CLIENT PORTAL</div>
        </div>
        <Card>
          <CardLabel>SIGN IN</CardLabel>
          {err&&<div className="mb-4"><Err msg={err}/></div>}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold tracking-widest mb-1.5" style={{color:C.muted,fontFamily:FH}}>EMAIL</label>
              <input type="email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))}
                placeholder="admin@bilmtechnical.com" style={inp}/>
            </div>
            <div>
              <label className="block text-xs font-bold tracking-widest mb-1.5" style={{color:C.muted,fontFamily:FH}}>PASSWORD</label>
              <input type="password" value={form.password} onChange={e=>setForm(v=>({...v,password:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••" style={inp}/>
            </div>
            <button onClick={submit} disabled={loading}
              className="w-full py-3 font-black text-sm tracking-widest rounded transition-all hover:opacity-90 disabled:opacity-50"
              style={{background:C.green,color:"#0a1628",fontFamily:FH}}>
              {loading?"SIGNING IN...":"SIGN IN"}
            </button>
          </div>
        </Card>
        <p className="text-center text-xs mt-4" style={{color:C.muted}}>Bilm Technical Services · BTS/IL/0069</p>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({active,setActive,open,setOpen,user}) {
  const {logout}=useAuth();
  const isAdmin=user?.role==="admin"||user?.role==="staff";

  const adminNav=[
    {key:"overview",    label:"OVERVIEW",    icon:<Ico.Dash/>},
    {key:"leads",       label:"LEADS",       icon:<Ico.Users/>},
    {key:"clients",     label:"CLIENTS",     icon:<Ico.Shield/>},
    {key:"quotes",      label:"QUOTATIONS",  icon:<Ico.Quote/>},
    {key:"rentals",     label:"RENTALS",     icon:<Ico.Truck/>},
    {key:"maintenance", label:"MAINTENANCE", icon:<Ico.Wrench/>},
    {key:"email_logs",  label:"EMAIL LOGS",  icon:<Ico.Mail/>},
    {key:"templates",   label:"EMAIL TMPL",  icon:<Ico.Mail/>},
    {key:"settings",    label:"SETTINGS",    icon:<Ico.Gear/>},
    {key:"reports",     label:"REPORTS",     icon:<Ico.Chart/>},
  ];
  const clientNav=[
    {key:"client_dash",   label:"DASHBOARD",     icon:<Ico.Dash/>},
    {key:"client_quotes", label:"MY QUOTES",     icon:<Ico.Quote/>},
    {key:"client_rentals",label:"MY EQUIPMENT",  icon:<Ico.Truck/>},
  ];
  const nav=isAdmin?adminNav:clientNav;

  return (
    <>
      <aside className={`fixed lg:static z-40 inset-y-0 left-0 w-56 flex flex-col transition-transform duration-300 ${open?"translate-x-0":"-translate-x-full lg:translate-x-0"}`}
        style={{background:C.sidebar,borderRight:`1px solid ${C.border}`}}>
        <div className="px-4 py-4 flex items-center justify-center" style={{borderBottom:`1px solid ${C.border}`}}>
          <img src={LOGO_SRC} alt="Bilm Technical Services" className="h-10 object-contain"/>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {nav.map(n=>(
            <button key={n.key} onClick={()=>{setActive(n.key);setOpen(false);}}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-left transition-all duration-150"
              style={{
                background:active===n.key?C.greenDim:"transparent",
                color:active===n.key?C.green:C.muted,
                borderLeft:active===n.key?`3px solid ${C.green}`:"3px solid transparent",
              }}>
              <span>{n.icon}</span>
              <span className="text-xs font-bold tracking-wider" style={{fontFamily:FH}}>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3" style={{borderTop:`1px solid ${C.border}`}}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold" style={{color:"white",fontFamily:FH}}>{user?.full_name||user?.email}</div>
              <div style={{color:C.green,fontSize:"0.55rem",fontFamily:FH,letterSpacing:"0.1em"}}>{user?.role?.toUpperCase()}</div>
            </div>
            <button onClick={logout} className="text-xs px-2 py-1 rounded" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",fontFamily:FH}}>OUT</button>
          </div>
        </div>
      </aside>
      {open&&<div className="fixed inset-0 z-30 bg-black bg-opacity-60 lg:hidden" onClick={()=>setOpen(false)}/>}
    </>
  );
}

// ─── Admin Overview ───────────────────────────────────────────────────────────
function AdminOverview() {
  const {data:kpi,loading,error,reload}=useApi("/reports/overview");
  const {data:flu}=useApi("/reports/fleet-utilization");
  const {data:rev}=useApi("/reports/revenue?months=6");
  const {data:pipe}=useApi("/reports/leads-pipeline");

  const revData=rev?.map(r=>({l:r.period?.slice(0,3)||"",v:Number(r.revenue)||0}))||[];
  const pipeArr=pipe?Object.entries(pipe).map(([k,v])=>({l:k.slice(0,4).toUpperCase(),v})):[];

  if(error)return <Err msg={error}/>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold tracking-widest" style={{color:C.muted,fontFamily:FH}}>LIVE DATA FROM BACKEND</div>
        <button onClick={reload} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-bold"
          style={{background:C.greenDim,color:C.green,fontFamily:FH}}>
          <Ico.Refresh/> REFRESH
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="ACTIVE LEADS"    value={kpi?.total_leads??<Spin/>} sub={`${kpi?.hot_leads||0} hot`}   icon={<Ico.Users/>}/>
        <KPICard label="OPEN QUOTES"     value={kpi?.open_quotes??<Spin/>} sub={kpi?.open_quotes_value?`₦${Number(kpi.open_quotes_value).toLocaleString()}`:""}  icon={<Ico.Quote/>} color={C.blue}/>
        <KPICard label="ACTIVE RENTALS"  value={kpi?.active_rentals??<Spin/>} sub={kpi?.overdue_rentals?`${kpi.overdue_rentals} overdue`:""} icon={<Ico.Truck/>} color={C.amber}/>
        <KPICard label="QUEUED EMAILS"   value={kpi?.queued_emails??<Spin/>} icon={<Ico.Mail/>} color="#8b5cf6"/>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardLabel>FLEET STATUS</CardLabel>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span style={{color:C.muted}}>Total Fleet</span><span className="font-bold" style={{color:"white"}}>{flu?.total??"—"}</span></div>
            <div className="flex justify-between"><span style={{color:C.muted}}>In Use</span><span className="font-bold" style={{color:C.amber}}>{flu?.in_use??"—"}</span></div>
            <div className="flex justify-between"><span style={{color:C.muted}}>Available</span><span className="font-bold" style={{color:C.green}}>{flu?.available??"—"}</span></div>
            <div className="flex justify-between"><span style={{color:C.muted}}>Utilization</span><span className="font-bold" style={{color:C.blue}}>{flu?.utilization_pct??"—"}%</span></div>
            <div className="flex justify-between"><span style={{color:C.muted}}>Avg Health</span><span className="font-bold" style={{color:C.green}}>{flu?.avg_health_score??"—"}%</span></div>
          </div>
        </Card>
        <Card><CardLabel>REVENUE TREND (₦M)</CardLabel>
          {revData.length?<MiniBar data={revData.map(r=>({...r,v:r.v/1_000_000}))} color={C.green}/>:<EmptyState msg="No data"/>}
        </Card>
        <Card><CardLabel>LEADS PIPELINE</CardLabel>
          {pipeArr.length?<MiniBar data={pipeArr} color={C.blue}/>:<EmptyState msg="No data"/>}
        </Card>
      </div>
    </div>
  );
}

// ─── Leads Panel ─────────────────────────────────────────────────────────────
function LeadsPanel() {
  const [filter,setFilter]=useState("");
  const [search,setSearch]=useState("");
  const path=`/leads?size=50${filter?`&status=${filter}`:""}${search?`&search=${search}`:""}`;
  const {data,loading,error,reload}=useApi(path,[filter,search]);
  const leads=data?.items||[];

  const updateStatus=async(id,status)=>{
    await apiFetch(`/leads/${id}`,{method:"PATCH",body:JSON.stringify({status})});
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {["","hot","warm","new","cold","converted"].map(s=>(
            <button key={s} onClick={()=>setFilter(s)}
              className="px-3 py-1.5 text-xs font-bold tracking-wider rounded"
              style={{fontFamily:FH,background:filter===s?C.green:"rgba(255,255,255,0.05)",
                color:filter===s?"#0a1628":C.muted,border:`1px solid ${filter===s?C.green:C.border}`}}>
              {s||"ALL"}
            </button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search company..."
          className="px-3 py-1.5 rounded text-xs" style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,color:"white",fontFamily:FB,outline:"none",width:180}}/>
      </div>
      {loading&&<div className="flex justify-center py-8"><Spin/></div>}
      {error&&<Err msg={error}/>}
      {!loading&&!leads.length&&<EmptyState msg="No leads found"/>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {leads.map(l=>(
          <Card key={l.id}>
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-bold" style={{color:C.green,fontFamily:FH}}>{l.ref_code}</span>
              <Badge status={l.status}/>
            </div>
            <div className="font-black text-sm mb-1" style={{color:"white",fontFamily:FH}}>{l.company_name?.toUpperCase()}</div>
            <div className="text-xs mb-2" style={{color:C.muted}}>{l.contact_person||"—"} · {l.email}</div>
            <div className="grid grid-cols-2 gap-1 text-xs mb-3">
              <span style={{color:C.muted}}>Service: <span style={{color:C.text}}>{l.service_type||"—"}</span></span>
              <span style={{color:C.muted}}>Equipment: <span style={{color:C.text}}>{l.equipment_type||"—"}</span></span>
              {l.estimated_value&&<span style={{color:C.muted}}>Value: <span className="font-bold" style={{color:C.green}}>₦{Number(l.estimated_value).toLocaleString()}</span></span>}
              <span style={{color:C.muted}}>Source: <span style={{color:C.text}}>{l.source}</span></span>
            </div>
            <div className="flex gap-2">
              <select onChange={e=>updateStatus(l.id,e.target.value)} value={l.status}
                className="flex-1 text-xs rounded py-1.5 px-2 font-bold"
                style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,color:C.green,fontFamily:FH,outline:"none"}}>
                {["new","warm","hot","cold","converted","lost"].map(s=><option key={s} value={s} style={{background:C.card}}>{s.toUpperCase()}</option>)}
              </select>
              <button className="px-3 py-1.5 text-xs font-bold rounded" style={{background:C.greenDim,color:C.green,fontFamily:FH}}>
                <Ico.Eye/>
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Quotes Panel ─────────────────────────────────────────────────────────────
function QuotesPanel() {
  const [statusF,setStatusF]=useState("");
  const path=`/quotes?size=30${statusF?`&status=${statusF}`:""}`;
  const {data,loading,error,reload}=useApi(path,[statusF]);
  const quotes=data?.items||[];

  const sendQuote=async(id)=>{
    await apiFetch(`/quotes/${id}/send`,{method:"POST"});
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {["","draft","sent","negotiating","accepted","expired"].map(s=>(
            <button key={s} onClick={()=>setStatusF(s)}
              className="px-3 py-1.5 text-xs font-bold tracking-wider rounded"
              style={{fontFamily:FH,background:statusF===s?C.green:"rgba(255,255,255,0.05)",
                color:statusF===s?"#0a1628":C.muted,border:`1px solid ${statusF===s?C.green:C.border}`}}>
              {s||"ALL"}
            </button>
          ))}
        </div>
      </div>
      {loading&&<div className="flex justify-center py-8"><Spin/></div>}
      {error&&<Err msg={error}/>}
      <Card style={{padding:0}}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
              {["Quote #","Service","Amount","Status","Valid Until","Actions"].map(h=>(
                <th key={h} className="py-3 px-4 text-left text-xs font-bold tracking-wider" style={{color:C.muted,fontFamily:FH}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {!quotes.length&&<tr><td colSpan={6}><EmptyState msg="No quotes"/></td></tr>}
              {quotes.map((q,i)=>(
                <tr key={q.id} style={{borderBottom:i<quotes.length-1?`1px solid rgba(255,255,255,0.04)`:"none"}}>
                  <td className="py-3 px-4 text-xs font-black" style={{color:C.green,fontFamily:FH}}>{q.quote_number}</td>
                  <td className="py-3 px-4 text-xs" style={{color:C.text,maxWidth:200}}>{q.service_desc||"—"}</td>
                  <td className="py-3 px-4 text-xs font-bold" style={{color:C.green}}>{q.amount?`₦${Number(q.amount).toLocaleString()}`:"TBD"}</td>
                  <td className="py-3 px-4"><Badge status={q.status}/></td>
                  <td className="py-3 px-4 text-xs" style={{color:C.muted}}>{q.valid_until||"—"}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1">
                      {q.status==="draft"&&(
                        <button onClick={()=>sendQuote(q.id)} className="px-2 py-1 text-xs font-bold rounded" style={{background:C.greenDim,color:C.green,fontFamily:FH}}>SEND</button>
                      )}
                    </div>
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

// ─── Rentals Panel ────────────────────────────────────────────────────────────
function RentalsPanel() {
  const [statusF,setStatusF]=useState("");
  const path=`/rentals?size=30${statusF?`&status=${statusF}`:""}`;
  const {data,loading,error}=useApi(path,[statusF]);
  const rentals=data?.items||[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["","active","due","overdue","completed"].map(s=>(
          <button key={s} onClick={()=>setStatusF(s)}
            className="px-3 py-1.5 text-xs font-bold rounded"
            style={{fontFamily:FH,background:statusF===s?C.green:"rgba(255,255,255,0.05)",
              color:statusF===s?"#0a1628":C.muted,border:`1px solid ${statusF===s?C.green:C.border}`}}>
            {s||"ALL"}
          </button>
        ))}
      </div>
      {loading&&<div className="flex justify-center py-8"><Spin/></div>}
      {error&&<Err msg={error}/>}
      <div className="space-y-3">
        {!rentals.length&&!loading&&<EmptyState msg="No rentals found"/>}
        {rentals.map(r=>(
          <Card key={r.id}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-black text-sm" style={{color:"white",fontFamily:FH}}>{r.equipment?.name||r.rental_code}</span>
                  <span className="text-xs font-bold" style={{color:C.green,fontFamily:FH}}>{r.rental_code}</span>
                </div>
                <div className="text-xs mb-1" style={{color:C.muted}}>{r.client?.company_name||`Client #${r.client_id}`}</div>
                <div className="text-xs" style={{color:C.muted}}>{r.start_date} → {r.end_date}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge status={r.status}/>
                <div className="w-32"><HealthBar pct={r.health_score}/></div>
                {r.monthly_rate&&<div className="text-xs font-bold" style={{color:C.green}}>₦{Number(r.monthly_rate).toLocaleString()}/mo</div>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Maintenance Panel ────────────────────────────────────────────────────────
function MaintenancePanel() {
  const {data,loading,error,reload}=useApi("/maintenance?size=30");
  const records=data?.items||[];

  const startMaint=async(id)=>{
    await apiFetch(`/maintenance/${id}/start`,{method:"PATCH"});
    reload();
  };

  return (
    <div className="space-y-4">
      {loading&&<div className="flex justify-center py-8"><Spin/></div>}
      {error&&<Err msg={error}/>}
      <div className="grid md:grid-cols-2 gap-4">
        {!records.length&&!loading&&<EmptyState msg="No maintenance records"/>}
        {records.map(m=>(
          <Card key={m.id}>
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-black" style={{color:C.green,fontFamily:FH}}>{m.maint_code}</span>
              <Badge status={m.status}/>
            </div>
            <div className="font-black text-sm mb-1" style={{color:"white",fontFamily:FH}}>EQUIPMENT #{m.equipment_id}</div>
            <div className="grid grid-cols-2 gap-1 text-xs mt-2">
              <span style={{color:C.muted}}>Type: <span style={{color:m.maint_type==="emergency"?C.red:C.text}}>{m.maint_type}</span></span>
              <span style={{color:C.muted}}>Tech: <span style={{color:C.text}}>{m.technician||"TBD"}</span></span>
              <span style={{color:C.muted}}>Date: <span style={{color:C.text}}>{m.scheduled_date||"—"}</span></span>
              {m.cost&&<span style={{color:C.muted}}>Cost: <span style={{color:C.green}}>₦{Number(m.cost).toLocaleString()}</span></span>}
            </div>
            {m.status==="scheduled"&&(
              <button onClick={()=>startMaint(m.id)} className="mt-3 w-full py-1.5 text-xs font-bold rounded"
                style={{background:C.greenDim,color:C.green,fontFamily:FH}}>
                MARK IN PROGRESS
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Email Logs Panel ─────────────────────────────────────────────────────────
function EmailLogsPanel() {
  const [statusF,setStatusF]=useState("");
  const path=`/email-logs?size=30${statusF?`&status=${statusF}`:""}`;
  const {data,loading,error}=useApi(path,[statusF]);
  const logs=data?.items||[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["","queued","sent","failed","cancelled"].map(s=>(
          <button key={s} onClick={()=>setStatusF(s)}
            className="px-3 py-1.5 text-xs font-bold rounded"
            style={{fontFamily:FH,background:statusF===s?C.green:"rgba(255,255,255,0.05)",
              color:statusF===s?"#0a1628":C.muted,border:`1px solid ${statusF===s?C.green:C.border}`}}>
            {s||"ALL"}
          </button>
        ))}
      </div>
      {loading&&<div className="flex justify-center py-8"><Spin/></div>}
      {error&&<Err msg={error}/>}
      <Card style={{padding:0}}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
              {["Recipient","Template","Subject","Scheduled","Status"].map(h=>(
                <th key={h} className="py-3 px-4 text-left text-xs font-bold tracking-wider" style={{color:C.muted,fontFamily:FH}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {!logs.length&&<tr><td colSpan={5}><EmptyState msg="No email logs"/></td></tr>}
              {logs.map((l,i)=>(
                <tr key={l.id} style={{borderBottom:i<logs.length-1?`1px solid rgba(255,255,255,0.04)`:"none"}}>
                  <td className="py-3 px-4 text-xs font-bold" style={{color:"white"}}>{l.recipient_name||l.recipient_email}</td>
                  <td className="py-3 px-4 text-xs" style={{color:C.muted}}>{l.template_slug||"—"}</td>
                  <td className="py-3 px-4 text-xs" style={{color:C.text,maxWidth:200}}>{l.subject||"—"}</td>
                  <td className="py-3 px-4 text-xs" style={{color:C.muted}}>{l.scheduled_at||l.sent_at||"—"}</td>
                  <td className="py-3 px-4"><Badge status={l.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Email Templates Editor ───────────────────────────────────────────────────
function TemplatesPanel() {
  const {data,loading,error,reload}=useApi("/email-templates");
  const [selected,setSelected]=useState(null);
  const [editing,setEditing]=useState(null);
  const [saving,setSaving]=useState(false);
  const [testEmail,setTestEmail]=useState("");
  const [msg,setMsg]=useState("");

  const openEdit=(t)=>{setSelected(t);setEditing({...t});setMsg("");};

  const save=async()=>{
    setSaving(true);
    try{
      await apiFetch(`/email-templates/${editing.slug}`,{
        method:"PUT",
        body:JSON.stringify({name:editing.name,subject:editing.subject,body_html:editing.body_html,body_text:editing.body_text,is_active:editing.is_active})
      });
      setMsg("✅ Template saved successfully");
      reload();
    }catch(e){setMsg("❌ "+e.message);}
    finally{setSaving(false);}
  };

  const sendTest=async()=>{
    if(!testEmail)return;
    try{
      await apiFetch(`/email-templates/${editing.slug}/send-test`,{
        method:"POST",
        body:JSON.stringify({recipient_email:testEmail,context:{}})
      });
      setMsg(`✅ Test email sent to ${testEmail}`);
    }catch(e){setMsg("❌ "+e.message);}
  };

  const inp={background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,color:"white",
    borderRadius:"0.5rem",padding:"0.6rem 0.8rem",width:"100%",fontSize:"0.8rem",fontFamily:FB,outline:"none"};

  return (
    <div className="grid lg:grid-cols-3 gap-4 h-full">
      {/* Template list */}
      <div className="space-y-2">
        <CardLabel>EMAIL TEMPLATES ({data?.length||0})</CardLabel>
        {loading&&<Spin/>}
        {(data||[]).map(t=>(
          <button key={t.slug} onClick={()=>openEdit(t)}
            className="w-full text-left p-3 rounded-lg transition-all"
            style={{background:selected?.slug===t.slug?C.greenDim:"rgba(255,255,255,0.03)",
              border:`1px solid ${selected?.slug===t.slug?C.green:C.border}`}}>
            <div className="text-xs font-bold" style={{color:"white",fontFamily:FH}}>{t.name}</div>
            <div className="text-xs mt-0.5" style={{color:C.muted}}>{t.slug}</div>
            <div className="mt-1"><Badge status={t.is_active?"active":"cancelled"}/></div>
          </button>
        ))}
      </div>

      {/* Editor */}
      {editing?(
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <CardLabel>EDITING: {editing.name}</CardLabel>
            <div className="flex gap-2">
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded"
                style={{background:C.green,color:"#0a1628",fontFamily:FH}}>
                <Ico.Save/> {saving?"SAVING...":"SAVE"}
              </button>
            </div>
          </div>
          {msg&&<div className="text-xs p-2 rounded" style={{background:"rgba(34,197,94,0.08)",color:msg.startsWith("✅")?C.green:C.red,border:`1px solid ${C.border}`}}>{msg}</div>}
          <div>
            <label className="block text-xs font-bold tracking-widest mb-1" style={{color:C.muted,fontFamily:FH}}>TEMPLATE NAME</label>
            <input value={editing.name} onChange={e=>setEditing(v=>({...v,name:e.target.value}))} style={inp}/>
          </div>
          <div>
            <label className="block text-xs font-bold tracking-widest mb-1" style={{color:C.muted,fontFamily:FH}}>SUBJECT LINE (Jinja2 vars: {"{{lead_company}}"} etc.)</label>
            <input value={editing.subject} onChange={e=>setEditing(v=>({...v,subject:e.target.value}))} style={inp}/>
          </div>
          <div>
            <label className="block text-xs font-bold tracking-widest mb-1" style={{color:C.muted,fontFamily:FH}}>HTML BODY (Jinja2 template)</label>
            <textarea rows={16} value={editing.body_html} onChange={e=>setEditing(v=>({...v,body_html:e.target.value}))}
              style={{...inp,resize:"vertical",fontFamily:"'Courier New',monospace",fontSize:"0.72rem",lineHeight:1.5}}/>
          </div>
          <div>
            <label className="block text-xs font-bold tracking-widest mb-1" style={{color:C.muted,fontFamily:FH}}>PLAIN TEXT FALLBACK</label>
            <textarea rows={4} value={editing.body_text||""} onChange={e=>setEditing(v=>({...v,body_text:e.target.value}))}
              style={{...inp,resize:"vertical"}}/>
          </div>
          {editing.variables?.length>0&&(
            <div className="p-3 rounded-lg" style={{background:"rgba(34,197,94,0.05)",border:`1px solid ${C.border}`}}>
              <div className="text-xs font-bold mb-2" style={{color:C.green,fontFamily:FH}}>AVAILABLE VARIABLES</div>
              <div className="flex flex-wrap gap-1.5">
                {editing.variables.map(v=>(
                  <code key={v} className="text-xs px-1.5 py-0.5 rounded" style={{background:"rgba(255,255,255,0.06)",color:C.text}}>{"{{"+v+"}}"}</code>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 items-center">
            <input value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder="test@email.com"
              style={{...inp,width:"auto",flex:1}}/>
            <button onClick={sendTest} className="px-3 py-2 text-xs font-bold rounded whitespace-nowrap"
              style={{background:"rgba(59,130,246,0.15)",color:C.blue,border:`1px solid rgba(59,130,246,0.3)`,fontFamily:FH}}>
              SEND TEST
            </button>
          </div>
        </div>
      ):(
        <div className="lg:col-span-2 flex items-center justify-center" style={{color:C.muted}}>
          <div className="text-center">
            <div className="text-4xl mb-3">✉️</div>
            <div className="text-xs font-bold tracking-widest" style={{fontFamily:FH}}>SELECT A TEMPLATE TO EDIT</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel() {
  const {data,loading,error,reload}=useApi("/settings");
  const [vals,setVals]=useState({});
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");

  useEffect(()=>{
    if(data) setVals(Object.fromEntries(data.map(s=>[s.key,s.value||""])));
  },[data]);

  const save=async()=>{
    setSaving(true);
    try{
      await apiFetch("/settings/bulk",{method:"PUT",body:JSON.stringify(vals)});
      setMsg("✅ Settings saved!");
    }catch(e){setMsg("❌ "+e.message);}
    finally{setSaving(false);}
  };

  const inp={background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,color:"white",
    borderRadius:"0.5rem",padding:"0.6rem 0.8rem",width:"100%",fontSize:"0.8rem",fontFamily:FB,outline:"none"};

  if(loading)return <div className="flex justify-center py-12"><Spin/></div>;
  if(error)return <Err msg={error}/>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <CardLabel>COMPANY SETTINGS</CardLabel>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded"
          style={{background:C.green,color:"#0a1628",fontFamily:FH}}>
          <Ico.Save/> {saving?"SAVING...":"SAVE ALL"}
        </button>
      </div>
      {msg&&<div className="text-xs p-2 rounded" style={{background:"rgba(34,197,94,0.08)",color:msg.startsWith("✅")?C.green:C.red}}>{msg}</div>}
      <div className="grid md:grid-cols-2 gap-4">
        {(data||[]).map(s=>(
          <div key={s.key}>
            <label className="block text-xs font-bold tracking-widest mb-1" style={{color:C.muted,fontFamily:FH}}>{s.key.toUpperCase().replace(/_/g," ")}</label>
            {s.description&&<div className="text-xs mb-1" style={{color:C.muted,fontSize:"0.6rem"}}>{s.description}</div>}
            <input value={vals[s.key]||""} onChange={e=>setVals(v=>({...v,[s.key]:e.target.value}))} style={inp}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reports Panel ────────────────────────────────────────────────────────────
function ReportsPanel() {
  const {data:kpi} =useApi("/reports/overview");
  const {data:flu} =useApi("/reports/fleet-utilization");
  const {data:rev} =useApi("/reports/revenue?months=12");
  const {data:pipe}=useApi("/reports/leads-pipeline");

  const revData=(rev||[]).map(r=>({l:r.period?.slice(0,3)||"",v:Number(r.revenue)/1_000_000||0}));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="TOTAL LEADS"     value={kpi?.total_leads??<Spin/>}    icon={<Ico.Users/>}/>
        <KPICard label="OPEN QUOTES VAL" value={kpi?.open_quotes_value?`₦${(Number(kpi.open_quotes_value)/1e6).toFixed(1)}M`:<Spin/>} icon={<Ico.Quote/>} color={C.blue}/>
        <KPICard label="FLEET UTILIZ."   value={flu?`${flu.utilization_pct}%`:<Spin/>} icon={<Ico.Truck/>} color={C.amber}/>
        <KPICard label="AVG HEALTH"      value={flu?`${flu.avg_health_score}%`:<Spin/>} icon={<Ico.Shield/>}/>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardLabel>MONTHLY REVENUE (₦M)</CardLabel>
          {revData.length?<MiniBar data={revData} color={C.green}/>:<EmptyState msg="No revenue data"/>}
        </Card>
        <Card><CardLabel>LEADS BY STATUS</CardLabel>
          {pipe?(
            <div className="space-y-2">
              {Object.entries(pipe).map(([k,v])=>(
                <div key={k} className="flex items-center gap-3">
                  <span className="text-xs w-24" style={{color:C.text,fontFamily:FH}}>{k.toUpperCase()}</span>
                  <div className="flex-1 h-2 rounded-full" style={{background:"rgba(255,255,255,0.06)"}}>
                    <div className="h-2 rounded-full" style={{width:`${Math.min(v*10,100)}%`,background:C.blue}}/>
                  </div>
                  <span className="text-xs font-bold w-6 text-right" style={{color:C.blue}}>{v}</span>
                </div>
              ))}
            </div>
          ):<EmptyState msg="No pipeline data"/>}
        </Card>
      </div>
    </div>
  );
}

// ─── Client Dashboard ─────────────────────────────────────────────────────────
function ClientDash() {
  const {data:quotes,loading:ql}=useApi("/quotes/my");
  const {data:rentals,loading:rl}=useApi("/rentals/my");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard label="MY RENTALS"  value={rentals?.length??<Spin/>} icon={<Ico.Truck/>}/>
        <KPICard label="MY QUOTES"   value={quotes?.length??<Spin/>}  icon={<Ico.Quote/>} color={C.blue}/>
        <KPICard label="ACTIVE"      value={rentals?.filter(r=>r.status==="active").length??<Spin/>} icon={<Ico.Check/>}/>
      </div>
      <Card>
        <CardLabel>MY ACTIVE EQUIPMENT</CardLabel>
        {rl&&<div className="flex justify-center py-4"><Spin/></div>}
        {(rentals||[]).filter(r=>r.status!=="completed").map(r=>(
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 p-3 mb-2 rounded-lg"
            style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`}}>
            <div>
              <div className="font-black text-sm" style={{color:"white",fontFamily:FH}}>{r.equipment?.name||r.rental_code}</div>
              <div className="text-xs" style={{color:C.muted}}>{r.start_date} → {r.end_date}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge status={r.status}/>
              <div className="w-28"><HealthBar pct={r.health_score}/></div>
            </div>
          </div>
        ))}
        {!rl&&!rentals?.length&&<EmptyState msg="No active rentals"/>}
      </Card>
      <Card>
        <CardLabel>MY RECENT QUOTES</CardLabel>
        {ql&&<div className="flex justify-center py-4"><Spin/></div>}
        {(quotes||[]).slice(0,5).map(q=>(
          <div key={q.id} className="flex items-center justify-between p-3 mb-2 rounded-lg"
            style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`}}>
            <div>
              <div className="text-xs font-bold" style={{color:C.green,fontFamily:FH}}>{q.quote_number}</div>
              <div className="text-xs" style={{color:C.muted}}>{q.service_desc||"—"}</div>
            </div>
            <div className="flex items-center gap-3">
              {q.amount&&<span className="text-sm font-black" style={{color:C.green,fontFamily:FH}}>₦{Number(q.amount).toLocaleString()}</span>}
              <Badge status={q.status}/>
            </div>
          </div>
        ))}
        {!ql&&!quotes?.length&&<EmptyState msg="No quotes found"/>}
      </Card>
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
function Topbar({title,open,setOpen}) {
  return (
    <header className="flex items-center justify-between px-4 py-3 flex-shrink-0"
      style={{background:"#080f1d",borderBottom:`1px solid rgba(34,197,94,0.12)`}}>
      <div className="flex items-center gap-3">
        <button className="lg:hidden" onClick={()=>setOpen(v=>!v)} style={{color:"#c8d8eb"}}><Ico.Menu/></button>
        <div>
          <div className="font-black text-base tracking-wide" style={{color:"white",fontFamily:FH}}>{title}</div>
          <div style={{color:"#5a7a9a",fontSize:"0.6rem",fontFamily:FH,letterSpacing:"0.12em"}}>BILM TECHNICAL SERVICES · BTS/IL/0069</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{background:"rgba(34,197,94,0.1)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.2)"}}>
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background:"#22c55e",animation:"pulse 2s infinite"}}/>
        <span style={{fontFamily:FH}}>LIVE</span>
      </div>
    </header>
  );
}

// ─── Main Dashboard Shell ─────────────────────────────────────────────────────
const PAGES = {
  overview:         {title:"Business Overview",    comp:<AdminOverview/>},
  leads:            {title:"Lead Management",      comp:<LeadsPanel/>},
  clients:          {title:"Client Management",    comp:<div className="py-8"><EmptyState msg="Clients panel — use leads to convert"/></div>},
  quotes:           {title:"Quotations",           comp:<QuotesPanel/>},
  rentals:          {title:"Rental Tracking",      comp:<RentalsPanel/>},
  maintenance:      {title:"Maintenance Scheduler",comp:<MaintenancePanel/>},
  email_logs:       {title:"Email Logs",           comp:<EmailLogsPanel/>},
  templates:        {title:"Email Templates",      comp:<TemplatesPanel/>},
  settings:         {title:"Company Settings",     comp:<SettingsPanel/>},
  reports:          {title:"Reports & Analytics",  comp:<ReportsPanel/>},
  client_dash:      {title:"My Dashboard",         comp:<ClientDash/>},
  client_quotes:    {title:"My Quotations",        comp:<QuotesPanel/>},
  client_rentals:   {title:"My Equipment",         comp:<RentalsPanel/>},
};

function Dashboard() {
  const {user}=useAuth();
  const defaultPage=user?.role==="client"?"client_dash":"overview";
  const [active,setActive]=useState(defaultPage);
  const [sideOpen,setSideOpen]=useState(false);

  const page=PAGES[active]||PAGES.overview;

  return (
    <div className="flex h-screen overflow-hidden" style={{background:C.bg,fontFamily:FB}}>
      <Sidebar active={active} setActive={setActive} open={sideOpen} setOpen={setSideOpen} user={user}/>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={page.title} open={sideOpen} setOpen={setSideOpen}/>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {page.comp}
        </main>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#060e1c;overflow:hidden;}
        input,select,textarea{color-scheme:dark;}
        input::placeholder,textarea::placeholder{color:rgba(90,122,154,0.6);}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:#060e1c;}
        ::-webkit-scrollbar-thumb{background:rgba(34,197,94,0.3);border-radius:3px;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .animate-spin{animation:spin .8s linear infinite;}
      `}</style>
      <AuthProvider>
        <AppRouter/>
      </AuthProvider>
    </>
  );
}

function AppRouter() {
  const {user,ready}=useAuth();
  if(!ready) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:"#060e1c"}}>
      <div className="text-center">
        <img src={LOGO_SRC} alt="Bilm" className="h-12 mx-auto mb-4 object-contain opacity-60"/>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto" style={{borderColor:"#22c55e transparent transparent transparent",animation:"spin .8s linear infinite"}}/>
      </div>
    </div>
  );
  return user ? <Dashboard/> : <LoginPage/>;
}
