import { html, Icon, Badge, PageHeader, Card, Spinner, fmtDate, toDate, fornKey } from "../ui.js";
import { isAdmin } from "../store.js";
import { useCollections, byDateDesc, statoScadenza, Bars, Columns } from "./common.js";
import { ORIGINI_NC } from "../config.js";

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function Dashboard() {
  const [d] = useCollections(["controlli", "nc", "ddt", "commesse"]);
  if (!d) return html`<${Spinner} />`;
  const { controlli: C, nc: N, ddt: D, commesse: M } = d;
  const aperte = N.filter((n) => n.stato === "aperta"), chiuse = N.filter((n) => n.stato === "chiusa");
  const conf = C.filter((c) => c.conformita_generale === "conforme").length;
  const ncC = C.filter((c) => c.conformita_generale === "non_conforme").length;
  const ris = C.filter((c) => c.conformita_generale === "con_riserva").length;
  const scad = N.map(statoScadenza).filter((s) => s && s.status !== "in_corso");
  const perOrig = [...ORIGINI_NC, ""].map((o) => ({ l: o || "Non specificata", v: N.filter((n) => (n.origine_nc || "") === o).length })).filter((x) => x.v);

  const now = new Date(); const mesi = [];
  for (let i = 11; i >= 0; i--) { const dt = new Date(now.getFullYear(), now.getMonth() - i, 1); mesi.push({ y: dt.getFullYear(), m: dt.getMonth() }); }
  const inMese = (rows, x) => rows.filter((r) => { const t = toDate(r.data); return t && t.getFullYear() === x.y && t.getMonth() === x.m; }).length;

  const topForn = {};
  N.forEach((n) => { if (!n.controparte) return; const k = fornKey(n.controparte); topForn[k] = topForn[k] || { l: n.controparte, v: 0 }; topForn[k].v++; });
  const top = Object.values(topForn).sort((a, b) => b.v - a.v).slice(0, 6);

  const kpi = (label, val, sub, icon, cls, href) => html`<a class=${"kpi " + cls} href=${href}>
    <div><span class="lbl">${label}</span><b>${val}</b><small>${sub}</small></div><span class="kpi-ic"><${Icon} n=${icon} s=${18} /></span></a>`;

  return html`<div>
    <${PageHeader} title="Dashboard" subtitle="Panoramica qualità in tempo reale — solo dati effettivi">
      ${isAdmin() && html`<a class="btn outline" href="#/controllo"><${Icon} n="clipboard" /> Nuovo Controllo</a>
        <a class="btn primary" href="#/nc"><${Icon} n="plus" /> Nuova NC</a>`}
    </${PageHeader}>
    ${scad.length > 0 && html`<a class="alert-bar" href="#/scadenziario"><${Icon} n="alert" />
      <span><b>${scad.filter((s) => s.status === "scaduta").length} NC scadute</b> e ${scad.filter((s) => s.status === "in_scadenza").length} in scadenza — apri lo scadenziario</span><${Icon} n="next" /></a>`}
    <div class="kpis">
      ${kpi("NC totali", N.length, `${aperte.length} aperte · ${chiuse.length} chiuse`, "alert", "k-red", "#/registro-nc")}
      ${kpi("Controlli", C.length, `${conf} conformi · ${ncC} NC${ris ? " · " + ris + " con riserva" : ""}`, "clipboard", "k-blue", "#/registro-controlli")}
      ${kpi("Commesse", M.length, "anagrafica attiva", "box", "k-amber", "#/commesse")}
      ${kpi("Certificati / DDT", D.length, `${D.filter((x) => x.tipo === "certificato").length} certificati`, "truck", "k-green", "#/ddt")}
    </div>
    <div class="grid-3-1">
      <${Card} title="Attività ultimi 12 mesi" right=${html`<span class="legend"><i class="lg-blue"></i>Controlli <i class="lg-red"></i>NC</span>`}>
        <div class="dual-cols">
          ${mesi.map((x) => { const c = inMese(C, x), n = inMese(N, x); const mx = Math.max(1, ...mesi.map((z) => Math.max(inMese(C, z), inMese(N, z))));
            return html`<div class="dcol" title=${`${MESI[x.m]} ${x.y}: ${c} controlli, ${n} NC`}>
              <div class="dbars"><div class="db b1" style=${`height:${(c / mx) * 100}%`}><span>${c || ""}</span></div><div class="db b2" style=${`height:${(n / mx) * 100}%`}><span>${n || ""}</span></div></div>
              <small>${MESI[x.m]}</small></div>`; })}
        </div>
      </${Card}>
      <${Card} title="Stato NC">
        <div class="stat-list">
          <div><${Icon} n="xCircle" cls="t-red" /> Aperte <b>${aperte.length}</b></div>
          <div><${Icon} n="checkCircle" cls="t-green" /> Chiuse <b>${chiuse.length}</b></div>
          <hr />
          <div><${Icon} n="checkCircle" cls="t-green" /> Controlli conformi <b>${conf}</b></div>
          <div><${Icon} n="xCircle" cls="t-red" /> Controlli non conformi <b>${ncC}</b></div>
          ${ris > 0 && html`<div><${Icon} n="alert" cls="t-amber" /> Con riserva <b>${ris}</b></div>`}
        </div>
      </${Card}>
    </div>
    <div class="grid-2">
      <${Card} title="NC per origine"><${Bars} data=${perOrig} /></${Card}>
      <${Card} title="Controparti con più NC"><${Bars} data=${top} color="var(--amber)" /></${Card}>
    </div>
    <div class="grid-2">
      <${Card} title="Ultime non conformità" right=${html`<a class="link" href="#/registro-nc">Tutte →</a>`}>
        <div class="mini-list">${[...N].sort(byDateDesc).slice(0, 6).map((n) => html`<a class="mini" href=${"#/nc/" + n.id}>
          <div><b>${n.numero_report}</b><small>${n.materiale_descrizione || "—"}</small></div>
          <span class="muted small">${fmtDate(n.data)}</span><${Badge} v=${n.stato} /><${Icon} n="next" s=${14} /></a>`)}</div>
      </${Card}>
      <${Card} title="Ultimi controlli" right=${html`<a class="link" href="#/registro-controlli">Tutti →</a>`}>
        <div class="mini-list">${[...C].sort(byDateDesc).slice(0, 6).map((c) => html`<a class="mini" href=${"#/controllo/" + c.id}>
          <div><b>${c.tipo || "Controllo"}</b><small>${c.fornitore || "—"}</small></div>
          <span class="muted small">${fmtDate(c.data)}</span><${Badge} v=${c.conformita_generale} /><${Icon} n="next" s=${14} /></a>`)}</div>
      </${Card}>
    </div>
  </div>`;
}
