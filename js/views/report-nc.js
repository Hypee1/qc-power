import { html, useState, Icon, Badge, PageHeader, Card, Spinner, Empty, toDate, fornKey, download, csv } from "../ui.js";
import { useCollections, Bars, Columns } from "./common.js";
import { CRITICITA, ORIGINI_NC, ESITI_AUDIT } from "../config.js";
import { aziendaOf, aziendaLabel } from "../azienda.js";
import { pdfReportAnnuale } from "../pdf.js";
import { bestName } from "../nomi.js";

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
export const CRIT_COL = { zinc: "var(--zinc)", blue: "var(--blue)", amber: "var(--amber)", orange: "var(--orange)", red: "var(--red)" };

// Calcola tutti i numeri del report (usato sia a video sia nel PDF)
export function calcReport({ nc, controlli, audit_clienti }, anno, az) {
  const inAz = (x) => az === "all" || aziendaOf(x) === az;
  const N = nc.filter((x) => inAz(x) && (x.data || "").startsWith(anno));
  const C = controlli.filter((x) => (az === "all" || az === "power") && (x.data || "").startsWith(anno));
  const A = audit_clienti.filter((x) => inAz(x) && (x.data_inizio || "").startsWith(anno));
  const chiuse = N.filter((x) => x.stato === "chiusa");
  const tempi = chiuse.map((x) => (toDate(x.data_chiusura) - toDate(x.data)) / 86400000).filter((g) => !isNaN(g) && g >= 0);
  const perCrit = [...CRITICITA.map((c) => ({ ...c, n: N.filter((x) => String(x.criticita) === c.v) })), { v: "", l: "Non indicata", s: "Non indicata", c: "zinc", n: N.filter((x) => !x.criticita) }]
    .map((c) => ({ ...c, tot: c.n.length, aperte: c.n.filter((x) => x.stato === "aperta").length, chiuse: c.n.filter((x) => x.stato === "chiusa").length }));
  const mesi = MESI.map((l, m) => ({ l, v: N.filter((x) => { const t = toDate(x.data); return t && t.getMonth() === m; }).length,
    crit: CRITICITA.map((c) => N.filter((x) => { const t = toDate(x.data); return t && t.getMonth() === m && String(x.criticita) === c.v; }).length) }));
  const perOrig = [...ORIGINI_NC, ""].map((o) => ({ l: o || "Non specificata", v: N.filter((x) => (x.origine_nc || "") === o).length })).filter((x) => x.v);
  // Fornitori / controparti: controlli + NC + criticità, unificati per nome
  const S = {};
  const ent = (nome) => { const k = fornKey(nome); if (!k) return null; return (S[k] = S[k] || { nome, controlli: 0, nonConf: 0, nc: 0, critSum: 0, critMax: 0, varianti: {} }); };
  C.forEach((c) => { const e = ent(c.fornitore); if (!e) return; e.varianti[c.fornitore] = (e.varianti[c.fornitore] || 0) + 1; e.controlli++; if (c.conformita_generale === "non_conforme") e.nonConf++; });
  N.forEach((x) => { const e = ent(x.controparte); if (!e) return; e.varianti[x.controparte] = (e.varianti[x.controparte] || 0) + 1; e.nc++; const cr = parseInt(x.criticita, 10) || 0; e.critSum += cr; e.critMax = Math.max(e.critMax, cr); });
  const sogg = Object.values(S).map((e) => ({ ...e, nome: bestName(e.varianti) }))
    .sort((a, b) => b.nc - a.nc || b.critSum - a.critSum || b.controlli - a.controlli);
  const esiti = ESITI_AUDIT.map((e) => ({ ...e, v2: A.filter((x) => x.esito === e.v).length }));
  return { N, C, A, chiuse, aperte: N.length - chiuse.length, tMedio: tempi.length ? Math.round(tempi.reduce((s, g) => s + g, 0) / tempi.length) : null,
    critPct: N.length ? Math.round((N.filter((x) => x.criticita).length / N.length) * 100) : 0,
    gravi: N.filter((x) => parseInt(x.criticita, 10) >= 4).length, perCrit, mesi, perOrig, sogg, esiti,
    ctrlNC: C.filter((c) => c.conformita_generale === "non_conforme").length };
}

