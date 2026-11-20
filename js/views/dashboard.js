import { html, useState, Icon, Badge, PageHeader, Card, Spinner, Empty, fmtDate, toDate, fornKey, isoDay } from "../ui.js";
import { isAdmin } from "../store.js";
import { useCollections, byDateDesc, statoScadenza, Bars } from "./common.js";
import { CRITICITA, ESITI_AUDIT } from "../config.js";
import { Calendario, VoceRow, EventoModal, vociCalendario, nuovoEvento } from "./calendario.js";
import { CRIT_COL } from "./report-nc.js";

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function Dashboard() {
  const [d] = useCollections(["controlli", "nc", "audit_clienti", "eventi", "near_miss", "richieste"]);
  const [giorno, setGiorno] = useState("");
  const [ev, setEv] = useState(null);
  if (!d) return html`<${Spinner} />`;
  const admin = isAdmin();
  const { controlli: C, nc: N, audit_clienti: A } = d;
  const anno = String(new Date().getFullYear());
  const aperte = N.filter((n) => n.stato === "aperta"), chiuse = N.filter((n) => n.stato === "chiusa");
  const conf = C.filter((c) => c.conformita_generale === "conforme").length;
  const ncC = C.filter((c) => c.conformita_generale === "non_conforme").length;
  const ris = C.filter((c) => c.conformita_generale === "con_riserva").length;
  const scad = N.map(statoScadenza).filter((s) => s && s.status !== "in_corso");
  const gravi = aperte.filter((n) => parseInt(n.criticita, 10) >= 4);
  const Aanno = A.filter((a) => (a.data_inizio || "").startsWith(anno));
  const perCrit = CRITICITA.map((c) => ({ l: c.l, v: N.filter((n) => (n.data || "").startsWith(anno) && String(n.criticita) === c.v).length, c: CRIT_COL[c.c] }));
  const senzaCrit = N.filter((n) => (n.data || "").startsWith(anno) && !n.criticita).length;

  const voci = vociCalendario(d);
  const today = isoDay();
  const prossimi = giorno ? voci.filter((v) => v.start <= giorno && (v.end || v.start) >= giorno)
    : voci.filter((v) => !v.done && ((v.kind === "nc" && v.status !== "in_corso") || ((v.end || v.start) >= today && v.start <= addDays(today, 45)))).slice(0, 8);

  const now = new Date(); const mesi = [];
  for (let i = 11; i >= 0; i--) { const dt = new Date(now.getFullYear(), now.getMonth() - i, 1); mesi.push({ y: dt.getFullYear(), m: dt.getMonth() }); }
  const inMese = (rows, x) => rows.filter((r) => { const t = toDate(r.data); return t && t.getFullYear() === x.y && t.getMonth() === x.m; }).length;
  const mx = Math.max(1, ...mesi.map((z) => Math.max(inMese(C, z), inMese(N, z))));

  const topForn = {};
  N.forEach((n) => { if (!n.controparte) return; const k = fornKey(n.controparte); topForn[k] = topForn[k] || { l: n.controparte, v: 0 }; topForn[k].v++; });
  const top = Object.values(topForn).sort((a, b) => b.v - a.v).slice(0, 6);

  const kpi = (label, val, sub, icon, cls, href) => html`<a class=${"kpi " + cls} href=${href}>
    <div><span class="lbl">${label}</span><b>${val}</b><small>${sub}</small></div><span class="kpi-ic"><${Icon} n=${icon} s=${18} /></span></a>`;

  return html`<div>
    <${PageHeader} title="Dashboard" subtitle="Panoramica qualità in tempo reale — solo dati effettivi">
      ${admin && html`<a class="btn outline" href="#/controllo"><${Icon} n="clipboard" /> Nuovo Controllo</a>
        <a class="btn outline" href="#/audit-cliente"><${Icon} n="award" /> Nuovo Audit</a>
        <a class="btn outline" href="#/near-miss"><${Icon} n="hardhat" /> Near Miss</a>
        <a class="btn primary" href="#/nc"><${Icon} n="plus" /> Nuova NC</a>`}
    </${PageHeader}>
    ${scad.length > 0 && html`<a class="alert-bar" href="#/scadenziario"><${Icon} n="alert" />
      <span><b>${scad.filter((s) => s.status === "scaduta").length} NC scadute</b> e ${scad.filter((s) => s.status === "in_scadenza").length} in scadenza — apri il calendario</span><${Icon} n="next" /></a>`}
    <div class="kpis">
      ${kpi("NC totali", N.length, `${aperte.length} aperte · ${chiuse.length} chiuse`, "alert", "k-red", "#/registro-nc")}
      ${kpi("NC aperte gravi / critiche", gravi.length, "livello di criticità 4 e 5", "gauge", "k-orange", "#/registro-nc")}
      ${kpi("Controlli", C.length, `${conf} conformi · ${ncC} NC${ris ? " · " + ris + " con riserva" : ""}`, "clipboard", "k-blue", "#/registro-controlli")}
      ${kpi("Near miss aperti", d.near_miss.filter((x) => x.stato !== "nm_chiuso").length, `${d.near_miss.filter((x) => (x.data || "").startsWith(anno)).length} nel ${anno} · ${d.near_miss.filter((x) => x.stato !== "nm_chiuso" && parseInt(x.criticita, 10) >= 4).length} gravi/critici aperti`, "hardhat", "k-orange", "#/registro-near-miss")}
      ${kpi("Audit " + anno, Aanno.length, ESITI_AUDIT.map((e) => [e, Aanno.filter((a) => a.esito === e.v).length]).filter(([, n]) => n).map(([e, n]) => `${n} ${e.l.toLowerCase()}`).join(" · ") || `${A.length} in totale`, "award", "k-teal", "#/registro-audit")}
    </div>

    <div class="grid-2">
      <${Card} title="Calendario" right=${html`<a class="link" href="#/scadenziario">Apri calendario →</a>`}>
        <${Calendario} voci=${voci} giorno=${giorno} onGiorno=${setGiorno} compact />
      </${Card}>
      <${Card} title=${giorno ? "Giorno " + fmtDate(giorno) : "In arrivo e da guardare"} right=${html`<span class="row-gap">
        ${giorno && html`<button class="link-btn" onClick=${() => setGiorno("")}>tutti</button>`}
        ${admin && html`<button class="link-btn" onClick=${() => setEv(nuovoEvento(giorno))}><${Icon} n="plus" s=${12} /> evento</button>`}</span>`}>
        ${prossimi.length === 0 ? html`<${Empty} text=${giorno ? "Niente in questo giorno." : "Nessuna scadenza, audit o evento nei prossimi 45 giorni."} icon="checkCircle" />`
          : html`<div class="mini-list">${prossimi.map((v) => html`<${VoceRow} key=${v.id} v=${v} onEdit=${setEv} />`)}</div>`}
      </${Card}>
    </div>

    <div class="grid-3-1">
      <${Card} title="Attività ultimi 12 mesi" right=${html`<span class="legend"><i class="lg-blue"></i>Controlli <i class="lg-red"></i>NC</span>`}>
        <div class="dual-cols">
          ${mesi.map((x) => { const c = inMese(C, x), n = inMese(N, x);
            return html`<div class="dcol" title=${`${MESI[x.m]} ${x.y}: ${c} controlli, ${n} NC`}>
              <div class="dbars"><div class="db b1" style=${`height:${(c / mx) * 100}%`}><span>${c || ""}</span></div><div class="db b2" style=${`height:${(n / mx) * 100}%`}><span>${n || ""}</span></div></div>
              <small>${MESI[x.m]}</small></div>`; })}
        </div>
      </${Card}>
      <${Card} title=${"Criticità NC " + anno} right=${html`<a class="link" href="#/report-nc">Report →</a>`}>
        <${Bars} data=${perCrit} />
        ${senzaCrit > 0 && html`<p class="muted small">${senzaCrit} NC dell'anno senza livello indicato.</p>`}
      </${Card}>
    </div>
    <div class="grid-2">
      <${Card} title="Controparti con più NC" right=${html`<a class="link" href="#/anagrafica">Anagrafica →</a>`}>${top.length ? html`<${Bars} data=${top} color="var(--amber)" />` : html`<${Empty} />`}</${Card}>
      <${Card} title="Stato">
        <div class="stat-list">
          <div><${Icon} n="xCircle" cls="t-red" /> NC aperte <b>${aperte.length}</b></div>
          <div><${Icon} n="checkCircle" cls="t-green" /> NC chiuse <b>${chiuse.length}</b></div>
          <hr />
          <div><${Icon} n="checkCircle" cls="t-green" /> Controlli conformi <b>${conf}</b></div>
          <div><${Icon} n="xCircle" cls="t-red" /> Controlli non conformi <b>${ncC}</b></div>
          ${ris > 0 && html`<div><${Icon} n="alert" cls="t-amber" /> Con riserva <b>${ris}</b></div>`}
        </div>
      </${Card}>
    </div>
    <div class="grid-2">
      <${Card} title="Ultime non conformità" right=${html`<a class="link" href="#/registro-nc">Tutte →</a>`}>
        <div class="mini-list">${[...N].sort(byDateDesc).slice(0, 6).map((n) => html`<a class="mini" href=${"#/nc/" + n.id}>
          <div class="grow"><b>${n.numero_report}</b><small>${n.materiale_descrizione || "—"}</small></div>
          ${n.criticita && html`<${Badge} v=${"c" + n.criticita} />`}
          <span class="muted small">${fmtDate(n.data)}</span><${Badge} v=${n.stato} /><${Icon} n="next" s=${14} /></a>`)}</div>
      </${Card}>
      <${Card} title="Ultimi controlli" right=${html`<a class="link" href="#/registro-controlli">Tutti →</a>`}>
        <div class="mini-list">${[...C].sort(byDateDesc).slice(0, 6).map((c) => html`<a class="mini" href=${"#/controllo/" + c.id}>
          <div class="grow"><b>${c.tipo || "Controllo"}</b><small>${c.fornitore || "—"}</small></div>
          <span class="muted small">${fmtDate(c.data)}</span><${Badge} v=${c.conformita_generale} /><${Icon} n="next" s=${14} /></a>`)}</div>
      </${Card}>
    </div>
    ${ev && html`<${EventoModal} ev=${ev} onClose=${() => setEv(null)} />`}
  </div>`;
}
function addDays(k, n) { const d = toDate(k); d.setDate(d.getDate() + n); return isoDay(d); }
