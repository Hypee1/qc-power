import { html, useState, Icon, Badge, PageHeader, Card, Spinner, Empty, toast, confirmDialog, fmtDate, norm, download, csv, go, isoDay } from "../ui.js";
import { isAdmin, remove } from "../store.js";
import { useCollections, byDateDesc } from "./common.js";
import { GuestRowActions } from "../guest.js";
import { pdfResistenze, pdfRegistroResistenze } from "../pdf.js";
import { calcVerifica, fmtOhm, fmtW, fmtPct } from "../resistenze-calc.js";

// I risultati vengono ricalcolati dai dati grezzi: se cambi una formula il registro resta coerente
export const risultati = (x) => { const v = calcVerifica(x); return { v, pri_r75: v.P.r75, sec_r75: v.S.r75, p_tot: v.mTot, p_spec: v.sTot, pmax: v.pmax, esito: v.esito }; };

export function RegistroResistenze() {
  const [d] = useCollections(["resistenze"]);
  const [q, setQ] = useState("");
  const [esito, setEsito] = useState("");
  const [anno, setAnno] = useState("");
  const [n, setN] = useState(50);
  const admin = isAdmin();
  if (!d) return html`<${Spinner} />`;
  const R = d.resistenze.map((x) => ({ ...x, _r: risultati(x) }));
  const anni = [...new Set(R.map((x) => (x.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const nq = norm(q);
  const rows = R.filter((x) => (!esito || x._r.esito === esito) && (!anno || (x.data || "").startsWith(anno))
    && (!nq || norm([x.codice_progetto, x.matricola, x.commessa, x.eseguito_da, x.note, x.potenza_kva].join(" ")).includes(nq))).sort(byDateDesc);
  const del = async (x) => {
    if (!(await confirmDialog("Eliminare la misura?", `${x.codice_progetto} · ${fmtDate(x.data)}`))) return;
    try { await remove("resistenze", x.id, x.codice_progetto); toast.ok("Misura eliminata"); } catch (e) { toast.err("Eliminazione non riuscita"); }
  };
  const num = (v, d = 4) => (v === null || v === undefined ? "" : String(Math.round(v * 10 ** d) / 10 ** d).replace(".", ","));
  const esporta = () => download(`registro_resistenze_${isoDay()}.csv`, csv([
    ["Data", "Codice progetto", "Matricola", "Commessa", "kVA", "Eseguito da", "R AT 75°C (Ω)", "R BT 75°C (Ω)", "Perdite AT (W)", "Perdite BT (W)", "Perdite tot. (W)", "Perdite spec. (W)", "Pmax %", "Esito", "Note"],
    ...rows.map((x) => { const v = x._r.v; return [x.data, x.codice_progetto, x.matricola, x.commessa, x.potenza_kva, x.eseguito_da, num(v.P.r75, 6), num(v.S.r75, 8), num(v.P.pTot, 1), num(v.S.pTot, 1),
      num(v.mTot, 1), num(v.sTot, 1), num(v.pmax, 2), x._r.esito.replace("_", " "), x.note]; })]), "text/csv");
  const kpi = (label, val, cls, key) => html`<button class=${"kpi kpi-btn " + cls + (esito === key ? " sel" : "")} onClick=${() => setEsito(key === null || esito === key ? "" : key)}><div><span class="lbl">${label}</span><b>${val}</b></div></button>`;
  const desc = [esito && esito.replace("_", " "), anno, q && `"${q}"`].filter(Boolean).join(" · ") || "tutte le misure";

  return html`<div>
    <${PageHeader} title="Resistenze fuori cassa" subtitle=${`Controllo e registro resistenze avvolgimenti · ${rows.length} di ${R.length}`}>
      <button class="btn outline" onClick=${() => pdfRegistroResistenze(rows, desc)}><${Icon} n="download" /> PDF registro</button>
      ${admin && html`<button class="btn outline" onClick=${esporta}><${Icon} n="download" /> Excel/CSV</button>
        <a class="btn primary" href="#/resistenza"><${Icon} n="plus" /> Nuova misura</a>`}
    </${PageHeader}>
    <div class="kpis">
      ${kpi("Misure totali", R.length, "k-blue", null)}
      ${kpi("Conformi", R.filter((x) => x._r.esito === "conforme").length, "k-green", "conforme")}
      ${kpi("Non conformi", R.filter((x) => x._r.esito === "non_conforme").length, "k-red", "non_conforme")}
      ${kpi("Senza specifica", R.filter((x) => x._r.esito === "nd").length, "k-amber", "nd")}
    </div>
    <${Card}>
      <div class="filters">
        <div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca codice progetto, matricola, commessa…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="inp" value=${esito} onChange=${(e) => setEsito(e.target.value)}><option value="">Tutti gli esiti</option><option value="conforme">Conformi</option><option value="non_conforme">Non conformi</option><option value="nd">Senza specifica</option></select>
        <select class="inp" value=${anno} onChange=${(e) => setAnno(e.target.value)}><option value="">Tutti gli anni</option>${anni.map((a) => html`<option>${a}</option>`)}</select>
      </div>
      ${rows.length === 0 ? html`<${Empty} text=${R.length ? "Nessuna misura con questi filtri." : "Nessuna misura registrata."} />` : html`<div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Data</th><th>Progetto</th><th class="r">kVA</th><th class="r">R AT 75 °C</th><th class="r">R BT 75 °C</th><th class="r">Perdite spec.</th><th class="r">Perdite mis.</th><th class="r">Pmax</th><th>Esito</th><th class="r">Azioni</th></tr></thead>
        <tbody>${rows.slice(0, n).map((x) => { const v = x._r.v;
          return html`<tr key=${x.id} onClick=${() => go("/resistenza/" + x.id)}>
            <td class="mono">${fmtDate(x.data)}</td>
            <td><b>${x.codice_progetto}</b><small class="muted block">${[x.matricola && "Matr. " + x.matricola, x.eseguito_da].filter(Boolean).join(" · ")}</small></td>
            <td class="r mono">${x.potenza_kva || "—"}</td>
            <td class="r mono">${fmtOhm(v.P.r75)}</td><td class="r mono">${fmtOhm(v.S.r75)}</td>
            <td class="r mono">${fmtW(v.sTot)}</td><td class="r mono">${fmtW(v.mTot)}</td>
            <td class=${"r mono " + (v.pmax === null ? "" : v.pmax <= v.toll.p_tot ? "t-green" : "t-red")}><b>${fmtPct(v.pmax)}</b></td>
            <td><${Badge} v=${x._r.esito} />${v.squilibrioAlto && html` <span class="tag t-amber" title="Squilibrio letture alto">⚠</span>`}</td>
            <td class="r nowrap" onClick=${(e) => e.stopPropagation()}>
              <a class="btn ghost icon" title="Apri" href=${"#/resistenza/" + x.id}><${Icon} n="eye" /></a>
              ${admin && html`<a class="btn ghost icon" title="Duplica (stesso progetto)" href=${"#/resistenza?dup=" + x.id}><${Icon} n="layers" /></a>`}
              <button class="btn ghost icon" title="PDF" onClick=${() => pdfResistenze(x)}><${Icon} n="download" /></button>
              ${admin ? html`<button class="btn ghost icon danger-t" title="Elimina" onClick=${() => del(x)}><${Icon} n="trash" /></button>`
                : html`<${GuestRowActions} entity="resistenze" id=${x.id} label=${`Resistenze ${x.codice_progetto}`} />`}
            </td></tr>`; })}</tbody></table></div>
        ${rows.length > n && html`<div class="center"><button class="btn outline" onClick=${() => setN(n + 100)}>Mostra altre (${rows.length - n})</button></div>`}`}
    </${Card}>
  </div>`;
}
