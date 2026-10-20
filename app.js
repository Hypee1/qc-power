import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "../vendor/firebase.js";
import { auth, EMU } from "./fb.js";
import { ACCOUNTS, APP } from "./config.js";
import { html, render, useState, useEffect, useRef, Icon, Toasts, ConfirmHost, toast, pad } from "./ui.js";
import { session, isAdmin, logAccess, startSession, endSession, heartbeat, watchSegnalazioni, invalidate, list, audit } from "./store.js";
import { Dashboard } from "./views/dashboard.js";
import { ControlloForm } from "./views/controllo.js";
import { RegistroControlli } from "./views/registro-controlli.js";
import { NCForm } from "./views/nc.js";
import { RegistroNC } from "./views/registro-nc.js";
import { Scadenziario } from "./views/scadenziario.js";
import { Archivio } from "./views/archivio.js";
import { DDT } from "./views/ddt.js";
import { Commesse } from "./views/commesse.js";
import { AuditLog } from "./views/audit.js";
import { Console } from "./views/console.js";
import { Segnalazioni } from "./views/segnalazioni.js";
import { Impostazioni } from "./views/impostazioni.js";

// ---------- Tema ----------
const getTheme = () => { try { return localStorage.getItem("qc-theme") || "dark"; } catch (e) { return "dark"; } };
const applyTheme = (t) => { document.documentElement.dataset.theme = t; try { localStorage.setItem("qc-theme", t); } catch (e) { } };
applyTheme(getTheme());

// ---------- Router (hash: funziona su GitHub Pages senza 404) ----------
import { go } from "./ui.js";
export { go };
function useRoute() {
  const [r, setR] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const f = () => { setR(location.hash.slice(1) || "/"); window.scrollTo(0, 0); heartbeat(true); };
    addEventListener("hashchange", f); return () => removeEventListener("hashchange", f);
  }, []);
  return r;
}

const NAV = [
  { p: "/", l: "Dashboard", i: "dashboard" },
  { p: "/controllo", l: "Controllo Accettazione", i: "clipboard", admin: true },
  { p: "/nc", l: "Non Conformità", i: "alert", admin: true },
  { p: "/registro-controlli", l: "Registro Controlli", i: "list" },
  { p: "/registro-nc", l: "Registro NC", i: "file" },
  { p: "/scadenziario", l: "Scadenziario", i: "calendar" },
  { p: "/archivio", l: "Archivio & PDF", i: "archive" },
  { p: "/ddt", l: "Certificati & DDT", i: "truck" },
  { p: "/commesse", l: "Commesse", i: "box" },
  { sep: "Amministrazione", admin: true },
  { p: "/segnalazioni", l: "Segnalazioni", i: "bell", admin: true, badge: true },
  { p: "/console", l: "Console accessi", i: "terminal", admin: true },
  { p: "/audit", l: "Audit Log", i: "history", admin: true },
  { p: "/impostazioni", l: "Impostazioni & Import", i: "layers", admin: true },
];

function view(route) {
  const [, a, b] = route.split("/");
  const admin = isAdmin();
  switch (a) {
    case "": return html`<${Dashboard} />`;
    case "controllo": return b ? html`<${ControlloForm} id=${b} key=${b} />` : admin ? html`<${ControlloForm} key="new" />` : null;
    case "nc": return b ? html`<${NCForm} id=${b} key=${b} />` : admin ? html`<${NCForm} key="new" />` : null;
    case "registro-controlli": return html`<${RegistroControlli} />`;
    case "registro-nc": return html`<${RegistroNC} />`;
    case "scadenziario": return html`<${Scadenziario} />`;
    case "archivio": return html`<${Archivio} />`;
    case "ddt": return html`<${DDT} />`;
    case "commesse": return html`<${Commesse} />`;
    case "audit": return admin ? html`<${AuditLog} />` : null;
    case "console": return admin ? html`<${Console} />` : null;
    case "segnalazioni": return admin ? html`<${Segnalazioni} />` : null;
    case "impostazioni": return admin ? html`<${Impostazioni} />` : null;
  }
  return null;
}

