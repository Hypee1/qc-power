import { html, useState, useEffect, Icon, Badge, PageHeader, Card, Field, Spinner, Empty, Modal, toast, confirmDialog, fmtDate, isoDay, norm, toDate, download, csv } from "../ui.js";
import { isAdmin, create, update, remove } from "../store.js";
import { useCollections } from "./common.js";
import { AziendaTag, AziendaPicker, aziendaOf, aziendaLabel } from "../azienda.js";
import { SignaturePad } from "../widgets.js";
import { pdfRegistroAssegnazioni } from "../pdf.js";

// ============================================================
//  ASSEGNAZIONE STRUMENTI
//  operatori          → anagrafica (nome, cognome, area, azienda)
//  assegnazioni       → chi ha preso cosa e quando (contatore giorni)
//  catalogo_strumenti → elenco strumenti/materiali scelti dal menu
// ============================================================
export const AREE = ["Avvolgeria", "Montaggio", "Trattamento", "Collaudi", "Altro"];
const DEFAULT_STRUMENTI = ["Metro 2M", "Metro 3M", "Metro 5M"];

export const nomeOp = (o) => `${o.cognome || ""} ${o.nome || ""}`.trim();
export const areaOf = (o) => (o.area === "Altro" ? (o.area_altro ? "Altro · " + o.area_altro : "Altro") : o.area || "—");
const sortOp = (a, b) => (a.cognome || "").localeCompare(b.cognome || "", "it") || (a.nome || "").localeCompare(b.nome || "", "it");
const sortTxt = (a, b) => a.localeCompare(b, "it", { numeric: true });
export const inUso = (a) => !a.data_restituzione;
export function giorniAss(a) {
  const s = toDate(a.data_assegnazione); if (!s) return null;
  const e = a.data_restituzione ? toDate(a.data_restituzione) : toDate(isoDay());
  return Math.max(0, Math.round((e - s) / 86400000));
}
export const fmtGiorni = (g) => (g === null ? "—" : g === 0 ? "oggi" : g === 1 ? "1 giorno" : g + " giorni");
const byAssDesc = (a, b) => (b.data_assegnazione || "").localeCompare(a.data_assegnazione || "") || (b.created_at || "").localeCompare(a.created_at || "");
const initials = (o) => ((o.nome || " ")[0] + (o.cognome || " ")[0]).toUpperCase();

let seeded = false;

