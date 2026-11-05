import { html, useState, Icon, Badge, PageHeader, Card, Spinner, Empty, toast, confirmDialog, fmtDate, norm, download, csv, go, toDate, isoDay } from "../ui.js";
import { isAdmin, remove } from "../store.js";
import { useCollections, byDateDesc, faseRientro, koRientro } from "./common.js";
import { GuestRowActions } from "../guest.js";
import { pdfRientro, pdfRegistroRientri } from "../pdf.js";
import { AziendaTabs, AziendaTag, aziendaOf, aziendaLabel, tabMemo } from "../azienda.js";
import { GARANZIA } from "../config.js";

const memo = tabMemo("qc-tab-rientri");
const gg = (r) => { const d = toDate(r.data); return d ? Math.max(0, Math.round((toDate(isoDay()) - d) / 86400000)) : null; };

export function RegistroRientri() {
  const [d] = useCollections(["rientri"]);
  const [az, setAzS] = useState(memo.get());
  const setAz = (v) => { memo.set(v); setAzS(v); };
  const [q, setQ] = useState("");
  const [gar, setGar] = useState("");
  const [fase, setFase] = useState("");
  const [stato, setStato] = useState("");
  const [iso, setIso] = useState("");
  const [anno, setAnno] = useState("");
  const [n, setN] = useState(50);
  const admin = isAdmin();
  if (!d) return html`<${Spinner} />`;
  const R = d.rientri;
  const base = R.filter((x) => az === "all" || aziendaOf(x) === az);
  const anni = [...new Set(R.map((x) => (x.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const nq = norm(q);
  const rows = base.filter((x) => (!gar || x.garanzia === gar) && (!fase || faseRientro(x) === fase) && (!stato || x.stato === stato)
    && (!iso || x.isolamento === iso) && (!anno || (x.data || "").startsWith(anno))
    && (!nq || norm([x.numero, x.numero_ddt, x.mittente, x.referente, x.causale, x.costruttore, x.matricola, x.potenza, x.gruppo, x.riscontro_apertura, x.attivita_prevedere].join(" ")).includes(nq)))
    .sort(byDateDesc);
  const counts = { power: R.filter((x) => aziendaOf(x) === "power").length, service: R.filter((x) => aziendaOf(x) === "service").length, all: R.length };
  const del = async (x) => {
    if (!(await confirmDialog("Eliminare il rientro?", `Rientro ${x.numero} · ${x.matricola || x.mittente || ""}`))) return;
    try { await remove("rientri", x.id, "Rientro " + x.numero); toast.ok("Rientro eliminato"); } catch (e) { toast.err("Eliminazione non riuscita"); }
  };
  const gLabel = (v) => (GARANZIA.find((g) => g.v === v) || {}).l || "";
  const esporta = () => download(`registro_rientri_${isoDay()}.csv`, csv([
    ["Numero", "Azienda", "Data", "DDT", "Garanzia", "Mittente", "Causa", "Olio/Resina", "Costruttore", "Matricola", "kVA", "Anno", "Gruppo", "Peso totale", "Peso olio", "Collaudo", "Prove KO", "Lavori", "Stato", "Data chiusura"],
    ...rows.map((x) => [x.numero, aziendaLabel(aziendaOf(x)), x.data, x.numero_ddt, gLabel(x.garanzia), x.mittente, x.causale, x.isolamento, x.costruttore, x.matricola, x.potenza, x.anno, x.gruppo,
      x.peso_totale, x.peso_olio, faseRientro(x).replace("_", " "), koRientro(x), Object.entries(x.lavori || {}).filter(([, v]) => v).map(([k]) => k).join(", "), x.stato, x.data_chiusura])]), "text/csv");
  const desc = [az === "all" ? "Power + Service" : aziendaLabel(az), gar && gLabel(gar), fase && fase.replace("_", " "), stato, iso, anno, q && `"${q}"`].filter(Boolean).join(" · ");
  const kpi = (label, val, cls, on, click) => html`<button class=${"kpi kpi-btn " + cls + (on ? " sel" : "")} onClick=${click}><div><span class="lbl">${label}</span><b>${val}</b></div></button>`;
  const nuovo = "#/rientro" + (az === "service" ? "?az=service" : az === "power" ? "?az=power" : "");

  return html`<div>
    <${PageHeader} title="Registro Rientri" subtitle=${`Rientri trasformatori · ${rows.length} di ${base.length}`}>
      <button class="btn outline" onClick=${() => pdfRegistroRientri(rows, desc, az)}><${Icon} n="download" /> PDF registro</button>
      ${admin && html`<button class="btn outline" onClick=${esporta}><${Icon} n="download" /> Excel/CSV</button>
        <a class="btn primary" href=${nuovo}><${Icon} n="plus" /> Nuovo rientro</a>`}
    </${PageHeader}>
    <${AziendaTabs} value=${az} onChange=${setAz} counts=${counts} all />
    <div class="kpis">
      ${kpi("Aperti", base.filter((x) => x.stato !== "chiuso").length, "k-blue", stato === "aperto", () => setStato(stato === "aperto" ? "" : "aperto"))}
      ${kpi("Da collaudare", base.filter((x) => faseRientro(x) === "da_collaudare").length, "k-amber", fase === "da_collaudare", () => setFase(fase === "da_collaudare" ? "" : "da_collaudare"))}
      ${kpi("In garanzia", base.filter((x) => x.garanzia === "si").length, "k-green", gar === "si", () => setGar(gar === "si" ? "" : "si"))}
      ${kpi("Garanzia da valutare", base.filter((x) => x.garanzia === "da_valutare").length, "k-red", gar === "da_valutare", () => setGar(gar === "da_valutare" ? "" : "da_valutare"))}
    </div>
    <${Card}>
      <div class="filters">
        <div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca numero, matricola, mittente, DDT, causa…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="inp" value=${gar} onChange=${(e) => setGar(e.target.value)}><option value="">Garanzia: tutte</option>${GARANZIA.map((g) => html`<option value=${g.v}>${g.l}</option>`)}</select>
        <select class="inp" value=${fase} onChange=${(e) => setFase(e.target.value)}><option value="">Collaudo: tutti</option><option value="da_collaudare">Da collaudare</option><option value="in_collaudo">Collaudo in corso</option><option value="collaudato">Collaudati</option></select>
        <select class="inp" value=${stato} onChange=${(e) => setStato(e.target.value)}><option value="">Tutti gli stati</option><option value="aperto">Aperti</option><option value="chiuso">Chiusi</option></select>
        <select class="inp" value=${iso} onChange=${(e) => setIso(e.target.value)}><option value="">Olio e resina</option><option value="olio">Olio</option><option value="resina">Resina</option></select>
        <select class="inp" value=${anno} onChange=${(e) => setAnno(e.target.value)}><option value="">Tutti gli anni</option>${anni.map((a) => html`<option>${a}</option>`)}</select>
      </div>
      ${rows.length === 0 ? html`<${Empty} text=${base.length ? "Nessun rientro con questi filtri." : "Nessun rientro registrato."} />` : html`<div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Numero</th><th>Data</th><th>Mittente / causa</th><th>Trasformatore</th><th>Garanzia</th><th>Collaudo</th><th>Stato</th><th class="r">Azioni</th></tr></thead>
        <tbody>${rows.slice(0, n).map((x) => { const f = faseRientro(x), ko = koRientro(x), g = gg(x);
          return html`<tr key=${x.id} onClick=${() => go("/rientro/" + x.id)}>
            <td class="mono"><b>${x.numero}</b>${az === "all" && html`<div><${AziendaTag} v=${aziendaOf(x)} sm /></div>`}</td>
            <td class="mono">${fmtDate(x.data)}${x.stato !== "chiuso" && g !== null && html`<small class="muted block">da ${g} gg</small>`}</td>
            <td><b>${x.mittente || "—"}</b><small class="muted block ell">${x.causale || ""}</small></td>
            <td>${x.matricola ? html`<span class="mono">Matr. ${x.matricola}</span>` : html`<span class="muted">—</span>`}
              <small class="muted block">${[x.potenza && x.potenza + " kVA", x.gruppo, x.costruttore].filter(Boolean).join(" · ")}</small>
              ${x.isolamento && html`<${Badge} v=${x.isolamento} />`}</td>
            <td>${x.garanzia ? html`<${Badge} v=${"g_" + x.garanzia} />` : html`<span class="muted">—</span>`}</td>
            <td><${Badge} v=${f} />${ko > 0 && html` <span class="badge b-red">${ko} KO</span>`}</td>
            <td><${Badge} v=${x.stato || "aperto"} /></td>
            <td class="r nowrap" onClick=${(e) => e.stopPropagation()}>
              ${admin && f !== "collaudato" && html`<a class="btn outline sm" title="Compila / aggiorna Parte 2" href=${"#/rientro/" + x.id + "?p2"}><${Icon} n="zap" s=${14} /> Collaudo</a>`}
              <a class="btn ghost icon" title="Apri" href=${"#/rientro/" + x.id}><${Icon} n="eye" /></a>
              <button class="btn ghost icon" title="PDF" onClick=${() => pdfRientro(x)}><${Icon} n="download" /></button>
              ${admin ? html`<button class="btn ghost icon danger-t" title="Elimina" onClick=${() => del(x)}><${Icon} n="trash" /></button>`
                : html`<${GuestRowActions} entity="rientri" id=${x.id} label=${`Rientro ${x.numero} · ${x.matricola || x.mittente || ""}`} />`}
            </td></tr>`; })}</tbody></table></div>
        ${rows.length > n && html`<div class="center"><button class="btn outline" onClick=${() => setN(n + 100)}>Mostra altri (${rows.length - n})</button></div>`}`}
    </${Card}>
  </div>`;
}
