import { html, useState, useEffect, useRef, Icon, Badge, PageHeader, Card, Field, Select, Spinner, Empty, toast, confirmDialog, isoDay, fmtDate, fmtDT, norm, download, csv, go } from "../ui.js";
import { get, create, update, remove, isAdmin, audit, session } from "../store.js";
import { REPARTI, PERICOLI_NM, CAUSE_NM, CONSEGUENZE_NM, PROBABILITA_NM, CRITICITA_NM, critNM } from "../config.js";
import { Allegati, flushPending, SignaturePad } from "../widgets.js";
import { GuestPanel, GuestRowActions } from "../guest.js";
import { useCollections, suggestNumero, numeroDuplicato, Bars } from "./common.js";
import { CritPicker } from "./nc.js";
import { CRIT_COL } from "./report-nc.js";
import { pdfNearMiss } from "../pdf.js";
import { AziendaPicker, AziendaTag, AziendaTabs, aziendaOf, aziendaLabel, tabMemo, LOGO_SERVICE } from "../azienda.js";

export const STATI_NM = [{ v: "nm_aperto", l: "Aperto" }, { v: "nm_gestione", l: "In gestione" }, { v: "nm_chiuso", l: "Chiuso" }];
const ora = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const vuoto = (az = "") => ({ azienda: az, numero: "", data: isoDay(), ora: ora(), reparto: "", luogo: "", segnalato_da: "", persone_coinvolte: "", testimoni: "",
  tipo_pericolo: "", descrizione: "", conseguenza: "", cosa_poteva: "", probabilita: "", criticita: "",
  causa_categoria: "", causa: "", azioni_immediate: "", azioni: [], stato: "nm_aperto", data_chiusura: "", verifica_efficacia: "", note: "",
  firma_segnalatore: null, firma_responsabile: null });
// Criticità suggerita: gravità possibile + probabilità che si ripeta
export function critSuggerita(conseguenza, probabilita) {
  const g = CONSEGUENZE_NM.findIndex((x) => x.v === conseguenza), p = PROBABILITA_NM.findIndex((x) => x.v === probabilita);
  if (g < 0) return "";
  return String(Math.min(5, Math.max(1, g + Math.max(0, p))));
}
export const azioniAperte = (n) => (n.azioni || []).filter((a) => a.azione && !a.fatta);