export function Strumenti() {
  const [d] = useCollections(["operatori", "assegnazioni", "catalogo_strumenti"]);
  const admin = isAdmin();
  const [tab, setTab] = useState("operatori");
  const [opEd, setOpEd] = useState(null);      // operatore in modifica
  const [assEd, setAssEd] = useState(null);    // nuova assegnazione {preset}
  const [detail, setDetail] = useState(null);  // id operatore aperto
  const [rest, setRest] = useState(null);      // assegnazione da restituire
  // filtri
  const [q, setQ] = useState("");
  const [az, setAz] = useState("all");
  const [area, setArea] = useState("");
  const [inattivi, setInattivi] = useState(false);
  const [st, setSt] = useState("in_uso");
  const [fStr, setFStr] = useState("");
  const [fOp, setFOp] = useState("");
  const [nuovoStr, setNuovoStr] = useState("");

  // Primo avvio: carica i tre metri di default nel catalogo
  useEffect(() => {
    if (!d || !admin || seeded || d.catalogo_strumenti.length) return;
    seeded = true;
    Promise.all(DEFAULT_STRUMENTI.map((nome) => create("catalogo_strumenti", { nome }, nome))).catch(() => { seeded = false; });
  }, [d && d.catalogo_strumenti.length]);

  if (!d) return html`<${Spinner} />`;
  const O = [...d.operatori].sort(sortOp);
  const A = [...d.assegnazioni].sort(byAssDesc);
  const catDocs = d.catalogo_strumenti;
  const catalogo = [...new Set([...(catDocs.length ? catDocs.map((c) => c.nome) : DEFAULT_STRUMENTI), ...A.map((a) => a.strumento)].filter(Boolean))].sort(sortTxt);
  const opById = Object.fromEntries(O.map((o) => [o.id, o]));
  const assDi = (opId) => A.filter((a) => a.operatore_id === opId);

  // ---------- Operatori ----------
  const nq = norm(q);
  const opRows = O.filter((o) => (inattivi || o.attivo !== false) && (az === "all" || aziendaOf(o) === az) && (!area || o.area === area)
    && (!nq || norm([o.nome, o.cognome, o.area, o.area_altro, o.note].join(" ")).includes(nq)));

  // ---------- Registro ----------
  const regRows = A.filter((a) => (st === "all" || (st === "in_uso" ? inUso(a) : !inUso(a))) && (az === "all" || aziendaOf(a) === az)
    && (!fStr || a.strumento === fStr) && (!fOp || a.operatore_id === fOp)
    && (!nq || norm([a.operatore_nome, a.operatore_area, a.strumento, a.codice, a.note].join(" ")).includes(nq)));
  const nInUso = A.filter(inUso).length;

  const delOp = async (o) => {
    const n = assDi(o.id).length;
    if (!(await confirmDialog("Eliminare l'operatore?", `${nomeOp(o)}${n ? ` · le sue ${n} assegnazioni restano nel registro con il nome salvato.` : ""} In alternativa puoi solo disattivarlo.`))) return;
    try { await remove("operatori", o.id, nomeOp(o)); setDetail(null); toast.ok("Operatore eliminato"); } catch (e) { toast.err("Errore: " + (e.code || e.message)); }
  };
  const delAss = async (a) => {
    if (!(await confirmDialog("Eliminare l'assegnazione?", `${a.strumento} · ${a.operatore_nome} · ${fmtDate(a.data_assegnazione)}`))) return;
    try { await remove("assegnazioni", a.id, `${a.strumento} → ${a.operatore_nome}`); toast.ok("Assegnazione eliminata"); } catch (e) { toast.err("Errore: " + (e.code || e.message)); }
  };
  const addCatalogo = async () => {
    const v = nuovoStr.trim(); if (!v) return;
    if (catalogo.some((c) => norm(c) === norm(v))) return toast.err("Già presente in elenco");
    try { await create("catalogo_strumenti", { nome: v }, v); setNuovoStr(""); toast.ok("Aggiunto all'elenco"); } catch (e) { toast.err("Errore: " + (e.code || e.message)); }
  };
  const delCatalogo = async (nome) => {
    const doc = catDocs.find((c) => c.nome === nome); if (!doc) return;
    if (!(await confirmDialog("Togliere dall'elenco?", `"${nome}" non comparirà più nel menu. Lo storico delle assegnazioni resta.`, "Togli"))) return;
    try { await remove("catalogo_strumenti", doc.id, nome); toast.ok("Tolto dall'elenco"); } catch (e) { toast.err("Errore: " + (e.code || e.message)); }
  };
  const esportaCsv = () => download(`assegnazioni_strumenti_${isoDay()}.csv`, csv([
    ["Operatore", "Area", "Azienda", "Strumento", "Quantità", "Codice", "Assegnato il", "Restituito il", "Giorni", "Note"],
    ...regRows.map((a) => [a.operatore_nome, a.operatore_area, aziendaLabel(aziendaOf(a)), a.strumento, a.quantita, a.codice, fmtDate(a.data_assegnazione),
      a.data_restituzione ? fmtDate(a.data_restituzione) : "", giorniAss(a), [a.note, a.note_restituzione].filter(Boolean).join(" · ")])]), "text/csv");
  const filtroDesc = [st === "in_uso" ? "Solo in uso" : st === "restituiti" ? "Solo restituiti" : "Tutte", az !== "all" && aziendaLabel(az), fStr, fOp && opById[fOp] && nomeOp(opById[fOp]), q && `"${q}"`].filter(Boolean).join(" · ");
  const vediStorico = (patch) => { setFStr(patch.strumento || ""); setFOp(patch.operatore || ""); setSt("all"); setTab("registro"); setDetail(null); };

  const aziendaSel = html`<select class="inp" value=${az} onChange=${(e) => setAz(e.target.value)}><option value="all">Tutte le aziende</option><option value="power">MACE POWER</option><option value="service">MACE SERVICE</option></select>`;
  const search = (ph) => html`<div class="search"><${Icon} n="search" /><input class="inp" placeholder=${ph} value=${q} onInput=${(e) => setQ(e.target.value)} /></div>`;
  const detOp = detail && opById[detail];

  return html`<div>
    <${PageHeader} title="Assegnazione Strumenti" subtitle=${`${O.filter((o) => o.attivo !== false).length} operatori · ${nInUso} strumenti in uso`}>
      ${admin && html`<button class="btn outline" onClick=${() => setOpEd({})}><${Icon} n="users" /> Nuovo operatore</button>
        <button class="btn primary" onClick=${() => setAssEd({})}><${Icon} n="plus" /> Assegna strumento</button>`}
    </${PageHeader}>
    <div class="tabs">
      <button class=${"tab" + (tab === "operatori" ? " on" : "")} onClick=${() => setTab("operatori")}><${Icon} n="users" s=${14} /> Operatori <em>${O.filter((o) => o.attivo !== false).length}</em></button>
      <button class=${"tab" + (tab === "registro" ? " on" : "")} onClick=${() => setTab("registro")}><${Icon} n="list" s=${14} /> Registro assegnazioni <em>${nInUso} in uso</em></button>
      <button class=${"tab" + (tab === "catalogo" ? " on" : "")} onClick=${() => setTab("catalogo")}><${Icon} n="ruler" s=${14} /> Strumenti <em>${catalogo.length}</em></button>
    </div>

    ${tab === "operatori" && html`<${Card}>
      <div class="filters">${search("Cerca operatore…")}${aziendaSel}
        <select class="inp" value=${area} onChange=${(e) => setArea(e.target.value)}><option value="">Tutte le aree</option>${AREE.map((a) => html`<option>${a}</option>`)}</select>
        <label class="chk small"><input type="checkbox" checked=${inattivi} onChange=${(e) => setInattivi(e.target.checked)} /> Mostra disattivati</label></div>
      ${O.length === 0 ? html`<${Empty} icon="users" text=${admin ? "Nessun operatore. Premi «Nuovo operatore» per iniziare." : "Nessun operatore registrato."} />`
        : opRows.length === 0 ? html`<${Empty} text="Nessun operatore con questi filtri." />` : html`<div class="op-grid">
        ${opRows.map((o) => { const mine = assDi(o.id); const uso = mine.filter(inUso); const last = mine[0];
          return html`<button key=${o.id} class=${"op-card" + (o.attivo === false ? " off" : "")} onClick=${() => setDetail(o.id)}>
            <span class=${"op-av " + (aziendaOf(o) === "service" ? "av-s" : "av-p")}>${initials(o)}</span>
            <span class="op-t"><b>${nomeOp(o)}</b><small>${areaOf(o)}</small>
              <span class="op-meta"><${AziendaTag} v=${aziendaOf(o)} sm />${o.attivo === false && html`<span class="tag">disattivato</span>`}</span>
              <small class="op-last">${uso.length ? html`<b class="t-amber">${uso.length} in uso</b> · ${uso.map((a) => a.strumento).join(", ")}`
                : last ? html`Ultimo: ${last.strumento} · ${fmtDate(last.data_assegnazione)}` : html`<span class="muted">Nessuna assegnazione</span>`}</small></span>
            <${Icon} n="next" s=${14} /></button>`; })}</div>`}
    </${Card}>`}

    ${tab === "registro" && html`<${Card}>
      <div class="filters">${search("Cerca operatore, strumento, codice…")}${aziendaSel}
        <select class="inp" value=${st} onChange=${(e) => setSt(e.target.value)}><option value="in_uso">Solo in uso</option><option value="restituiti">Solo restituiti</option><option value="all">Tutte (cronologia)</option></select>
        <select class="inp" value=${fStr} onChange=${(e) => setFStr(e.target.value)}><option value="">Tutti gli strumenti</option>${catalogo.map((c) => html`<option>${c}</option>`)}</select>
        <select class="inp" value=${fOp} onChange=${(e) => setFOp(e.target.value)}><option value="">Tutti gli operatori</option>${O.map((o) => html`<option value=${o.id}>${nomeOp(o)}</option>`)}</select>
        <button class="btn outline sm" onClick=${() => pdfRegistroAssegnazioni(regRows, filtroDesc)}><${Icon} n="download" s=${14} /> PDF</button>
        <button class="btn ghost sm" onClick=${esportaCsv}><${Icon} n="download" s=${14} /> CSV</button>
      </div>
      ${regRows.length === 0 ? html`<${Empty} text=${A.length ? "Nessuna assegnazione con questi filtri." : "Nessuna assegnazione registrata."} />` : html`<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Operatore</th><th>Azienda</th><th>Strumento / materiale</th><th>Assegnato il</th><th>Da quanto</th><th>Stato</th><th class="r">Azioni</th></tr></thead>
        <tbody>${regRows.map((a) => { const g = giorniAss(a);
          return html`<tr key=${a.id}>
            <td><a class="link-row" onClick=${() => opById[a.operatore_id] && setDetail(a.operatore_id)}><b>${a.operatore_nome}</b></a><small class="muted block">${a.operatore_area || ""}</small></td>
            <td><${AziendaTag} v=${aziendaOf(a)} sm /></td>
            <td><b>${a.strumento}</b>${a.quantita && a.quantita !== "1" ? html` <span class="tag">×${a.quantita}</span>` : ""}${a.codice && html`<small class="muted block mono">${a.codice}</small>`}
              ${a.note && html`<small class="muted block">${a.note}</small>`}</td>
            <td class="mono">${fmtDate(a.data_assegnazione)}</td>
            <td><span class=${"days" + (inUso(a) ? " live" : "")}>${fmtGiorni(g)}</span></td>
            <td><${Badge} v=${inUso(a) ? "in_uso" : "restituito"} />${!inUso(a) && html`<small class="muted block">${fmtDate(a.data_restituzione)}</small>`}</td>
            <td class="r nowrap">${admin && html`${inUso(a) && html`<button class="btn outline sm" onClick=${() => setRest(a)}><${Icon} n="undo" s=${14} /> Restituito</button>`}
              <button class="btn ghost icon danger-t" title="Elimina" onClick=${() => delAss(a)}><${Icon} n="trash" /></button>`}</td></tr>`; })}</tbody></table></div>`}
    </${Card}>`}

    ${tab === "catalogo" && html`<${Card}>
      ${admin && html`<div class="filters"><input class="inp grow" placeholder="Nuovo strumento o materiale (es. Calibro 150 mm)" value=${nuovoStr} onInput=${(e) => setNuovoStr(e.target.value)}
        onKeyDown=${(e) => e.key === "Enter" && addCatalogo()} /><button class="btn primary" onClick=${addCatalogo}><${Icon} n="plus" /> Aggiungi all'elenco</button></div>`}
      <div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Strumento / materiale</th><th>In uso ora</th><th>Assegnazioni totali</th><th>Ultimo assegnatario</th><th class="r"></th></tr></thead>
        <tbody>${catalogo.map((c) => { const rows = A.filter((a) => a.strumento === c); const uso = rows.filter(inUso).length;
          return html`<tr key=${c} onClick=${() => vediStorico({ strumento: c })}>
            <td><b>${c}</b>${!catDocs.some((x) => x.nome === c) && catDocs.length > 0 && html` <span class="tag">non in elenco</span>`}</td>
            <td>${uso ? html`<b class="t-amber">${uso}</b>` : html`<span class="muted">0</span>`}</td><td>${rows.length}</td>
            <td>${rows[0] ? html`${rows[0].operatore_nome} <small class="muted">· ${fmtDate(rows[0].data_assegnazione)}</small>` : html`<span class="muted">—</span>`}</td>
            <td class="r nowrap" onClick=${(e) => e.stopPropagation()}><button class="btn ghost sm" onClick=${() => vediStorico({ strumento: c })}><${Icon} n="history" s=${14} /> Cronologia</button>
              ${admin && catDocs.some((x) => x.nome === c) && html`<button class="btn ghost icon danger-t" title="Togli dall'elenco" onClick=${() => delCatalogo(c)}><${Icon} n="trash" /></button>`}</td></tr>`; })}</tbody></table></div>
    </${Card}>`}

    ${detOp && html`<${Modal} open wide title=${nomeOp(detOp)} onClose=${() => setDetail(null)}
      footer=${html`${admin && html`<button class="btn ghost danger-t" onClick=${() => delOp(detOp)}><${Icon} n="trash" /> Elimina</button>
        <button class="btn outline" onClick=${() => { setOpEd(detOp); }}><${Icon} n="pencil" /> Modifica</button>
        <button class="btn primary" onClick=${() => setAssEd({ azienda: aziendaOf(detOp), operatore_id: detOp.id })}><${Icon} n="plus" /> Assegna strumento</button>`}
        ${!admin && html`<button class="btn outline" onClick=${() => setDetail(null)}>Chiudi</button>`}`}>
      <${OperatoreDettaglio} o=${detOp} rows=${assDi(detOp.id)} admin=${admin} onRest=${setRest} onStorico=${() => vediStorico({ operatore: detOp.id })} />
    </${Modal}>`}
    ${opEd && html`<${OperatoreModal} op=${opEd} onClose=${() => setOpEd(null)} />`}
    ${assEd && html`<${AssegnaModal} preset=${assEd} operatori=${O} assegnazioni=${A} catalogo=${catalogo} onClose=${() => setAssEd(null)} />`}
    ${rest && html`<${RestituzioneModal} a=${rest} onClose=${() => setRest(null)} />`}
  </div>`;
}

