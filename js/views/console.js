import { html, useState, useEffect, Icon, Badge, PageHeader, Card, Spinner, Empty, toDate, fmtDT, ago, download, csv, norm } from "../ui.js";
import { recentRows, session } from "../store.js";
import { Bars } from "./common.js";
import { AZIONI } from "./audit.js";

const devIcon = (t) => (t === "Smartphone" ? "phone" : t === "Tablet" ? "tablet" : "monitor");
const durata = (a, b) => { const s = Math.max(0, Math.round(((toDate(b) || new Date()) - (toDate(a) || new Date())) / 1000)); return s < 60 ? s + "s" : s < 3600 ? Math.round(s / 60) + " min" : (s / 3600).toFixed(1) + " h"; };
const count = (rows, f) => { const m = {}; rows.forEach((r) => { const k = f(r) || "n.d."; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v })); };

export function Console() {
  const [acc, setAcc] = useState(null);
  const [ses, setSes] = useState([]);
  const [aud, setAud] = useState([]);
  const [tab, setTab] = useState("accessi");
  const [chi, setChi] = useState("");
  const [ev, setEv] = useState("");
  const [q, setQ] = useState("");
  const load = () => Promise.all([recentRows("accessi", 1000), recentRows("sessioni", 300, "inizio"), recentRows("audit", 800)])
    .then(([a, s, au]) => { setAcc(a); setSes(s); setAud(au.filter((x) => x.user_role === "ospite")); })
    .catch((e) => { console.error(e); setAcc([]); });
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  if (!acc) return html`<${Spinner} />`;

  const now = Date.now(), DAY = 86400000;
  const online = ses.filter((s) => !s.fine && toDate(s.ultimo) && now - toDate(s.ultimo) < 3 * 60000);
  const oggi = acc.filter((a) => a.evento === "login" && toDate(a.ts) && toDate(a.ts).toDateString() === new Date().toDateString());
  const falliti = acc.filter((a) => a.evento === "login_fallito" && toDate(a.ts) && now - toDate(a.ts) < 7 * DAY);
  const ip30 = new Set(acc.filter((a) => toDate(a.ts) && now - toDate(a.ts) < 30 * DAY).map((a) => a.ip));
  // primo avvistamento di ogni IP → evidenzia gli IP nuovi
  const firstSeen = {};
  [...acc].reverse().forEach((a) => { if (!(a.ip in firstSeen)) firstSeen[a.ip] = a.id; });

  const nq = norm(q);
  const rows = acc.filter((a) => (!chi || a.role === chi) && (!ev || a.evento === ev)
    && (!nq || norm([a.ip, a.citta, a.provider, a.os, a.browser, a.dispositivo, a.modello, a.email].join(" ")).includes(nq)));
  const logins = acc.filter((a) => a.evento === "login");
  const esporta = () => download("console_accessi.csv", csv([["Data/ora", "Evento", "Email", "Profilo", "IP", "Città", "Regione", "Paese", "Provider", "Dispositivo", "Modello", "OS", "Browser", "Schermo", "Lingua", "Fuso", "User agent"],
    ...rows.map((a) => [fmtDT(a.ts), a.evento, a.email, a.role, a.ip, a.citta, a.regione, a.paese, a.provider, a.dispositivo, a.modello, a.os, a.browser, a.schermo, a.lingua, a.fuso, a.ua])]), "text/csv");

  const kpi = (label, val, sub, icon, cls) => html`<div class=${"kpi " + cls}><div><span class="lbl">${label}</span><b>${val}</b><small>${sub}</small></div><span class="kpi-ic"><${Icon} n=${icon} s=${18} /></span></div>`;
  return html`<div>
    <${PageHeader} title="Console accessi" subtitle="Chi entra, da dove e con quale dispositivo — visibile solo all'amministratore">
      <button class="btn outline" onClick=${esporta}><${Icon} n="download" /> CSV</button><button class="btn outline" onClick=${load}><${Icon} n="refresh" /> Aggiorna</button>
    </${PageHeader}>
    <div class="kpis">
      ${kpi("Online ora", online.length, online.map((s) => s.role).join(", ") || "nessuno", "activity", "k-green")}
      ${kpi("Login oggi", oggi.length, `${oggi.filter((a) => a.role === "ospite").length} ospite · ${oggi.filter((a) => a.role === "admin").length} admin`, "key", "k-blue")}
      ${kpi("Login falliti (7 gg)", falliti.length, falliti.length ? "ultimo " + ago(falliti[0].ts) : "nessun tentativo", "lock", falliti.length ? "k-red" : "k-zinc")}
      ${kpi("IP distinti (30 gg)", ip30.size, `${logins.length} login totali registrati`, "globe", "k-amber")}
    </div>
    ${online.length > 0 && html`<${Card} title="Sessioni attive adesso">
      <div class="mini-list">${online.map((s) => html`<div class="mini"><span class="arch-ic live"><${Icon} n=${devIcon(s.dispositivo)} /></span>
        <div class="grow"><b>${s.role === "admin" ? "Biagio (Admin)" : "Ospite"} ${s.id === session.sid ? html`<span class="tag">tu</span>` : ""}</b>
          <small>${s.ip} · ${s.citta || "?"} · ${s.os} · ${s.browser} · pagina ${s.pagina}</small></div>
        <span class="small muted">da ${durata(s.inizio, new Date())} · ${s.pagine || 1} pagine</span></div>`)}</div></${Card}>`}

    <div class="tabs">${[["accessi", "Registro accessi"], ["sessioni", "Sessioni"], ["ospite", "Attività ospite"], ["stat", "Statistiche"]].map(([k, l]) =>
      html`<button class=${"tab" + (tab === k ? " on" : "")} onClick=${() => setTab(k)}>${l}</button>`)}</div>

    ${tab === "accessi" && html`<${Card}>
      <div class="filters">
        <div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca IP, città, provider, dispositivo…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="inp" value=${chi} onChange=${(e) => setChi(e.target.value)}><option value="">Tutti i profili</option><option value="admin">Admin</option><option value="ospite">Ospite</option></select>
        <select class="inp" value=${ev} onChange=${(e) => setEv(e.target.value)}><option value="">Tutti gli eventi</option><option value="login">Login</option><option value="login_fallito">Login fallito</option><option value="logout">Logout</option><option value="timeout">Timeout</option><option value="ripresa_sessione">Ripresa sessione</option></select>
      </div>
      ${rows.length === 0 ? html`<${Empty} text="Nessun accesso registrato." />` : html`<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Data / ora</th><th>Evento</th><th>Profilo</th><th>IP</th><th>Posizione / provider</th><th>Dispositivo</th><th>Sistema / browser</th></tr></thead>
        <tbody>${rows.slice(0, 400).map((a) => { const [l, c] = AZIONI[a.evento] || [a.evento, "zinc"];
          return html`<tr key=${a.id} class=${a.evento === "login_fallito" ? "row-fail" : ""}>
            <td class="mono small nowrap">${fmtDT(a.ts)}<small class="muted block">${ago(a.ts)}</small></td>
            <td><span class=${"badge b-" + c}>${l}</span>${a.motivo && html`<small class="muted block">${a.motivo}</small>`}</td>
            <td><${Badge} v=${a.role} /></td>
            <td class="mono small">${a.ip}${firstSeen[a.ip] === a.id && html` <span class="tag t-amber" title="Prima volta che questo IP accede">nuovo</span>`}</td>
            <td class="small">${[a.citta, a.regione, a.paese].filter(Boolean).join(", ") || "—"}<small class="muted block">${a.provider || ""}</small></td>
            <td class="small nowrap"><${Icon} n=${devIcon(a.dispositivo)} s=${14} /> ${a.dispositivo}${a.modello && html`<small class="muted block">${a.modello}</small>`}<small class="muted block">${a.schermo}</small></td>
            <td class="small">${a.os}<small class="muted block">${a.browser} · ${a.lingua}</small></td></tr>`; })}</tbody></table></div>`}
    </${Card}>`}

    ${tab === "sessioni" && html`<${Card}>
      ${ses.length === 0 ? html`<${Empty} text="Nessuna sessione." />` : html`<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Inizio</th><th>Profilo</th><th>Durata</th><th>Pagine</th><th>Ultima pagina</th><th>IP / città</th><th>Dispositivo</th><th>Stato</th></tr></thead>
        <tbody>${ses.map((s) => { const live = !s.fine && toDate(s.ultimo) && now - toDate(s.ultimo) < 3 * 60000;
          return html`<tr key=${s.id}><td class="mono small">${fmtDT(s.inizio)}</td><td><${Badge} v=${s.role} /></td><td class="small">${durata(s.inizio, s.fine || s.ultimo)}</td>
          <td class="small">${s.pagine || 1}</td><td class="mono small">${s.pagina || ""}</td><td class="small">${s.ip}<small class="muted block">${s.citta || ""} ${s.provider ? "· " + s.provider : ""}</small></td>
          <td class="small"><${Icon} n=${devIcon(s.dispositivo)} s=${14} /> ${s.os}<small class="muted block">${s.browser}</small></td>
          <td>${live ? html`<span class="badge b-green">online</span>` : s.fine ? html`<span class="badge b-zinc">chiusa</span>` : html`<span class="badge b-amber">inattiva</span>`}</td></tr>`; })}</tbody></table></div>`}
    </${Card}>`}

    ${tab === "ospite" && html`<${Card} title="Cosa ha guardato e fatto l'ospite">
      ${aud.length === 0 ? html`<${Empty} text="Nessuna attività dell'ospite." />` : html`<div class="mini-list">${aud.slice(0, 300).map((r) => { const [l, c] = AZIONI[r.action] || [r.action, "zinc"];
        const h = r.entity === "controlli" ? "#/controllo/" + r.entity_id : r.entity === "nc" ? "#/nc/" + r.entity_id : null;
        return html`<div class="mini"><span class=${"badge b-" + c}>${l}</span><div class="grow">${h ? html`<a href=${h}>${r.label || r.entity_id}</a>` : r.label || "—"}${r.details && html`<small class="muted block">“${r.details}”</small>`}</div>
          <span class="mono small muted">${fmtDT(r.ts)}</span></div>`; })}</div>`}
    </${Card}>`}

    ${tab === "stat" && html`<div class="grid-2">
      <${Card} title="Login per dispositivo"><${Bars} data=${count(logins, (a) => a.dispositivo)} /></${Card}>
      <${Card} title="Login per sistema operativo"><${Bars} data=${count(logins, (a) => a.os)} color="var(--blue)" /></${Card}>
      <${Card} title="Login per browser"><${Bars} data=${count(logins, (a) => (a.browser || "").replace(/ \d+.*/, ""))} color="var(--violet)" /></${Card}>
      <${Card} title="IP più frequenti"><${Bars} data=${count(logins, (a) => `${a.ip} ${a.citta ? "(" + a.citta + ")" : ""}`).slice(0, 10)} color="var(--amber)" /></${Card}>
      <${Card} title="Accessi per profilo"><${Bars} data=${count(logins, (a) => (a.role === "admin" ? "Admin" : "Ospite"))} color="var(--green)" /></${Card}>
      <${Card} title="Provider / rete"><${Bars} data=${count(logins, (a) => a.provider).slice(0, 8)} color="var(--muted-fg)" /></${Card}>
    </div>`}
  </div>`;
}
