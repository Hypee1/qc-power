import { html, useState, Icon, Badge, PageHeader, Card, Spinner, Empty, toast, confirmDialog, fmtDate, norm, calcEsito, download, csv, go } from "../ui.js";
import { isAdmin, remove } from "../store.js";
import { useCollections, byDateDesc } from "./common.js";
import { GuestRowActions } from "../guest.js";
import { pdfControllo } from "../pdf.js";

export function RegistroControlli() {
  const [d] = useCollections(["controlli"]);
  const [q, setQ] = useState("");
  const [perc, setPerc] = useState("");
  const [conf, setConf] = useState("");
  const [stato, setStato] = useState("");
  const [anno, setAnno] = useState("");
  const [n, setN] = useState(50);
  const admin = isAdmin();
  if (!d) return html`<${Spinner} />`;
  const C = d.controlli;
  const anni = [...new Set(C.map((c) => (c.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const nq = norm(q);
  const rows = C.filter((c) => (!perc || c.percorso === perc) && (!conf || c.conformita_generale === conf) && (!stato || c.stato === stato)
    && (!anno || (c.data || "").startsWith(anno))
    && (!nq || norm([c.fornitore, c.codice_commessa, c.codice_progetto, c.ddt, c.tipo, c.sottotipo, c.note, c.descrizione_materiale, c.dati_legacy && c.dati_legacy.dettaglio_materiale, c.compilatore].join(" ")).includes(nq)))
    .sort(byDateDesc);

  const del = async (c) => {
    if (!(await confirmDialog("Eliminare il controllo?", `${c.tipo} · ${c.fornitore} · ${fmtDate(c.data)}`))) return;
    try { await remove("controlli", c.id, `${c.tipo} ${c.fornitore}`); toast.ok("Controllo eliminato"); } catch (e) { toast.err("Eliminazione non riuscita"); }
  };
  const esporta = () => download(`registro_controlli_${new Date().toISOString().slice(0, 10)}.csv`, csv([
    ["Data", "Percorso", "Tipo", "Sottotipo/Materiale", "Fornitore", "DDT", "Commessa", "Progetto", "Descrizione", "Quote PASS", "Quote FAIL", "Conformità", "Stato", "Compilatore", "Note"],
    ...rows.map((c) => { const qq = c.controlli_dimensionali || []; return [c.data, c.percorso, c.tipo, c.sottotipo, c.fornitore, c.ddt, c.codice_commessa, c.codice_progetto,
      c.descrizione_materiale || (c.dati_legacy && c.dati_legacy.dettaglio_materiale) || "", qq.filter((x) => calcEsito(x) === "PASS").length, qq.filter((x) => calcEsito(x) === "FAIL").length,
      c.conformita_generale, c.stato, c.compilatore, c.note]; })]), "text/csv");

  return html`<div>
    <${PageHeader} title="Registro Controlli" subtitle=${`Storico controlli di accettazione · ${rows.length} di ${C.length}`}>
      ${admin && html`<button class="btn outline" onClick=${esporta}><${Icon} n="download" /> Excel/CSV</button>
        <a class="btn primary" href="#/controllo"><${Icon} n="plus" /> Nuovo Controllo</a>`}
    </${PageHeader}>
    <${Card}>
      <div class="filters">
        <div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca fornitore, commessa, DDT, materiale…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="inp" value=${perc} onChange=${(e) => setPerc(e.target.value)}><option value="">Tutti i percorsi</option><option value="carpenteria">Carpenteria</option><option value="produzione">Produzione</option></select>
        <select class="inp" value=${conf} onChange=${(e) => setConf(e.target.value)}><option value="">Tutte le conformità</option><option value="conforme">Conforme</option><option value="non_conforme">Non conforme</option><option value="con_riserva">Con riserva</option></select>
        <select class="inp" value=${stato} onChange=${(e) => setStato(e.target.value)}><option value="">Tutti gli stati</option><option value="bozza">Bozza</option><option value="completato">Completato</option></select>
        <select class="inp" value=${anno} onChange=${(e) => setAnno(e.target.value)}><option value="">Tutti gli anni</option>${anni.map((a) => html`<option>${a}</option>`)}</select>
      </div>
      ${rows.length === 0 ? html`<${Empty} text="Nessun controllo trovato." />` : html`<div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Data</th><th>Percorso / Tipo</th><th>Fornitore</th><th>DDT</th><th>Commessa</th><th>Quote</th><th>Conformità</th><th class="r">Azioni</th></tr></thead>
        <tbody>${rows.slice(0, n).map((c) => { const qq = c.controlli_dimensionali || []; const f = qq.filter((x) => calcEsito(x) === "FAIL").length; const p = qq.filter((x) => calcEsito(x) === "PASS").length;
          return html`<tr key=${c.id} onClick=${() => go("/controllo/" + c.id)}>
            <td class="mono">${fmtDate(c.data)}</td>
            <td><b>${c.percorso === "carpenteria" ? "Carpenteria" : "Produzione"}</b> · ${c.tipo || "—"}
              ${(c.descrizione_materiale || (c.dati_legacy && c.dati_legacy.dettaglio_materiale)) && html`<small class="muted block">${c.descrizione_materiale || c.dati_legacy.dettaglio_materiale}</small>`}</td>
            <td>${c.fornitore || "—"}</td><td class="mono small">${c.ddt || "—"}</td><td class="mono small">${c.codice_commessa || c.codice_progetto || "—"}</td>
            <td class="small">${qq.length ? html`<span class="t-green">${p}✓</span>${f ? html` <span class="t-red">${f}✗</span>` : ""}` : html`<span class="muted">—</span>`}</td>
            <td><${Badge} v=${c.conformita_generale} />${c.stato === "bozza" && html` <${Badge} v="bozza" />`}</td>
            <td class="r nowrap" onClick=${(e) => e.stopPropagation()}>
              <a class="btn ghost icon" title="Apri" href=${"#/controllo/" + c.id}><${Icon} n="eye" /></a>
              <button class="btn ghost icon" title="PDF" onClick=${() => pdfControllo(c)}><${Icon} n="download" /></button>
              ${admin ? html`<button class="btn ghost icon danger-t" title="Elimina" onClick=${() => del(c)}><${Icon} n="trash" /></button>`
                : html`<${GuestRowActions} entity="controlli" id=${c.id} label=${`Controllo ${c.tipo} · ${c.fornitore} · ${c.data}`} />`}
            </td></tr>`; })}</tbody></table></div>
        ${rows.length > n && html`<div class="center"><button class="btn outline" onClick=${() => setN(n + 100)}>Mostra altri (${rows.length - n})</button></div>`}`}
    </${Card}>
  </div>`;
}