export function NearMissForm({ id }) {
  const admin = isAdmin(), ro = !admin;
  const [n, setN] = useState(id ? null : vuoto(/az=service/.test(location.hash) ? "service" : /az=power/.test(location.hash) ? "power" : ""));
  const [all, setAll] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const dirty = useRef(false);
  const [d] = useCollections(["near_miss"]);
  useEffect(() => { if (d) setAll(d.near_miss); }, [d]);
  useEffect(() => {
    if (!id) return;
    get("near_miss", id).then((r) => {
      if (!r) { toast.err("Near miss non trovato"); return go("/registro-near-miss"); }
      setN({ ...vuoto(), ...r });
      if (!admin) audit("view", "near_miss", id, r.numero);
    }).catch((e) => toast.err("Errore di lettura: " + e.code));
  }, [id]);
  useEffect(() => {
    if (id || !n || !n.azienda || n.numero || !d) return;
    setN((x) => ({ ...x, numero: suggestNumero(d.near_miss.filter((y) => aziendaOf(y) === x.azienda), "numero") }));
  }, [n && n.azienda, d]);
  useEffect(() => {
    const f = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", f); return () => removeEventListener("beforeunload", f);
  }, []);
  if (!n) return html`<${Spinner} />`;
  const set = (k, v) => { dirty.current = true; setN((x) => ({ ...x, [k]: v })); };
  const az = aziendaOf(n);
  const dup = numeroDuplicato(all.filter((y) => aziendaOf(y) === az), n.numero, id, "numero");
  const sugg = critSuggerita(n.conseguenza, n.probabilita);

  if (!id && !n.azienda) return html`<div>
    <a class="back" href="#/registro-near-miss"><${Icon} n="back" s=${14} /> Registro Near Miss</a>
    <${PageHeader} title="Nuovo Near Miss" subtitle="Quasi incidente: scegli prima l'azienda" />
    <${Card} title="Dove è successo: MACE POWER o MACE SERVICE? *">
      <p class="muted small">I due registri near miss sono separati (schede Power / Service).</p>
      <${AziendaPicker} value="" onChange=${(v) => set("azienda", v)} />
    </${Card}></div>`;

  const setAz = (i, k, v) => { const a = [...(n.azioni || [])]; a[i] = { ...a[i], [k]: v }; if (k === "fatta" && v) a[i].data_fatta = isoDay(); set("azioni", a); };
  const salva = async () => {
    if (!n.numero.trim()) return toast.err("Inserisci il numero");
    if (!n.descrizione.trim()) return toast.err("Descrivi cosa è successo");
    if (dup && !(await confirmDialog("Numero già usato", `Esiste già un near miss ${aziendaLabel(az)} con numero ${n.numero}. Salvare comunque?`, "Salva comunque"))) return;
    if (!n.criticita && !(await confirmDialog("Livello di criticità mancante", "Non hai indicato il livello di criticità (serve per i report). Salvare comunque?", "Salva comunque"))) return;
    const body = { ...n, azienda: az, azioni: (n.azioni || []).filter((a) => a.azione || a.responsabile || a.scadenza) };
    if (body.stato === "nm_chiuso" && !body.data_chiusura) body.data_chiusura = isoDay();
    if (body.stato !== "nm_chiuso") body.data_chiusura = "";
    if (body.stato === "nm_chiuso" && azioniAperte(body).length && !(await confirmDialog("Azioni ancora aperte", `${azioniAperte(body).length} azioni correttive non sono segnate come fatte. Chiudere comunque?`, "Chiudi comunque"))) return;
    setBusy(true);
    try {
      const label = `Near miss ${body.numero}`;
      if (id) { await update("near_miss", id, body, label); setN(body); dirty.current = false; toast.ok("Near miss aggiornato"); }
      else {
        const r = await create("near_miss", body, label);
        await flushPending("near_miss", r.id, pending); setPending([]);
        dirty.current = false; toast.ok("Near miss registrato"); go("/near-miss/" + r.id); return;
      }
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  const elimina = async () => {
    if (!(await confirmDialog("Eliminare il near miss?", `Near miss ${n.numero}: verranno eliminate anche le foto.`))) return;
    await remove("near_miss", id, n.numero); dirty.current = false; toast.ok("Near miss eliminato"); go("/registro-near-miss");
  };
  const inp = (k, ph = "") => html`<input class="inp" placeholder=${ph} value=${n[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)} />`;
  const area = (k, ph = "", rows = 3) => html`<textarea class="inp" rows=${rows} placeholder=${ph} value=${n[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)}></textarea>`;
  const sel = (k, opts, ph = "Seleziona…") => html`<${Select} value=${n[k]} placeholder=${ph} disabled=${ro} options=${opts.map((o) => (typeof o === "string" ? { v: o, l: o } : o))} onChange=${(v) => set(k, v)} />`;

  return html`<div>
    <a class="back" href="#/registro-near-miss"><${Icon} n="back" s=${14} /> Registro Near Miss</a>
    <${PageHeader} title=${id ? "Near Miss " + n.numero : "Nuovo Near Miss"} subtitle=${[n.reparto, n.tipo_pericolo, n.data && fmtDate(n.data)].filter(Boolean).join(" · ") || "Quasi incidente: evento che poteva causare un infortunio o un danno"}>
      <${AziendaTag} v=${az} /> ${n.criticita && html`<${Badge} v=${"c" + n.criticita} />`} <${Badge} v=${n.stato} />
      ${id && html`<button class="btn outline" onClick=${() => pdfNearMiss({ ...n, id })}><${Icon} n="download" /> PDF</button>`}
      ${admin && id && html`<button class="btn ghost danger-t" title="Elimina" onClick=${elimina}><${Icon} n="trash" /></button>`}
      ${admin && html`<button class="btn primary" disabled=${busy} onClick=${salva}>${busy ? html`<span class="spin sm"></span>` : html`<${Icon} n="save" />`} Salva</button>`}
    </${PageHeader}>
    ${az === "service" && html`<div class="az-banner"><img src=${LOGO_SERVICE} alt="Mace Service" /><span>Near miss registrato per <b>MACE SERVICE</b> · registro Service</span></div>`}
    ${ro && html`<div class="ro-note"><${Icon} n="lock" s=${14} /> Modalità sola consultazione (Ospite). Modifiche disabilitate.</div>`}
    ${ro && html`<${GuestPanel} entity="near_miss" id=${id} label=${`Near miss ${n.numero}`} />`}

    <${Card} title="1 · Dati della segnalazione">
      <div class="form-grid">
        <${Field} label="Azienda *"><div class="az-inline"><${AziendaTag} v=${az} />${!ro && html` <button class="link-btn" onClick=${() => { set("azienda", az === "service" ? "power" : "service"); if (!id) set("numero", ""); }}>
          cambia in ${az === "service" ? "MACE POWER" : "MACE SERVICE"}</button>`}</div></${Field}>
        <${Field} label="Numero *" hint=${dup ? html`<span class="warn">⚠ Numero già usato</span>` : `Registro ${aziendaLabel(az)} · formato NN/AA`}>${inp("numero")}</${Field}>
        <${Field} label="Data *"><input type="date" class="inp" value=${n.data} disabled=${ro} onInput=${(e) => set("data", e.target.value)} /></${Field}>
        <${Field} label="Ora"><input type="time" class="inp" value=${n.ora} disabled=${ro} onInput=${(e) => set("ora", e.target.value)} /></${Field}>
        <${Field} label="Reparto / area"><input class="inp" list="dl-rep" value=${n.reparto} disabled=${ro} onInput=${(e) => set("reparto", e.target.value)} />
          <datalist id="dl-rep">${REPARTI.map((r) => html`<option value=${r} />`)}</datalist></${Field}>
        <${Field} label="Punto preciso">${inp("luogo", "es. corsia carroponte 2, banco avvolgitrice 3…")}</${Field}>
        <${Field} label="Segnalato da">${inp("segnalato_da", "Nome e cognome")}</${Field}>
        <${Field} label="Persone coinvolte">${inp("persone_coinvolte", "Chi era presente / esposto")}</${Field}>
        <${Field} label="Testimoni" full>${inp("testimoni", "Facoltativo")}</${Field}>
      </div>
    </${Card}>

    <${Card} title="2 · Cosa è successo">
      <div class="form-grid">
        <${Field} label="Tipo di pericolo">${sel("tipo_pericolo", PERICOLI_NM)}</${Field}>
        <${Field} label=" "><span></span></${Field}>
        <${Field} label="Descrizione dell'accaduto *" full>${area("descrizione", "Cosa stavate facendo, cosa è successo, perché non c'è stato l'infortunio…", 4)}</${Field}>
        <${Field} label="Cosa sarebbe potuto succedere" full>${area("cosa_poteva", "es. il pacco lamierini poteva cadere sul piede dell'operatore", 2)}</${Field}>
        <${Field} label="Conseguenza possibile (gravità)">${sel("conseguenza", CONSEGUENZE_NM)}</${Field}>
        <${Field} label="Probabilità che si ripeta">${sel("probabilita", PROBABILITA_NM)}</${Field}>
        <${Field} label="Livello di criticità *" full>
          <${CritPicker} value=${n.criticita} disabled=${ro} levels=${CRITICITA_NM} onChange=${(v) => set("criticita", v)} />
          ${sugg && !ro && String(n.criticita) !== sugg && html`<button class="link-btn" onClick=${() => set("criticita", sugg)}>
            <${Icon} n="wand" s=${12} /> In base a gravità e probabilità suggerisco: ${critNM(sugg).l} — usa questo</button>`}
        </${Field}>
      </div>
    </${Card}>

    <${Card} title="3 · Foto e documenti">
      <${Allegati} parentType="near_miss" parentId=${id} disabled=${ro} pending=${pending} onPending=${setPending}
        label="Foto del luogo / dell'attrezzatura, report, schizzi" btn="Aggiungi foto o file" accept="image/*,application/pdf,.doc,.docx" />
      <p class="muted small">Dal telefono puoi scattare la foto direttamente. Le foto finiscono anche nel PDF.</p>
    </${Card}>

    <${Card} title="4 · Cause e azioni">
      <div class="form-grid">
        <${Field} label="Causa principale">${sel("causa_categoria", CAUSE_NM)}</${Field}>
        <${Field} label=" "><span></span></${Field}>
        <${Field} label="Analisi della causa" full>${area("causa", "Perché è successo? (es. carico imbracato male, pavimento sporco d'olio…)")}</${Field}>
        <${Field} label="Azioni immediate (fatte subito)" full>${area("azioni_immediate", "es. area transennata, attrezzo tolto dall'uso, pulizia…", 2)}</${Field}>
      </div>
      <div class="sub-h"><label>Azioni correttive / preventive</label>
        ${!ro && html`<button class="btn outline sm" onClick=${() => set("azioni", [...(n.azioni || []), { azione: "", responsabile: "", scadenza: "", fatta: false }])}><${Icon} n="plus" s=${14} /> Aggiungi azione</button>`}</div>
      ${(n.azioni || []).length === 0 ? html`<p class="muted small">Nessuna azione. Le azioni con scadenza compaiono nel calendario.</p>` : html`<div class="tbl-wrap"><table class="tbl compact nm-az">
        <thead><tr><th>Azione</th><th>Responsabile</th><th>Scadenza</th><th>Fatta</th>${!ro && html`<th></th>`}</tr></thead>
        <tbody>${n.azioni.map((a, i) => html`<tr key=${i}>
          <td><input class="inp" value=${a.azione} disabled=${ro} placeholder="es. installare parapetto, formazione imbracatura…" onInput=${(e) => setAz(i, "azione", e.target.value)} /></td>
          <td><input class="inp" value=${a.responsabile} disabled=${ro} onInput=${(e) => setAz(i, "responsabile", e.target.value)} /></td>
          <td><input type="date" class="inp" value=${a.scadenza} disabled=${ro} onInput=${(e) => setAz(i, "scadenza", e.target.value)} /></td>
          <td class="nowrap"><label class="chk"><input type="checkbox" checked=${!!a.fatta} disabled=${ro} onChange=${(e) => setAz(i, "fatta", e.target.checked)} /> ${a.fatta && a.data_fatta ? fmtDate(a.data_fatta) : ""}</label></td>
          ${!ro && html`<td><button class="btn ghost icon sm danger-t" title="Togli" onClick=${() => set("azioni", n.azioni.filter((_, j) => j !== i))}><${Icon} n="trash" s=${14} /></button></td>`}
        </tr>`)}</tbody></table></div>`}
    </${Card}>

    <${Card} title="5 · Chiusura e firme">
      <div class="form-grid">
        <${Field} label="Stato">${sel("stato", STATI_NM, "—")}</${Field}>
        <${Field} label="Data chiusura"><input type="date" class="inp" value=${n.data_chiusura} disabled=${ro || n.stato !== "nm_chiuso"} onInput=${(e) => set("data_chiusura", e.target.value)} /></${Field}>
        <${Field} label="Verifica efficacia delle azioni" full>${area("verifica_efficacia", "Le azioni hanno eliminato il rischio? Come è stato verificato?", 2)}</${Field}>
        <${Field} label="Note" full>${area("note", "", 2)}</${Field}>
      </div>
      <div class="grid-2 sig-grid">
        <${SignaturePad} label="Firma di chi segnala" value=${n.firma_segnalatore} disabled=${ro} firmatario=${n.segnalato_da}
          onChange=${(v) => set("firma_segnalatore", v && { ...v, firmatario: n.segnalato_da || v.firmatario })} />
        <${SignaturePad} label="Firma responsabile / RSPP" value=${n.firma_responsabile} disabled=${ro}
          firmatario=${(n.firma_responsabile && n.firma_responsabile.firmatario) || ""} onFirmatario=${(v) => set("firma_responsabile", { ...(n.firma_responsabile || {}), firmatario: v })}
          onChange=${(v) => set("firma_responsabile", v && { ...v, firmatario: (n.firma_responsabile && n.firma_responsabile.firmatario) || v.firmatario })} />
      </div>
    </${Card}>
    ${id && html`<p class="meta muted small">Registrato ${fmtDT(n.created_at)} da ${n.created_by || "—"}${n.updated_by ? ` · Ultima modifica ${fmtDT(n.updated_at)} da ${n.updated_by}` : ""}</p>`}
  </div>`;
}

const memo = tabMemo("qc-tab-nm");
export function RegistroNearMiss() {
  const [d] = useCollections(["near_miss"]);
  const [az, setAzS] = useState(memo.get());
  const [q, setQ] = useState("");
  const [stato, setStato] = useState("");
  const [crit, setCrit] = useState("");
  const [rep, setRep] = useState("");
  const [anno, setAnno] = useState("");
  const admin = isAdmin();
  if (!d) return html`<${Spinner} />`;
  const ALL = d.near_miss;
  const setAz = (v) => { memo.set(v); setAzS(v); };
  const A = ALL.filter((x) => aziendaOf(x) === az);
  const counts = { power: ALL.filter((x) => aziendaOf(x) === "power").length, service: ALL.filter((x) => aziendaOf(x) === "service").length };
  const anni = [...new Set(A.map((x) => (x.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const reparti = [...new Set(A.map((x) => x.reparto).filter(Boolean))].sort();
  const nq = norm(q);
  const rows = A.filter((x) => (!stato || x.stato === stato) && (!anno || (x.data || "").startsWith(anno)) && (!rep || x.reparto === rep)
    && (!crit || (crit === "45" ? parseInt(x.criticita, 10) >= 4 : crit === "_" ? !x.criticita : String(x.criticita) === crit))
    && (!nq || norm([x.numero, x.reparto, x.luogo, x.tipo_pericolo, x.descrizione, x.segnalato_da, x.persone_coinvolte, x.causa].join(" ")).includes(nq)))
    .sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.numero || "").localeCompare(a.numero || ""));
  const del = async (x) => {
    if (!(await confirmDialog("Eliminare il near miss?", `${x.numero} · ${fmtDate(x.data)}`))) return;
    try { await remove("near_miss", x.id, x.numero); toast.ok("Near miss eliminato"); } catch (e) { toast.err("Eliminazione non riuscita"); }
  };
  const esporta = () => download(`registro_near_miss_${az}_${isoDay()}.csv`, csv([
    ["Azienda", "Numero", "Data", "Ora", "Reparto", "Punto", "Segnalato da", "Persone coinvolte", "Tipo pericolo", "Descrizione", "Cosa poteva succedere", "Conseguenza possibile", "Probabilità", "Criticità", "Causa", "Analisi causa", "Azioni immediate", "Azioni correttive", "Stato", "Data chiusura"],
    ...rows.map((x) => [aziendaLabel(aziendaOf(x)), x.numero, x.data, x.ora, x.reparto, x.luogo, x.segnalato_da, x.persone_coinvolte, x.tipo_pericolo, x.descrizione, x.cosa_poteva,
      (CONSEGUENZE_NM.find((c) => c.v === x.conseguenza) || {}).l || "", x.probabilita, (critNM(x.criticita) || {}).l || "", x.causa_categoria, x.causa, x.azioni_immediate,
      (x.azioni || []).map((a) => `${a.azione}${a.responsabile ? " (" + a.responsabile + ")" : ""}${a.scadenza ? " entro " + a.scadenza : ""}${a.fatta ? " ✓" : ""}`).join(" | "),
      (STATI_NM.find((s) => s.v === x.stato) || {}).l || "", x.data_chiusura])]), "text/csv");
  const k = (key, label, val, cls) => html`<button class=${"kpi kpi-btn " + cls + ((key === stato || key === crit) ? " sel" : "")}
    onClick=${() => { if (key === "45") setCrit(crit === "45" ? "" : "45"); else setStato(stato === key ? "" : key); }}><div><span class="lbl">${label}</span><b>${val}</b></div></button>`;
  const statRep = [...new Set(rows.map((x) => x.reparto || "Non indicato"))].map((r) => ({ l: r, v: rows.filter((x) => (x.reparto || "Non indicato") === r).length })).sort((a, b) => b.v - a.v).slice(0, 8);
  const statPer = [...new Set(rows.map((x) => x.tipo_pericolo || "Non indicato"))].map((r) => ({ l: r, v: rows.filter((x) => (x.tipo_pericolo || "Non indicato") === r).length })).sort((a, b) => b.v - a.v).slice(0, 8);

  return html`<div>
    <${PageHeader} title=${az === "service" ? "Registro Near Miss · Mace Service" : "Registro Near Miss"} subtitle=${`Quasi incidenti ${aziendaLabel(az)} · ${rows.length} di ${A.length}`}>
      ${admin && html`<button class="btn outline" onClick=${esporta}><${Icon} n="download" /> Excel/CSV</button>
        <a class="btn primary" href=${"#/near-miss?az=" + az}><${Icon} n="plus" /> Nuovo near miss ${az === "service" ? "Service" : ""}</a>`}
    </${PageHeader}>
    <${AziendaTabs} value=${az} onChange=${setAz} counts=${counts} />
    <div class="kpis">
      ${k("nm_aperto", "Aperti", A.filter((x) => x.stato === "nm_aperto").length, "k-red")}
      ${k("nm_gestione", "In gestione", A.filter((x) => x.stato === "nm_gestione").length, "k-amber")}
      ${k("nm_chiuso", "Chiusi", A.filter((x) => x.stato === "nm_chiuso").length, "k-green")}
      ${k("45", "Gravi / critici", A.filter((x) => parseInt(x.criticita, 10) >= 4).length, "k-orange")}
    </div>
    <${Card}>
      <div class="filters">
        <div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca numero, reparto, descrizione, persone…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="inp" value=${stato} onChange=${(e) => setStato(e.target.value)}><option value="">Tutti gli stati</option>${STATI_NM.map((s) => html`<option value=${s.v}>${s.l}</option>`)}</select>
        <select class="inp" value=${crit} onChange=${(e) => setCrit(e.target.value)}><option value="">Tutte le criticità</option>${CRITICITA_NM.map((c) => html`<option value=${c.v}>${c.l}</option>`)}<option value="45">Gravi e critici (4-5)</option><option value="_">Non indicata</option></select>
        <select class="inp" value=${rep} onChange=${(e) => setRep(e.target.value)}><option value="">Tutti i reparti</option>${reparti.map((r) => html`<option>${r}</option>`)}</select>
        <select class="inp" value=${anno} onChange=${(e) => setAnno(e.target.value)}><option value="">Tutti gli anni</option>${anni.map((y) => html`<option>${y}</option>`)}</select>
      </div>
      ${rows.length === 0 ? html`<${Empty} text=${A.length ? "Nessun near miss trovato." : "Nessun quasi incidente registrato. Premi «Nuovo near miss» per segnalarne uno."} icon="hardhat" />` : html`<div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Numero</th><th>Data</th><th>Reparto</th><th>Pericolo / descrizione</th><th>Criticità</th><th>Azioni</th><th>Stato</th><th class="r"></th></tr></thead>
        <tbody>${rows.map((x) => { const ap = azioniAperte(x).length, tot = (x.azioni || []).filter((a) => a.azione).length;
          return html`<tr key=${x.id} onClick=${() => go("/near-miss/" + x.id)}>
          <td class="mono"><b>${x.numero || "—"}</b></td>
          <td class="mono nowrap">${fmtDate(x.data)}${x.ora ? html`<br /><span class="muted">${x.ora}</span>` : ""}</td>
          <td>${x.reparto || html`<span class="muted">—</span>`}</td>
          <td class="ell"><b>${x.tipo_pericolo || "—"}</b><br /><small class="muted">${(x.descrizione || "").slice(0, 90)}${(x.descrizione || "").length > 90 ? "…" : ""}</small></td>
          <td>${x.criticita ? html`<${Badge} v=${"c" + x.criticita} />` : html`<span class="muted small">—</span>`}</td>
          <td class="small nowrap">${tot ? html`<span class=${ap ? "t-amber" : "t-green"}>${tot - ap}/${tot} fatte</span>` : html`<span class="muted">—</span>`}</td>
          <td><${Badge} v=${x.stato || "nm_aperto"} /></td>
          <td class="r nowrap" onClick=${(e) => e.stopPropagation()}>
            <button class="btn ghost icon" title="PDF" onClick=${() => pdfNearMiss(x)}><${Icon} n="download" /></button>
            ${admin ? html`<button class="btn ghost icon danger-t" title="Elimina" onClick=${() => del(x)}><${Icon} n="trash" /></button>`
              : html`<${GuestRowActions} entity="near_miss" id=${x.id} label=${`Near miss ${x.numero}`} />`}
          </td></tr>`; })}</tbody></table></div>`}
    </${Card}>
    ${rows.length > 0 && html`<div class="grid-2">
      <${Card} title="Dove succedono (reparti)"><${Bars} data=${statRep} color="var(--orange)" /></${Card}>
      <${Card} title="Tipi di pericolo"><${Bars} data=${statPer} color="var(--amber)" /></${Card}>
    </div>
    <${Card} title="Per livello di criticità"><${Bars} data=${CRITICITA_NM.map((c) => ({ l: c.l, v: rows.filter((x) => String(x.criticita) === c.v).length, c: CRIT_COL[c.c] }))} /></${Card}>`}
  </div>`;
}
