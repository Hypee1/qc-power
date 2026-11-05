import { html, useState, useEffect, useRef, Icon, Badge, PageHeader, Card, Field, Spinner, toast, confirmDialog, isoDay, fmtDate, fmtDT, go } from "../ui.js";
import { get, create, update, remove, isAdmin, audit, list, session } from "../store.js";
import { GARANZIA, ACCESSORI_RIENTRO, PROVE_RIENTRO, LAVORI_RIENTRO } from "../config.js";
import { SignaturePad, Allegati, flushPending } from "../widgets.js";
import { GuestPanel } from "../guest.js";
import { pdfRientro } from "../pdf.js";
import { suggestNumero, numeroDuplicato, fornitori, faseRientro, koRientro } from "./common.js";
import { AziendaPicker, AziendaTag, aziendaOf, aziendaLabel } from "../azienda.js";

// ============================================================
//  RIENTRO TRASFORMATORE — Scheda di presa in carico (MAC PA4190/1)
//  Parte 1: accettazione (obbligatoria alla presa in carico)
//  Parte 2: collaudo elettrico e ispezione (di solito in un secondo momento)
// ============================================================
const vuoto = () => ({
  numero: "", azienda: "", garanzia: "",
  numero_ddt: "", data: isoDay(), causale: "", mittente: "", referente: "", recapiti: "",
  isolamento: "", fasi: "", costruttore: "", matricola: "", potenza: "", anno: "", rapporto: "", gruppo: "", peso_totale: "", peso_olio: "",
  accessori: {}, accessori_altro: "", accettato_da: "", data_accettazione: isoDay(), firma_accettazione: null,
  prove: {}, prove_altro: "", osservazioni_prove: "", targa_verifica: "", targa_note: "", riscontro_apertura: "",
  lavori: {}, attivita_prevedere: "", verificato_da: "", data_verifica: "", firma_verifica: null,
  stato: "aperto", data_chiusura: "", storico: [],
});
const GRUPPI = ["Dyn11", "Dyn5", "Dyn1", "Yyn0", "Yzn11", "Yzn5", "Dd0", "Yy0"];