function OperatoreDettaglio({ o, rows, admin, onRest, onStorico }) {
  const uso = rows.filter(inUso), last = rows[0];
  return html`<div class="form-col">
    <div class="kv-grid">
      <div><span class="lbl">Nome</span><b>${o.nome}</b></div><div><span class="lbl">Cognome</span><b>${o.cognome}</b></div>
      <div><span class="lbl">Area di lavoro</span><b>${areaOf(o)}</b></div><div><span class="lbl">Azienda</span><b><${AziendaTag} v=${aziendaOf(o)} /></b></div>
      ${o.note && html`<div class="full"><span class="lbl">Note</span><b>${o.note}</b></div>`}
    </div>
    <div><div class="lbl">Ultima assegnazione</div>
      ${last ? html`<div class="last-box"><b>${last.strumento}</b>${last.quantita && last.quantita !== "1" ? ` ×${last.quantita}` : ""} · assegnato il ${fmtDate(last.data_assegnazione)}
        · <span class=${"days" + (inUso(last) ? " live" : "")}>${fmtGiorni(giorniAss(last))}</span> ${inUso(last) ? html`<${Badge} v="in_uso" />` : html`<${Badge} v="restituito" />`}</div>`
        : html`<p class="muted small">Nessuna assegnazione per questo operatore.</p>`}</div>
    ${uso.length > 0 && html`<div><div class="lbl">In uso ora (${uso.length})</div><div class="mini-list">
      ${uso.map((a) => html`<div class="mini" key=${a.id}><div class="grow"><b>${a.strumento}</b>${a.codice ? html`<small class="mono">${a.codice}</small>` : html`<small>${a.note || ""}</small>`}</div>
        <span class="muted small">dal ${fmtDate(a.data_assegnazione)}</span><span class="days live">${fmtGiorni(giorniAss(a))}</span>
        ${admin && html`<button class="btn outline sm" onClick=${() => onRest(a)}><${Icon} n="undo" s=${14} /> Restituito</button>`}</div>`)}</div></div>`}
    <div><div class="row-between"><span class="lbl">Cronologia (${rows.length})</span>${rows.length > 0 && html`<button class="link-btn" onClick=${onStorico}>Apri nel registro →</button>`}</div>
      ${rows.length === 0 ? html`<p class="muted small">—</p>` : html`<div class="tbl-wrap"><table class="tbl small">
        <thead><tr><th>Strumento</th><th>Assegnato</th><th>Restituito</th><th>Giorni</th><th>Note</th></tr></thead>
        <tbody>${rows.map((a) => html`<tr key=${a.id}><td><b>${a.strumento}</b>${a.quantita && a.quantita !== "1" ? ` ×${a.quantita}` : ""}</td><td class="mono">${fmtDate(a.data_assegnazione)}</td>
          <td class="mono">${a.data_restituzione ? fmtDate(a.data_restituzione) : html`<${Badge} v="in_uso" />`}</td><td>${fmtGiorni(giorniAss(a))}</td>
          <td class="small muted">${[a.codice, a.note, a.note_restituzione].filter(Boolean).join(" · ")}</td></tr>`)}</tbody></table></div>`}</div>
  </div>`;
}