// ---------- Login ----------
function Login() {
  const [who, setWho] = useState(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [lockUntil, setLock] = useState(0);
  const fails = useRef(0);
  const inp = useRef(null);
  useEffect(() => { who && inp.current && inp.current.focus(); }, [who]);

  const submit = async (e) => {
    e.preventDefault();
    if (Date.now() < lockUntil) return setErr(`Troppi tentativi. Riprova tra ${Math.ceil((lockUntil - Date.now()) / 1000)} secondi.`);
    setBusy(true); setErr("");
    const acc = ACCOUNTS[who];
    try {
      sessionStorage.setItem("qc-fresh-login", "1");
      await signInWithEmailAndPassword(auth, acc.email, pw);
    } catch (ex) {
      sessionStorage.removeItem("qc-fresh-login");
      fails.current++;
      logAccess("login_fallito", acc.email, acc.role, { motivo: ex.code || "errore" });
      if (fails.current >= 5) { setLock(Date.now() + 60000); fails.current = 0; }
      setErr(ex.code === "auth/too-many-requests" ? "Troppi tentativi: account temporaneamente bloccato da Firebase. Riprova più tardi."
        : ex.code === "auth/network-request-failed" ? "Connessione assente." : "Password non corretta.");
      setPw("");
    }
    setBusy(false);
  };
  return html`<div class="login-wrap">
    <div class="login-card">
      <div class="brand big"><div class="logo"><${Icon} n="bolt" s=${22} /></div><div><b>${APP.nome}</b><small>${APP.sotto}</small></div></div>
      <h2>Accesso riservato</h2>
      <p class="muted small">Scegli il profilo e inserisci la password.</p>
      <div class="who">
        ${["admin", "guest"].map((k) => html`<button type="button" class=${"who-btn" + (who === k ? " on" : "")} onClick=${() => { setWho(k); setErr(""); }}>
          <span class="who-ic"><${Icon} n=${k === "admin" ? "shield" : "eye"} s=${20} /></span>
          <span><b>${ACCOUNTS[k].label}${k === "admin" ? " (Admin)" : ""}</b><small>${ACCOUNTS[k].sub}</small></span></button>`)}
      </div>
      ${who && html`<form onSubmit=${submit} class="login-form">
        <label class="lbl" for="pw">Password ${ACCOUNTS[who].label}</label>
        <div class="pw"><${Icon} n="lock" /><input id="pw" ref=${inp} type="password" autocomplete="current-password" class="inp" value=${pw}
          onInput=${(e) => setPw(e.target.value)} required /></div>
        ${err && html`<div class="err">${err}</div>`}
        <button class="btn primary block" disabled=${busy || !pw}>${busy ? html`<span class="spin sm"></span>` : html`<${Icon} n="key" />`} Entra</button>
      </form>`}
      <p class="foot">Accesso monitorato · IP e dispositivo registrati · noindex${EMU ? " · EMULATORE" : ""}</p>
    </div></div>`;
}

// ---------- Layout ----------
function Clock() {
  const [d, setD] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setD(new Date()), 1000); return () => clearInterval(t); }, []);
  return html`<div class="clock"><b>${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</b><small>${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}</small></div>`;
}
function GlobalSearch() {
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current && ref.current.focus(); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);
  return html`<form class="gsearch" onSubmit=${(e) => { e.preventDefault(); sessionStorage.setItem("qc-q", q); go("/archivio?" + Date.now()); }}>
    <${Icon} n="search" /><input ref=${ref} placeholder="Ricerca globale…" value=${q} onInput=${(e) => setQ(e.target.value)} /><kbd>⌘K</kbd></form>`;
}