export function RientroForm({ id }) {
  const admin = isAdmin(), ro = !admin;
  const hashQ = (location.hash.split("?")[1] || "");
  const draftKey = "rientro-draft-" + (id || "new");
  const [r, setR] = useState(id ? null : { ...vuoto(), azienda: /az=service/.test(hashQ) ? "service" : /az=power/.test(hashQ) ? "power" : "" });
  const [parte, setParte] = useState(/p2/.test(hashQ) ? 2 : 1);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState([]);
  const [pending, setPending] = useState([]);
  const [agg, setAgg] = useState({ data: isoDay(), note: "", stato: "" });
  const touched = useRef(false);

  useEffect(() => {
    list("rientri").then(setAll).catch(() => {});
    if (id) {
      get("rientri", id).then((x) => {
        if (!x) { toast.err("Rientro non trovato"); return go("/registro-rientri"); }
        setR({ ...vuoto(), ...x });
        if (!admin) audit("view", "rientri", id, x.numero);
      }).catch((e) => toast.err("Errore di lettura: " + e.code));
    } else if (admin) {
      try { const d = localStorage.getItem(draftKey); if (d) { setR((x) => ({ ...vuoto(), ...JSON.parse(d), azienda: JSON.parse(d).azienda || x.azienda })); toast.info("Bozza ripristinata"); } } catch (e) { }
    }
  }, [id]);
  // numero suggerito: progressivo separato per Power e Service
  useEffect(() => {
    if (id || !r || !r.azienda || r.numero) return;
    setR((x) => ({ ...x, numero: suggestNumero(all.filter((y) => aziendaOf(y) === x.azienda), "numero") }));
  }, [r && r.azienda, all.length]);
  useEffect(() => {
    if (id || ro || !touched.current || !r) return;
    const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify(r)); } catch (e) { } }, 1200);
    return () => clearTimeout(t);
  }, [r]);
  useEffect(() => {
    const f = (e) => { if (touched.current) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", f); return () => removeEventListener("beforeunload", f);
  }, []);
  if (!r) return html`<${Spinner} />`;

  const set = (k, v) => { touched.current = true; setR((x) => ({ ...x, [k]: v })); };
  const setIn = (grp, k, field, v) => { touched.current = true; setR((x) => ({ ...x, [grp]: { ...(x[grp] || {}), [k]: { ...((x[grp] || {})[k] || {}), [field]: v } } })); };
  const az = r.azienda;
  const stessi = all.filter((y) => aziendaOf(y) === (az || "power"));
  const dup = numeroDuplicato(stessi, r.numero, id, "numero");
  const mittenti = fornitori(all, "mittente");
  const costruttori = [...new Set(["MACE POWER", ...fornitori(all, "costruttore")])];
  const fase = faseRientro(r), ko = koRientro(r);

  // ---------- Scelta azienda obbligatoria (nuovo rientro) ----------
  if (!id && !az) return html`<div>
    <a class="back" href="#/registro-rientri"><${Icon} n="back" s=${14} /> Registro Rientri</a>
    <${PageHeader} title="Nuovo rientro trasformatore" subtitle="Scheda di presa in carico e preventivazione" />
    <${Card} title="Per quale azienda è questo rientro? *">
      <p class="muted small">Domanda obbligatoria: Power e Service hanno numerazione e registro separati.</p>
      <${AziendaPicker} value="" onChange=${(v) => set("azienda", v)} />
    </${Card}></div>`;

  const salva = async () => {
    if (!r.azienda) return toast.err("Scegli l'azienda");
    if (!r.garanzia) { setParte(1); return toast.err("Indica se il rientro è in garanzia (Sì / No / Da valutare)"); }
    if (!r.data) { setParte(1); return toast.err("Inserisci la data del rientro"); }
    if (!r.numero.trim()) { setParte(1); return toast.err("Inserisci il numero di rientro"); }
    if (dup && !(await confirmDialog("Numero già usato", `Esiste già un rientro ${aziendaLabel(r.azienda)} con numero ${r.numero}. Salvare comunque?`, "Salva comunque"))) return;
    const body = { ...r };
    if (body.stato === "chiuso" && !body.data_chiusura) body.data_chiusura = isoDay();
    setBusy(true);
    const label = `Rientro ${body.numero} · ${body.matricola || body.mittente || ""}`;
    try {
      if (id) { await update("rientri", id, body, label); setR(body); toast.ok("Rientro aggiornato"); }
      else {
        const x = await create("rientri", { ...body, uid: crypto.randomUUID() }, label);
        await flushPending("rientri", x.id, pending); setPending([]);
        try { localStorage.removeItem(draftKey); } catch (e) { }
        touched.current = false; toast.ok("Rientro registrato"); go("/rientro/" + x.id); return;
      }
      touched.current = false;
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  const elimina = async () => {
    if (!(await confirmDialog("Eliminare il rientro?", `Rientro ${r.numero}: operazione irreversibile.`))) return;
    await remove("rientri", id, "Rientro " + r.numero); touched.current = false; toast.ok("Rientro eliminato"); go("/registro-rientri");
  };
  const aggiungiAgg = async () => {
    if (!agg.note.trim()) return toast.err("Scrivi l'aggiornamento");
    const s = [...(r.storico || []), { ...agg, stato: agg.stato || r.stato, autore: session.user.label, created_at: new Date().toISOString() }];
    const patch = { storico: s, ...(agg.stato ? { stato: agg.stato, data_chiusura: agg.stato === "chiuso" ? (r.data_chiusura || agg.data) : r.data_chiusura } : {}) };
    try { if (id) await update("rientri", id, patch, `Rientro ${r.numero} (aggiornamento)`); setR({ ...r, ...patch }); setAgg({ data: isoDay(), note: "", stato: "" }); toast.ok("Aggiornamento registrato"); }
    catch (e) { toast.err("Errore: " + e.code); }
  };

  const inp = (k, ph = "", extra = {}) => html`<input class="inp" placeholder=${ph} value=${r[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)} ...${extra} />`;
  const date = (k) => html`<input type="date" class="inp" value=${r[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)} />`;
  const ta = (k, rows = 3, ph = "") => html`<textarea class="inp" rows=${rows} placeholder=${ph} value=${r[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)}></textarea>`;
  const seg = (k, opts) => html`<div class="seg">${opts.map((o) => html`<button type="button" key=${o.v} disabled=${ro} class=${"seg-b" + (r[k] === o.v ? " on" : "") + (o.c ? " " + o.c : "")}
    onClick=${() => set(k, r[k] === o.v ? "" : o.v)}>${o.l}</button>`)}</div>`;
  // tabella check SI/NO o OK/KO con note
  const checkTable = (grp, voci, [a, b], altroKey, head) => html`<div class="tbl-wrap"><table class="tbl chk-tbl">
    <thead><tr><th>${head}</th><th class="c">${a.toUpperCase()}</th><th class="c">${b.toUpperCase()}</th><th>Note</th></tr></thead>
    <tbody>${voci.map(([k, l]) => { const v = (r[grp] && r[grp][k]) || {};
      return html`<tr key=${k} class=${v.v === "ko" ? "row-fail" : ""}>
        <td>${k === "altro" ? html`<input class="inp sm" placeholder="Altro: specifica…" value=${r[altroKey]} disabled=${ro} onInput=${(e) => set(altroKey, e.target.value)} />` : l}</td>
        ${[a, b].map((opt) => html`<td class="c"><button type="button" disabled=${ro} class=${"tick" + (v.v === opt ? " on v-" + opt : "")} aria-label=${l + " " + opt}
          onClick=${() => setIn(grp, k, "v", v.v === opt ? "" : opt)}>${v.v === opt ? "✕" : ""}</button></td>`)}
        <td><input class="inp sm" value=${v.note || ""} disabled=${ro} onInput=${(e) => setIn(grp, k, "note", e.target.value)} /></td></tr>`; })}</tbody></table></div>`;
  const tuttiNo = () => { touched.current = true; setR((x) => ({ ...x, accessori: Object.fromEntries(ACCESSORI_RIENTRO.filter(([k]) => k !== "altro").map(([k]) => [k, { ...((x.accessori || {})[k] || {}), v: (x.accessori && x.accessori[k] && x.accessori[k].v) || "no" }])) })); };
  const tuttiOk = () => { touched.current = true; setR((x) => ({ ...x, prove: Object.fromEntries(PROVE_RIENTRO.filter(([k]) => k !== "altro").map(([k]) => [k, { ...((x.prove || {})[k] || {}), v: (x.prove && x.prove[k] && x.prove[k].v) || "ok" }])) })); };

  const P1 = html`
    <${Card} title="Accettazione trasformatore — compilazione obbligatoria alla presa in carico">
      <div class="form-grid">
        <${Field} label="Numero rientro *" hint=${dup ? html`<span class="warn">⚠ Numero già usato da un altro rientro ${aziendaLabel(az)}</span>` : `Progressivo ${aziendaLabel(az)} (NN/AA)`}>${inp("numero")}</${Field}>
        <${Field} label="Rientro in garanzia? *">${seg("garanzia", GARANZIA.map((g) => ({ ...g, c: g.v === "si" ? "g" : g.v === "da_valutare" ? "a" : "" })))}</${Field}>
        <${Field} label="Azienda *"><div class="az-inline"><${AziendaTag} v=${az} />${!ro && html` <button class="link-btn" onClick=${() => { set("azienda", az === "service" ? "power" : "service"); if (!id) set("numero", ""); }}>
          cambia in ${az === "service" ? "MACE POWER" : "MACE SERVICE"}</button>`}</div></${Field}>
        <${Field} label="Numero DDT">${inp("numero_ddt", "es. 304/2026")}</${Field}>
        <${Field} label="Data rientro *">${date("data")}</${Field}>
        <${Field} label="Mittente"><input class="inp" list="dl-mitt" value=${r.mittente} disabled=${ro} onInput=${(e) => set("mittente", e.target.value)} />
          <datalist id="dl-mitt">${mittenti.map((c) => html`<option value=${c} />`)}</datalist></${Field}>
        <${Field} label="Referente">${inp("referente")}</${Field}>
        <${Field} label="Recapiti">${inp("recapiti", "telefono / email")}</${Field}>
        <${Field} label="Causa del rientro" full>${ta("causale", 2, "es. guasto in esercizio, intervento protezione, revisione…")}</${Field}>
      </div>
    </${Card}>
    <${Card} title="Dati di targa trasformatore">
      <div class="form-grid">
        <${Field} label="Trasformatore in">${seg("isolamento", [{ v: "olio", l: "Olio" }, { v: "resina", l: "Resina" }])}</${Field}>
        <${Field} label="Numero di fasi">${seg("fasi", [{ v: "trifase", l: "Trifase" }, { v: "monofase", l: "Monofase" }])}</${Field}>
        <${Field} label="Costruttore (chi l'ha costruito)"><input class="inp" list="dl-costr" value=${r.costruttore} disabled=${ro} onInput=${(e) => set("costruttore", e.target.value)} />
          <datalist id="dl-costr">${costruttori.map((c) => html`<option value=${c} />`)}</datalist></${Field}>
        <${Field} label="Matricola">${inp("matricola")}</${Field}>
        <${Field} label="Potenza nominale (kVA)">${inp("potenza", "es. 630", { inputmode: "decimal" })}</${Field}>
        <${Field} label="Anno">${inp("anno", "es. 2024", { inputmode: "numeric" })}</${Field}>
        <${Field} label="Rapporto di trasformazione">${inp("rapporto", "es. 20±2x2,5% / 0,4 kV")}</${Field}>
        <${Field} label="Gruppo (Dyn)"><input class="inp" list="dl-gr" value=${r.gruppo} disabled=${ro} onInput=${(e) => set("gruppo", e.target.value)} />
          <datalist id="dl-gr">${GRUPPI.map((c) => html`<option value=${c} />`)}</datalist></${Field}>
        <${Field} label="Peso totale (kg)">${inp("peso_totale", "", { inputmode: "decimal" })}</${Field}>
        <${Field} label="Peso olio (kg)">${inp("peso_olio", r.isolamento === "resina" ? "n.a. (resina)" : "", { inputmode: "decimal" })}</${Field}>
      </div>
    </${Card}>
    <${Card} title="Accessori — dotazione riscontrata in accettazione" right=${!ro && html`<button class="btn ghost sm" onClick=${tuttiNo}>Segna vuoti come NO</button>`}>
      ${checkTable("accessori", ACCESSORI_RIENTRO, ["si", "no"], "accessori_altro", "Accessorio")}
    </${Card}>
    <${Card} title="Accettazione eseguita da">
      <div class="form-grid">
        <${Field} label="Accettato da">${inp("accettato_da")}</${Field}>
        <${Field} label="Data accettazione">${date("data_accettazione")}</${Field}>
        <div class="full"><${SignaturePad} label="Firma accettazione" value=${r.firma_accettazione} disabled=${ro}
          firmatario=${(r.firma_accettazione && r.firma_accettazione.firmatario) || r.accettato_da} onChange=${(f) => set("firma_accettazione", f)} /></div>
        <div class="full"><${Allegati} parentType="rientri" parentId=${id} disabled=${ro} pending=${pending} onPending=${setPending} /></div>
      </div>
    </${Card}>`;

  const P2 = html`
    <${Card} title="Collaudo elettrico in accettazione e ispezione parte attiva" right=${!ro && html`<button class="btn ghost sm" onClick=${tuttiOk}>Segna vuoti come OK</button>`}>
      ${!id && html`<p class="muted small">Puoi salvare ora la Parte 1 e completare il collaudo in un secondo momento dal Registro Rientri.</p>`}
      ${checkTable("prove", PROVE_RIENTRO, ["ok", "ko"], "prove_altro", "Prove elettriche eseguite in accettazione")}
      <${Field} label="Osservazioni" full>${ta("osservazioni_prove", 2)}</${Field}>
    </${Card}>
    <${Card} title="Verifica e conferma dati di targa">
      <div class="form-grid">
        <${Field} label="Dati di targa">${seg("targa_verifica", [{ v: "conformi", l: "Confermati", c: "g" }, { v: "difformi", l: "Difformi" }])}</${Field}>
        <${Field} label="Note / differenze riscontrate">${inp("targa_note")}</${Field}>
      </div>
    </${Card}>
    <${Card} title="Osservazioni e valutazioni parte attiva">
      <${Field} label="Riscontro all'apertura" full>${ta("riscontro_apertura", 4)}</${Field}>
    </${Card}>
    <${Card} title="Lavori da preventivare e osservazioni">
      <div class="form-col">
        <div class="row-gap wrap">${LAVORI_RIENTRO.map(([k, l]) => html`<label class="chk" key=${k}><input type="checkbox" disabled=${ro} checked=${!!(r.lavori || {})[k]}
          onChange=${(e) => set("lavori", { ...(r.lavori || {}), [k]: e.target.checked })} /> ${l}</label>`)}</div>
        <${Field} label="Attività da prevedere / osservazioni">${ta("attivita_prevedere", 4)}</${Field}>
      </div>
    </${Card}>
    <${Card} title="Verifica eseguita da">
      <div class="form-grid">
        <${Field} label="Verificato da">${inp("verificato_da")}</${Field}>
        <${Field} label="Data verifica" hint="Quando è compilata il rientro risulta «Collaudato»">${date("data_verifica")}</${Field}>
        <div class="full"><${SignaturePad} label="Firma verifica" value=${r.firma_verifica} disabled=${ro}
          firmatario=${(r.firma_verifica && r.firma_verifica.firmatario) || r.verificato_da} onChange=${(f) => set("firma_verifica", f)} /></div>
      </div>
    </${Card}>`;

  return html`<div>
    <a class="back" href="#/registro-rientri"><${Icon} n="back" s=${14} /> Registro Rientri</a>
    <${PageHeader} title=${id ? "Rientro trasformatore" : "Nuovo rientro trasformatore"} subtitle=${[r.numero && "N° " + r.numero, r.matricola && "Matr. " + r.matricola, r.mittente].filter(Boolean).join(" · ")}>
      <${AziendaTag} v=${az} />${r.garanzia && html` <${Badge} v=${"g_" + r.garanzia} />`} <${Badge} v=${fase} />${ko > 0 && html` <span class="badge b-red">${ko} KO</span>`} <${Badge} v=${r.stato} />
      ${id && html`<button class="btn outline" onClick=${() => pdfRientro({ ...r, id })}><${Icon} n="download" /> PDF</button>`}
      ${admin && id && html`<button class="btn ghost danger-t" title="Elimina" onClick=${elimina}><${Icon} n="trash" /></button>`}
      ${admin && html`<button class="btn primary" disabled=${busy} onClick=${salva}>${busy ? html`<span class="spin sm"></span>` : html`<${Icon} n="save" />`} Salva</button>`}
    </${PageHeader}>
    ${az === "service" && html`<div class="az-banner"><img src="img/mace-service.png" alt="Mace Service" /><span>Rientro registrato per conto di <b>MACE SERVICE</b></span></div>`}
    ${ro && html`<div class="ro-note"><${Icon} n="lock" s=${14} /> Modalità sola consultazione (Ospite). Modifiche disabilitate.</div>`}
    ${ro && html`<${GuestPanel} entity="rientri" id=${id} label=${`Rientro ${r.numero} · ${r.matricola || r.mittente || ""}`} />`}

    <div class="tabs part-tabs">
      <button class=${"tab" + (parte === 1 ? " on" : "")} onClick=${() => setParte(1)}>Parte 1 · Accettazione</button>
      <button class=${"tab" + (parte === 2 ? " on" : "")} onClick=${() => setParte(2)}>Parte 2 · Collaudo e ispezione ${html`<${Badge} v=${fase} />`}</button>
      <button class=${"tab" + (parte === 3 ? " on" : "")} onClick=${() => setParte(3)}>Stato & storico</button>
    </div>
    ${parte === 1 && P1}
    ${parte === 2 && P2}
    ${parte === 3 && html`<${Card} title="Stato pratica">
      <div class="form-grid">
        <${Field} label="Stato">${seg("stato", [{ v: "aperto", l: "Aperto" }, { v: "chiuso", l: "Chiuso", c: "g" }])}</${Field}>
        <${Field} label="Data chiusura">${date("data_chiusura")}</${Field}>
      </div></${Card}>
      ${id ? html`<${Card} title="Storico aggiornamenti" right=${html`<span class="muted small">${(r.storico || []).length} voci</span>`}>
        ${(r.storico || []).length === 0 ? html`<p class="muted small">Nessun aggiornamento registrato.</p>` : html`<div class="timeline">
          ${[...r.storico].reverse().map((s) => html`<div class="tl"><span class="tl-d">${fmtDate(s.data)}</span><div><p>${s.note}</p>
            <small class="muted">${s.autore || "—"}${s.stato ? " · stato: " + s.stato : ""}</small></div></div>`)}</div>`}
        ${admin && html`<div class="agg-form"><input type="date" class="inp" value=${agg.data} onInput=${(e) => setAgg({ ...agg, data: e.target.value })} />
          <input class="inp grow" placeholder="Aggiornamento (es. preventivo inviato, riparazione completata…)" value=${agg.note} onInput=${(e) => setAgg({ ...agg, note: e.target.value })} />
          <select class="inp" value=${agg.stato} onChange=${(e) => setAgg({ ...agg, stato: e.target.value })}><option value="">Stato invariato</option><option value="aperto">→ Aperto</option><option value="chiuso">→ Chiuso</option></select>
          <button class="btn outline" onClick=${aggiungiAgg}><${Icon} n="plus" /> Aggiungi</button></div>`}
      </${Card}>` : html`<p class="muted small">Lo storico si attiva dopo il primo salvataggio.</p>`}`}

    ${admin && html`<div class="row-between wiz-nav">
      <button class="btn outline" disabled=${parte === 1} onClick=${() => setParte(parte - 1)}><${Icon} n="back" /> Indietro</button>
      <div class="row-gap">${parte < 3 && html`<button class="btn outline" onClick=${() => setParte(parte + 1)}>Avanti <${Icon} n="next" /></button>`}
        <button class="btn primary" disabled=${busy} onClick=${salva}><${Icon} n="save" /> ${!id && parte === 1 ? "Salva Parte 1" : "Salva rientro"}</button></div></div>`}
    ${id && html`<p class="meta muted small">Registrato ${fmtDT(r.created_at)} da ${r.created_by || "—"}${r.updated_by ? ` · Ultima modifica ${fmtDT(r.updated_at)} da ${r.updated_by}` : ""}</p>`}
  </div>`;
}