function OperatoreModal({ op, onClose }) {
  const [f, setF] = useState({ nome: "", cognome: "", azienda: "", area: "", area_altro: "", note: "", attivo: true, ...op });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const salva = async () => {
    if (!f.nome.trim() || !f.cognome.trim()) return toast.err("Nome e cognome sono obbligatori");
    if (!f.azienda) return toast.err("Scegli l'azienda: MACE POWER o MACE SERVICE");
    if (!f.area) return toast.err("Scegli l'area di lavoro");
    if (f.area === "Altro" && !f.area_altro.trim()) return toast.err("Specifica l'area (Altro)");
    const body = { ...f, nome: f.nome.trim(), cognome: f.cognome.trim(), area_altro: f.area === "Altro" ? f.area_altro.trim() : "" };
    setBusy(true);
    try {
      if (f.id) await update("operatori", f.id, body, nomeOp(body)); else await create("operatori", body, nomeOp(body));
      toast.ok(f.id ? "Operatore aggiornato" : "Operatore aggiunto"); onClose();
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  return html`<${Modal} open title=${f.id ? "Modifica operatore" : "Nuovo operatore"} onClose=${onClose}
    footer=${html`<button class="btn outline" onClick=${onClose}>Annulla</button><button class="btn primary" disabled=${busy} onClick=${salva}><${Icon} n="save" /> Salva</button>`}>
    <div class="form-col">
      <div class="form-grid two">
        <${Field} label="Nome *"><input class="inp" value=${f.nome} onInput=${(e) => set("nome", e.target.value)} /></${Field}>
        <${Field} label="Cognome *"><input class="inp" value=${f.cognome} onInput=${(e) => set("cognome", e.target.value)} /></${Field}>
      </div>
      <${Field} label="Azienda di appartenenza *"><${AziendaPicker} value=${f.azienda} onChange=${(v) => set("azienda", v)} /></${Field}>
      <${Field} label="Area di lavoro *"><div class="seg">${AREE.map((a) => html`<button type="button" key=${a} class=${"seg-b" + (f.area === a ? " on" : "")} onClick=${() => set("area", a)}>${a}</button>`)}</div></${Field}>
      ${f.area === "Altro" && html`<${Field} label="Specifica area *"><input class="inp" placeholder="es. Magazzino, Verniciatura…" value=${f.area_altro} onInput=${(e) => set("area_altro", e.target.value)} /></${Field}>`}
      <${Field} label="Note"><input class="inp" value=${f.note} onInput=${(e) => set("note", e.target.value)} /></${Field}>
      ${f.id && html`<label class="chk"><input type="checkbox" checked=${f.attivo !== false} onChange=${(e) => set("attivo", e.target.checked)} /> Operatore attivo (se lo togli non compare più nel menu di assegnazione)</label>`}
    </div></${Modal}>`;
}

function AssegnaModal({ preset, operatori, assegnazioni, catalogo, onClose }) {
  const [f, setF] = useState({ azienda: "", operatore_id: "", strumento: "", nuovo: "", quantita: "1", codice: "", data_assegnazione: isoDay(), note: "", firma: null, ...preset });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ops = operatori.filter((o) => o.attivo !== false && aziendaOf(o) === f.azienda);
  const op = operatori.find((o) => o.id === f.operatore_id);
  const giaInUso = op ? assegnazioni.filter((a) => a.operatore_id === op.id && inUso(a)) : [];
  const strumento = f.strumento === "__new" ? f.nuovo.trim() : f.strumento;
  const salva = async () => {
    if (!f.azienda) return toast.err("Scegli l'azienda: MACE POWER o MACE SERVICE");
    if (!op) return toast.err("Scegli l'operatore");
    if (!strumento) return toast.err("Scegli lo strumento");
    if (!f.data_assegnazione) return toast.err("Inserisci la data di assegnazione");
    setBusy(true);
    try {
      if (f.strumento === "__new" && !catalogo.some((c) => norm(c) === norm(strumento))) await create("catalogo_strumenti", { nome: strumento }, strumento);
      const nome = nomeOp(op);
      await create("assegnazioni", {
        operatore_id: op.id, operatore_nome: nome, operatore_area: areaOf(op), azienda: f.azienda, strumento,
        quantita: String(f.quantita || "1"), codice: f.codice.trim(), data_assegnazione: f.data_assegnazione, data_restituzione: "", note: f.note.trim(),
        firma: f.firma ? { ...f.firma, firmatario: f.firma.firmatario || nome } : null,
      }, `${strumento} → ${nome}`);
      toast.ok(`${strumento} assegnato a ${nome}`); onClose();
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  return html`<${Modal} open wide title="Assegna strumento" onClose=${onClose}
    footer=${html`<button class="btn outline" onClick=${onClose}>Annulla</button><button class="btn primary" disabled=${busy} onClick=${salva}><${Icon} n="save" /> Registra assegnazione</button>`}>
    <div class="form-col">
      <${Field} label="1 · Azienda *"><${AziendaPicker} value=${f.azienda} onChange=${(v) => setF((x) => ({ ...x, azienda: v, operatore_id: v === x.azienda ? x.operatore_id : "" }))} /></${Field}>
      ${f.azienda && html`<div class="form-grid two">
        <${Field} label="2 · Operatore * (ordine alfabetico)" hint=${!ops.length ? "Nessun operatore attivo per questa azienda: aggiungilo prima da «Nuovo operatore»." : ""}>
          <select class="inp" value=${f.operatore_id} onChange=${(e) => set("operatore_id", e.target.value)}><option value="">Seleziona operatore…</option>
            ${ops.map((o) => html`<option value=${o.id} selected=${o.id === f.operatore_id}>${nomeOp(o)} — ${areaOf(o)}</option>`)}</select></${Field}>
        <${Field} label="3 · Strumento / materiale *">
          <select class="inp" value=${f.strumento} onChange=${(e) => set("strumento", e.target.value)}><option value="">Seleziona…</option>
            ${catalogo.map((c) => html`<option value=${c} selected=${c === f.strumento}>${c}</option>`)}<option value="__new">＋ Nuovo strumento…</option></select></${Field}>
        ${f.strumento === "__new" && html`<${Field} label="Nome nuovo strumento *" hint="Resterà nell'elenco per le prossime volte"><input class="inp" autofocus placeholder="es. Metro 10M, Calibro…" value=${f.nuovo} onInput=${(e) => set("nuovo", e.target.value)} /></${Field}>`}
        <${Field} label="Quantità"><input class="inp" type="number" min="1" value=${f.quantita} onInput=${(e) => set("quantita", e.target.value)} /></${Field}>
        <${Field} label="Codice / n° serie (facoltativo)"><input class="inp" value=${f.codice} onInput=${(e) => set("codice", e.target.value)} /></${Field}>
        <${Field} label="Data assegnazione *"><input type="date" class="inp" value=${f.data_assegnazione} onInput=${(e) => set("data_assegnazione", e.target.value)} /></${Field}>
        <${Field} label="Note" full><input class="inp" value=${f.note} onInput=${(e) => set("note", e.target.value)} /></${Field}>
      </div>`}
      ${giaInUso.length > 0 && html`<div class="ro-note"><${Icon} n="alert" s=${14} /> ${nomeOp(op)} ha già in uso: ${giaInUso.map((a) => `${a.strumento} (${fmtGiorni(giorniAss(a))})`).join(", ")}</div>`}
      ${op && html`<${SignaturePad} label="Firma operatore per ricevuta (facoltativa)" value=${f.firma} firmatario=${(f.firma && f.firma.firmatario) || nomeOp(op)} onChange=${(v) => set("firma", v)} />`}
    </div></${Modal}>`;
}

function RestituzioneModal({ a, onClose }) {
  const [data, setData] = useState(isoDay());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const salva = async () => {
    if (!data) return toast.err("Inserisci la data");
    if (data < (a.data_assegnazione || "")) return toast.err("La restituzione non può essere prima dell'assegnazione");
    setBusy(true);
    try { await update("assegnazioni", a.id, { data_restituzione: data, note_restituzione: note.trim() }, `${a.strumento} ← ${a.operatore_nome} (restituito)`); toast.ok("Restituzione registrata"); onClose(); }
    catch (e) { toast.err("Errore: " + (e.code || e.message)); }
    setBusy(false);
  };
  return html`<${Modal} open title=${"Restituzione · " + a.strumento} onClose=${onClose}
    footer=${html`<button class="btn outline" onClick=${onClose}>Annulla</button><button class="btn primary" disabled=${busy} onClick=${salva}><${Icon} n="undo" /> Conferma restituzione</button>`}>
    <div class="form-col">
      <p class="muted small">${a.operatore_nome} · assegnato il ${fmtDate(a.data_assegnazione)} (${fmtGiorni(giorniAss(a))})</p>
      <${Field} label="Data restituzione"><input type="date" class="inp" value=${data} onInput=${(e) => setData(e.target.value)} /></${Field}>
      <${Field} label="Note (es. condizioni, sostituito, smarrito…)"><input class="inp" value=${note} onInput=${(e) => setNote(e.target.value)} /></${Field}>
    </div></${Modal}>`;
}