export function ReportNC() {
  const [d] = useCollections(["nc", "controlli", "audit_clienti"]);
  const [anno, setAnno] = useState(String(new Date().getFullYear()));
  const [az, setAz] = useState("all");
  if (!d) return html`<${Spinner} />`;
  const anni = [...new Set([String(new Date().getFullYear()), ...d.nc.map((x) => (x.data || "").slice(0, 4)), ...d.audit_clienti.map((x) => (x.data_inizio || "").slice(0, 4))].filter(Boolean))].sort().reverse();
  const R = calcReport(d, anno, az);
  const azL = az === "all" ? "MACE POWER + SERVICE" : aziendaLabel(az);
  const esporta = () => download(`report_nc_${anno}_${az}.csv`, csv([
    [`Report qualità ${anno} — ${azL}`], [],
    ["Livello criticità", "NC totali", "Aperte", "Chiuse", "% sul totale"],
    ...R.perCrit.map((c) => [c.l, c.tot, c.aperte, c.chiuse, R.N.length ? Math.round((c.tot / R.N.length) * 100) + "%" : "0%"]),
    [], ["Mese", "NC", ...CRITICITA.map((c) => c.l)], ...R.mesi.map((m) => [m.l, m.v, ...m.crit]),
    [], ["Fornitore / controparte", "Controlli accettazione", "Controlli non conformi", "NC", "Somma criticità", "Criticità max"],
    ...R.sogg.map((s) => [s.nome, s.controlli, s.nonConf, s.nc, s.critSum, s.critMax || ""]),
    [], ["Esito audit", "Numero"], ...R.esiti.map((e) => [e.l, e.v2])]), "text/csv");

  const kpi = (l, v, sub, cls) => html`<div class=${"kpi " + cls}><div><span class="lbl">${l}</span><b>${v}</b><small>${sub}</small></div></div>`;
  return html`<div>
    <a class="back" href="#/registro-nc"><${Icon} n="back" s=${14} /> Registro NC</a>
    <${PageHeader} title=${"Report qualità " + anno} subtitle=${`${azL} · NC per livello di criticità, fornitori, audit — dati di fine anno`}>
      <select class="inp w-auto" value=${anno} onChange=${(e) => setAnno(e.target.value)}>${anni.map((y) => html`<option>${y}</option>`)}</select>
      <select class="inp w-auto" value=${az} onChange=${(e) => setAz(e.target.value)}><option value="all">Power + Service</option><option value="power">Solo MACE POWER</option><option value="service">Solo MACE SERVICE</option></select>
      <button class="btn outline" onClick=${esporta}><${Icon} n="download" /> CSV</button>
      <button class="btn primary" onClick=${() => pdfReportAnnuale(R, anno, azL)}><${Icon} n="download" /> PDF</button>
    </${PageHeader}>
    <div class="kpis">
      ${kpi("NC dell'anno", R.N.length, `${R.aperte} aperte · ${R.chiuse.length} chiuse`, "k-red")}
      ${kpi("NC gravi o critiche", R.gravi, "livello 4 e 5", "k-orange")}
      ${kpi("Tempo medio chiusura", R.tMedio === null ? "—" : R.tMedio + " gg", "dall'apertura alla chiusura", "k-blue")}
      ${kpi("Audit clienti", R.A.length, R.esiti.filter((e) => e.v2).map((e) => `${e.v2} ${e.l.toLowerCase()}`).join(" · ") || "nessuno", "k-teal")}
    </div>
    ${R.critPct < 100 && R.N.length > 0 && html`<div class="ro-note"><${Icon} n="alert" s=${14} /> Criticità indicata sul ${R.critPct}% delle NC dell'anno: apri le NC "Non indicata" e scegli il livello per avere un report completo.</div>`}
    <div class="grid-2">
      <${Card} title="NC per livello di criticità">
        ${R.N.length === 0 ? html`<${Empty} text="Nessuna NC in questo anno." />` : html`<${Bars} data=${R.perCrit.filter((c) => c.tot || c.v).map((c) => ({ l: c.l, v: c.tot, c: CRIT_COL[c.c] }))} />
        <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Livello</th><th class="r">Totale</th><th class="r">Aperte</th><th class="r">Chiuse</th><th class="r">%</th></tr></thead>
          <tbody>${R.perCrit.map((c) => html`<tr><td>${c.v ? html`<${Badge} v=${"c" + c.v} />` : html`<span class="muted">Non indicata</span>`}</td><td class="r"><b>${c.tot}</b></td><td class="r">${c.aperte}</td><td class="r">${c.chiuse}</td>
            <td class="r muted">${R.N.length ? Math.round((c.tot / R.N.length) * 100) : 0}%</td></tr>`)}</tbody></table></div>`}
      </${Card}>
      <${Card} title="NC per mese"><${Columns} data=${R.mesi} height=${170} />
        <p class="muted small">Legenda livelli: ${CRITICITA.map((c) => html`<span class=${"tag crit-t c-" + c.c}>${c.l}</span> `)}</p></${Card}>
    </div>
    <div class="grid-2">
      <${Card} title="NC per origine">${R.perOrig.length ? html`<${Bars} data=${R.perOrig} />` : html`<${Empty} />`}</${Card}>
      <${Card} title="Esito audit dei clienti">${R.A.length ? html`<${Bars} data=${R.esiti.map((e) => ({ l: e.l, v: e.v2, c: `var(--${e.c})` }))} />` : html`<${Empty} text="Nessun audit in questo anno." icon="award" />`}</${Card}>
    </div>
    <${Card} title="Fornitori e controparti: controlli e NC" right=${html`<span class="muted small">nomi unificati (es. Tecnosteel = TECNOSTEEL)</span>`}>
      ${R.sogg.length === 0 ? html`<${Empty} />` : html`<div class="tbl-wrap"><table class="tbl compact">
        <thead><tr><th>Fornitore / controparte</th><th class="r">Controlli</th><th class="r">Controlli non conf.</th><th class="r">NC</th><th class="r">Somma criticità</th><th>Criticità max</th></tr></thead>
        <tbody>${R.sogg.slice(0, 40).map((s) => html`<tr><td><b>${s.nome}</b>${Object.keys(s.varianti).length > 1 ? html` <small class="muted" title=${Object.keys(s.varianti).join(", ")}>(${Object.keys(s.varianti).length} grafie)</small>` : ""}</td>
          <td class="r">${s.controlli || ""}</td><td class=${"r" + (s.nonConf ? " t-red" : "")}>${s.nonConf || ""}</td><td class="r"><b>${s.nc || ""}</b></td><td class="r">${s.critSum || ""}</td>
          <td>${s.critMax ? html`<${Badge} v=${"c" + s.critMax} />` : ""}</td></tr>`)}</tbody></table></div>`}
    </${Card}>
  </div>`;
}
