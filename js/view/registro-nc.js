import { html, useState, Icon, Badge, PageHeader, Card, Spinner, Empty, toast, confirmDialog, fmtDate, norm, download, csv, go } from "../ui.js";
import { isAdmin, remove } from "../store.js";
import { useCollections, byDateDesc, statoScadenza } from "./common.js";
import { GuestRowActions } from "../guest.js";
import { pdfNC } from "../pdf.js";
import { ORIGINI_NC } from "../config.js";

export function RegistroNC() {
  const [d] = useCollections(["nc"]);
  const [q, setQ] = useState("");
  const [orig, setOrig] = useState("");
  const [stato, setStato] = useState("");
  const [cls, setCls] = useState("");
  const [anno, setAnno] = useState("");
  const [n, setN] = useState(50);
  const admin = isAdmin();
  if (!d) return html`<${Spinner} />`;
  const N = d.nc;
  const anni = [...new Set(N.map((x) => (x.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const nq = norm(q);
  const rows = N.filter((x) => (!orig || (orig === "_" ? !x.origine_nc : x.origine_nc === orig)) && (!stato || x.stato === stato) && (!cls || x.classificazione === cls)
    && (!anno || (x.data || "").startsWith(anno))
    && (!nq || norm([x.numero_report, x.controparte, x.materiale_descrizione, x.descrizione_nc, x.documento_riferimento, x.responsabile_rilevazione, x.causa].join(" ")).includes(nq)))
    .sort(byDateDesc);
  const del = async (x) => {
    if (!(await confirmDialog("Eliminare la NC?", `NC ${x.numero_report} · ${x.materiale_descrizione || ""}`))) return;
    try { await remove("nc", x.id, x.numero_report); toast.ok("NC eliminata"); } catch (e) { toast.err("Eliminazione non riuscita"); }
  };
  const esporta = () => download(`registro_nc_${new Date().toISOString().slice(0, 10)}.csv`, csv([
    ["Numero", "Data", "Origine", "Classificazione", "Controparte", "Documento rif.", "Materiale", "Quantità", "Descrizione NC", "Responsabile", "Tipo trattamento", "Causa", "Trattamento", "Azione correttiva", "Efficacia", "Stato", "Data chiusura"],
    ...rows.map((x) => [x.numero_report, x.data, x.origine_nc, x.classificazione, x.controparte, x.documento_riferimento, x.materiale_descrizione, x.quantita, x.descrizione_nc,
      x.responsabile_rilevazione, x.trattamento_tipo, x.causa, x.trattamento, x.azione_correttiva, x.efficacia, x.stato, x.data_chiusura])]), "text/csv");

  return html`<div>
    <${PageHeader} title="Registro NC" subtitle=${`Storico non conformità · ${rows.length} di ${N.length}`}>
      ${admin && html`<button class="btn outline" onClick=${esporta}><${Icon} n="download" /> Excel/CSV</button>
        <a class="btn primary" href="#/nc"><${Icon} n="plus" /> Nuova NC</a>`}
    </${PageHeader}>
    <${Card}>
      <div class="filters">
        <div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca numero, controparte, materiale, descrizione…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="inp" value=${orig} onChange=${(e) => setOrig(e.target.value)}><option value="">Tutte le origini</option>${ORIGINI_NC.map((o) => html`<option>${o}</option>`)}<option value="_">Non specificata</option></select>
        <select class="inp" value=${cls} onChange=${(e) => setCls(e.target.value)}><option value="">Tutte le classi</option><option>RF</option><option>NC</option><option>RC</option></select>
        <select class="inp" value=${stato} onChange=${(e) => setStato(e.target.value)}><option value="">Tutti gli stati</option><option value="aperta">Aperte</option><option value="chiusa">Chiuse</option></select>
        <select class="inp" value=${anno} onChange=${(e) => setAnno(e.target.value)}><option value="">Tutti gli anni</option>${anni.map((a) => html`<option>${a}</option>`)}</select>
      </div>
      ${rows.length === 0 ? html`<${Empty} text="Nessuna NC trovata." />` : html`<div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Numero</th><th>Data</th><th>Origine</th><th>Controparte</th><th>Materiale</th><th>Stato</th><th class="r">Azioni</th></tr></thead>
        <tbody>${rows.slice(0, n).map((x) => { const sc = statoScadenza(x);
          return html`<tr key=${x.id} onClick=${() => go("/nc/" + x.id)}>
            <td class="mono"><b>${x.numero_report}</b>${x.classificazione && html` <span class="tag">${x.classificazione}</span>`}</td>
            <td class="mono">${fmtDate(x.data)}</td><td>${x.origine_nc || html`<span class="muted">—</span>`}</td><td>${x.controparte || "—"}</td>
            <td class="ell">${x.materiale_descrizione || "—"}</td>
            <td><${Badge} v=${x.stato} />${sc && sc.status !== "in_corso" && html` <${Badge} v=${sc.status} />`}</td>
            <td class="r nowrap" onClick=${(e) => e.stopPropagation()}>
              <a class="btn ghost icon" title="Apri" href=${"#/nc/" + x.id}><${Icon} n="eye" /></a>
              <button class="btn ghost icon" title="PDF" onClick=${() => pdfNC(x)}><${Icon} n="download" /></button>
              ${admin ? html`<button class="btn ghost icon danger-t" title="Elimina" onClick=${() => del(x)}><${Icon} n="trash" /></button>`
                : html`<${GuestRowActions} entity="nc" id=${x.id} label=${`NC ${x.numero_report} · ${x.materiale_descrizione || ""}`} />`}
            </td></tr>`; })}</tbody></table></div>
        ${rows.length > n && html`<div class="center"><button class="btn outline" onClick=${() => setN(n + 100)}>Mostra altre (${rows.length - n})</button></div>`}`}
    </${Card}>
  </div>`;
}