function Shell({ route }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [theme, setTheme] = useState(getTheme());
  const [nuove, setNuove] = useState(0);
  const admin = isAdmin();
  useEffect(() => {
    if (!admin) return;
    let first = true, prev = 0;
    return watchSegnalazioni((rows) => {
      const n = rows.filter((r) => r.stato === "nuova").length;
      if (!first && n > prev) toast.info("Nuova segnalazione dall'ospite");
      first = false; prev = n; setNuove(n);
    });
  }, []);
  useEffect(() => setMobile(false), [route]);
  const base = "/" + (route.split("/")[1] || "").split("?")[0];
  const logout = async () => { await doLogout("logout"); };
  const v = view(route.split("?")[0]);
  return html`<div class=${"shell" + (collapsed ? " collapsed" : "") + (mobile ? " mob-open" : "")}>
    <aside class="side">
      <div class="brand"><div class="logo"><${Icon} n="bolt" s=${18} /></div><div class="brand-t"><b>${APP.nome}</b><small>${APP.sotto}</small></div></div>
      <nav>${NAV.filter((n) => !n.admin || admin).map((n) => n.sep
        ? html`<div class="nav-sep">${n.sep}</div>`
        : html`<a href=${"#" + n.p} class=${"nav" + (base === n.p ? " on" : "")} title=${n.l}><${Icon} n=${n.i} /><span>${n.l}</span>
            ${n.badge && nuove > 0 && html`<em class="nav-badge">${nuove}</em>`}</a>`)}</nav>
      <button class="collapse" onClick=${() => setCollapsed(!collapsed)}><${Icon} n=${collapsed ? "right" : "left"} /><span>Comprimi</span></button>
    </aside>
    <div class="main-wrap">
      <header class="top">
        <button class="btn ghost icon only-mob" onClick=${() => setMobile(!mobile)} aria-label="Menu"><${Icon} n="menu" /></button>
        <${GlobalSearch} />
        <div class="top-r">
          <${Clock} />
          <button class="btn ghost icon" title="Cambia tema" onClick=${() => { const t = theme === "dark" ? "light" : "dark"; setTheme(t); applyTheme(t); }}><${Icon} n=${theme === "dark" ? "sun" : "moon"} /></button>
          ${admin && html`<a class="btn ghost icon bell" href="#/segnalazioni" title="Segnalazioni"><${Icon} n="bell" />${nuove > 0 && html`<em>${nuove}</em>`}</a>`}
          <span class=${"role " + (admin ? "r-admin" : "r-guest")}><${Icon} n=${admin ? "shield" : "eye"} s=${12} />${admin ? "ADMIN" : "OSPITE"}</span>
          <button class="btn ghost icon" title="Esci" onClick=${logout}><${Icon} n="logout" /></button>
        </div>
      </header>
      ${!admin && html`<div class="guest-bar"><${Icon} n="eye" s=${14} /> Modalità sola consultazione (Ospite). Puoi vedere tutto, sollecitare e lasciare note.</div>`}
      <main class="main">${v || html`<div class="card"><h3>Pagina non disponibile</h3><p class="muted">Non hai i permessi per questa sezione.</p><a class="btn outline" href="#/">Torna alla Dashboard</a></div>`}</main>
    </div>
    <div class="mob-veil" onClick=${() => setMobile(false)}></div>
  </div>`;
}

export async function doLogout(evento = "logout") {
  if (session.user) {
    await Promise.all([logAccess(evento, session.user.email, session.user.role), audit(evento, "", "", "")]);
  }
  await endSession();
  invalidate();
  await signOut(auth);
}

// Disconnessione automatica dopo 30 minuti di inattività
let idleT = null;
function armIdle() {
  clearTimeout(idleT);
  if (session.user) idleT = setTimeout(() => { toast.info("Sessione scaduta per inattività"); doLogout("timeout"); }, 30 * 60 * 1000);
}
["click", "keydown", "touchstart", "scroll"].forEach((e) => addEventListener(e, armIdle, { passive: true }));

function App() {
  const [state, setState] = useState("loading");
  const route = useRoute();
  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) { session.user = null; setState("out"); return; }
    const role = u.email === ACCOUNTS.admin.email ? "admin" : u.email === ACCOUNTS.guest.email ? "ospite" : null;
    if (!role) { await signOut(auth); toast.err("Account non autorizzato"); return; }
    session.user = { uid: u.uid, email: u.email, role, label: role === "admin" ? ACCOUNTS.admin.label : ACCOUNTS.guest.label };
    const fresh = sessionStorage.getItem("qc-fresh-login");
    session.sid = sessionStorage.getItem("qc-sid");
    if (fresh || !session.sid) {
      sessionStorage.removeItem("qc-fresh-login");
      startSession(session.user);
      logAccess(fresh ? "login" : "ripresa_sessione", u.email, role);
      if (fresh) audit("login", "", "", "");
    } else {
      clearInterval(session.beat); session.beat = setInterval(() => heartbeat(), 60000); heartbeat();
    }
    armIdle();
    setState("in");
  }), []);
  return html`<${Toasts} /><${ConfirmHost} />
    ${state === "loading" ? html`<div class="boot"><span class="spin"></span></div>` : state === "out" ? html`<${Login} />` : html`<${Shell} route=${route} />`}`;
}

render(html`<${App} />`, document.getElementById("app"));
