import { html, useState, useEffect, useRef, Icon, Badge, PageHeader, Card, Field, Spinner, Select, toast, confirmDialog, calcEsito, num, fmtNum, isoDay, fmtDT } from "../ui.js";
import { get, create, update, remove, isAdmin, audit, list } from "../store.js";
import { PERCORSI } from "../config.js";
import { SignaturePad, Allegati, flushPending } from "../widgets.js";
import { GuestPanel } from "../guest.js";
import { pdfControllo } from "../pdf.js";
import { fornitori } from "./common.js";
import { go } from "../ui.js";

const vuota = () => ({ descrizione: "", valore_teorico: "", tolleranza: "", valore_misurato: "", unita: "mm", esito: "" });
const nuovo = () => ({
  percorso: "carpenteria", tipo: "", sottotipo: "", test_aderenza_vernice: "", compilatore: lastCompilatore(),
  fornitore: "", data: isoDay(), ddt: "", codice_commessa: "", codice_progetto: "", descrizione_materiale: "",
  controlli_dimensionali: [vuota()], conformita_generale: "", note: "", firma: null, stato: "bozza",
});
function lastCompilatore() { try { return localStorage.getItem("qc-compilatore") || "Biagio Salvia"; } catch (e) { return "Biagio Salvia"; } }

// Modelli di quote ricavati dai vecchi controlli (si possono modificare dopo averli caricati)
const MODELLI = {
  Cassa: ["L1 interno", "L1 esterno", "L2 interno", "L2 esterno", "Altezza cassa", "Altezza ali", "Spessore ali", "Lunghezza piedi", "Spessore vernice cassa"],
  Coperchio: ["L1 chiuso", "L1 aperto", "L2 chiuso", "L2 aperto", "Altezza tronchetto", "Diametro tronchetto", "Diametro pozzetto", "Diametro fori BT", "Diametro fori AT", "Spessore vernice coperchio"],
  Conservatore: ["Lunghezza", "Diametro", "Spessore vernice"],
  "Muffola AT": ["Diametro", "Altezza", "Interasse fori"],
  "Muffola BT": ["Diametro", "Altezza", "Interasse fori"],
  "Filo / Piattina / Nastro": ["Spessore nudo", "Larghezza nuda", "Spessore vestito", "Larghezza vestita", "Peso materiale"],
  Tapparella: ["Larghezza", "Spessore", "Lunghezza"],
  "Carta diamantata": ["Spessore", "Larghezza", "Peso"],
  Nucleo: ["Spessore colonna", "Lunghezza colonna", "Altezza nucleo", "Passo finestra"],
};

export function ControlloForm({ id }) {
  const admin = isAdmin();
  const ro = !admin;
  const [c, setC] = useState(id ? null : nuovo());
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const [forn, setForn] = useState([]);
  const [commesse, setCommesse] = useState([]);
  const dirty = useRef(false);

  useEffect(() => {
    list("controlli").then((r) => setForn(fornitori(r))).catch(() => {});
    list("commesse").then(setCommesse).catch(() => {});
    if (!id) return;
    get("controlli", id).then((r) => {
      if (!r) { toast.err("Controllo non trovato"); return go("/registro-controlli"); }
      setC({ ...nuovo(), ...r, descrizione_materiale: r.descrizione_materiale || (r.dati_legacy && r.dati_legacy.dettaglio_materiale) || "",
        controlli_dimensionali: r.controlli_dimensionali && r.controlli_dimensionali.length ? r.controlli_dimensionali : [vuota()] });
      if (!admin) audit("view", "controlli", id, `${r.tipo} ${r.fornitore}`);
    }).catch((e) => toast.err("Errore di lettura: " + e.code));
  }, [id]);
  useEffect(() => {
    const f = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", f); return () => removeEventListener("beforeunload", f);
  }, []);
  useEffect(() => {
    if (id) return;
    const d = sessionStorage.getItem("qc-dup");
    if (d) { sessionStorage.removeItem("qc-dup"); setC({ ...nuovo(), ...JSON.parse(d) }); toast.info("Copia creata: inserisci i nuovi valori misurati"); }
  }, []);
  if (!c) return html`<${Spinner} />`;

  const set = (k, v) => { dirty.current = true; setC((x) => ({ ...x, [k]: v })); };
  const setQ = (i, k, v) => { dirty.current = true; setC((x) => { const q = [...x.controlli_dimensionali]; q[i] = { ...q[i], [k]: v }; q[i].esito = calcEsito(q[i]); return { ...x, controlli_dimensionali: q }; }); };
  const quote = c.controlli_dimensionali;
  const fails = quote.filter((q) => calcEsito(q) === "FAIL").length;
  const pass = quote.filter((q) => calcEsito(q) === "PASS").length;
  const tipi = [...PERCORSI[c.percorso], ...(c.tipo && !PERCORSI[c.percorso].includes(c.tipo) ? [c.tipo] : [])];

  const autofill = () => {
    const k = (c.codice_commessa || "").trim().toLowerCase();
    if (!k) return toast.info("Scrivi prima il codice commessa");
    const m = commesse.find((x) => (x.codice || "").toLowerCase() === k || (x.descrizione || "").toLowerCase().startsWith(k));
    if (!m) return toast.err("Commessa non trovata in anagrafica");
    if (!(m.quote_template || []).length) return toast.info(`Commessa ${m.codice}: nessun template quote`);
    set("controlli_dimensionali", m.quote_template.map((t) => ({ ...vuota(), ...t, valore_misurato: "", esito: "" })));
    toast.ok("Quote precompilate da commessa " + m.codice);
  };
  const caricaModello = () => {
    const mod = MODELLI[c.tipo]; if (!mod) return toast.info("Nessun modello per questo tipo");
    const giaPiene = quote.some((q) => q.descrizione || q.valore_misurato);
    const esistenti = new Set(quote.map((q) => (q.descrizione || "").toLowerCase()));
    const add = mod.filter((m) => !esistenti.has(m.toLowerCase())).map((m) => ({ ...vuota(), descrizione: m, unita: /vernice/i.test(m) ? "µm" : /peso/i.test(m) ? "kg" : "mm" }));
    set("controlli_dimensionali", giaPiene ? [...quote, ...add] : add);
  };

  const salva = async (statoForzato) => {
    const body = { ...c, stato: statoForzato || c.stato };
    body.controlli_dimensionali = quote.filter((q) => String(q.valore_teorico || "").trim() || String(q.valore_misurato || "").trim()).map((q) => ({ ...q, esito: calcEsito(q) }));
    if (body.stato === "completato") {
      const miss = [!body.tipo && "Tipo controllo", !body.fornitore && "Fornitore", !body.data && "Data", !body.conformita_generale && "Conformità generale"].filter(Boolean);
      if (miss.length) return toast.err("Per completare manca: " + miss.join(", "));
      if (fails && body.conformita_generale === "conforme" &&
        !(await confirmDialog("Ci sono quote in FAIL", `${fails} quote fuori tolleranza ma la conformità è "Conforme". Salvare comunque?`, "Salva comunque"))) return;
    }
    setBusy(true);
    try {
      try { localStorage.setItem("qc-compilatore", body.compilatore || ""); } catch (e) { }
      const label = `${body.tipo} ${body.fornitore}`;
      if (id) { await update("controlli", id, body, label); setC({ ...body, controlli_dimensionali: body.controlli_dimensionali.length ? body.controlli_dimensionali : [vuota()] }); toast.ok("Controllo aggiornato"); }
      else {
        const r = await create("controlli", { ...body, uid: crypto.randomUUID() }, label);
        await flushPending("controlli", r.id, pending); setPending([]);
        toast.ok("Controllo creato"); dirty.current = false; go("/controllo/" + r.id); return;
      }
      dirty.current = false;
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  const elimina = async () => {
    if (!(await confirmDialog("Eliminare il controllo?", "Operazione irreversibile: verranno eliminati anche gli allegati."))) return;
    await remove("controlli", id, `${c.tipo} ${c.fornitore}`); toast.ok("Controllo eliminato"); dirty.current = false; go("/registro-controlli");
  };
  const duplica = () => {
    const { id: _, firma, created_at, created_by, updated_at, updated_by, legacy_id, uid, dati_legacy, allegati_legacy, ...rest } = c;
    sessionStorage.setItem("qc-dup", JSON.stringify({ ...rest, data: isoDay(), stato: "bozza", conformita_generale: "", firma: null,
      controlli_dimensionali: quote.map((q) => ({ ...q, valore_misurato: "", esito: "" })) }));
    go("/controllo");
  };

  const leg = c.dati_legacy || {};
  return html`<div>
    <a class="back" href="#/registro-controlli"><${Icon} n="back" s=${14} /> Registro Controlli</a>
    <${PageHeader} title=${id ? "Controllo" : "Nuovo Controllo"} subtitle="Controllo di Accettazione — Carpenteria / Produzione">
      <${Badge} v=${c.conformita_generale} />
      ${id && html`<button class="btn outline" onClick=${() => pdfControllo({ ...c, id })}><${Icon} n="download" /> PDF</button>`}
      ${admin && id && html`<button class="btn ghost" title="Duplica" onClick=${duplica}><${Icon} n="layers" /> Duplica</button>`}
      ${admin && id && html`<button class="btn ghost danger-t" title="Elimina" onClick=${elimina}><${Icon} n="trash" /></button>`}
      ${admin && html`<button class="btn primary" disabled=${busy} onClick=${() => salva()}>${busy ? html`<span class="spin sm"></span>` : html`<${Icon} n="save" />`} Salva</button>`}
    </${PageHeader}>
    ${ro && html`<div class="ro-note"><${Icon} n="lock" s=${14} /> Modalità sola consultazione (Ospite). Modifiche disabilitate.</div>`}
    ${ro && html`<${GuestPanel} entity="controlli" id=${id} label=${`Controllo ${c.tipo || ""} · ${c.fornitore || ""} · ${c.data || ""}`} />`}

    <${Card}>
      <div class="tabs">${["carpenteria", "produzione"].map((p) => html`<button class=${"tab" + (c.percorso === p ? " on" : "")} disabled=${ro}
        onClick=${() => { set("percorso", p); if (!PERCORSI[p].includes(c.tipo)) set("tipo", ""); }}>${p === "carpenteria" ? "Carpenteria" : "Produzione"}</button>`)}</div>
      <div class="form-grid">
        <${Field} label="Tipo controllo"><${Select} value=${c.tipo} options=${tipi} disabled=${ro} onChange=${(v) => set("tipo", v)} /></${Field}>
        <${Field} label=${c.percorso === "produzione" ? "Materiale (Al/Cu)" : "Sottotipo (AT/BT)"}>
          <input class="inp" list=${c.percorso === "produzione" ? "dl-mat" : "dl-sub"} value=${c.sottotipo} disabled=${ro} onInput=${(e) => set("sottotipo", e.target.value)} />
          <datalist id="dl-mat"><option value="Rame (Cu)" /><option value="Alluminio (Al)" /></datalist>
          <datalist id="dl-sub"><option value="AT" /><option value="BT" /><option value="AT/BT" /></datalist></${Field}>
        ${c.percorso === "carpenteria" && html`<${Field} label="Test aderenza vernice" hint="Quadrettatura ISO 2409: GT0 = ottima … GT5 = pessima">
          <input class="inp" list="dl-gt" placeholder="es. Esito quadretto GT0" value=${c.test_aderenza_vernice} disabled=${ro} onInput=${(e) => set("test_aderenza_vernice", e.target.value)} />
          <datalist id="dl-gt">${["GT0", "GT1", "GT2", "GT3", "GT4", "GT5", "Non eseguito"].map((g) => html`<option value=${g} />`)}</datalist></${Field}>`}
        <${Field} label="Descrizione materiale" full><input class="inp" placeholder="es. Cassa 1600 kVA – draw TA10334" value=${c.descrizione_materiale} disabled=${ro} onInput=${(e) => set("descrizione_materiale", e.target.value)} /></${Field}>
      </div>
    </${Card}>

    <${Card} title="Anagrafica">
      <div class="form-grid">
        <${Field} label="Compilatore"><input class="inp" value=${c.compilatore} disabled=${ro} onInput=${(e) => set("compilatore", e.target.value)} /></${Field}>
        <${Field} label="Fornitore"><input class="inp" list="dl-forn" value=${c.fornitore} disabled=${ro} onInput=${(e) => set("fornitore", e.target.value)} />
          <datalist id="dl-forn">${forn.map((f) => html`<option value=${f} />`)}</datalist></${Field}>
        <${Field} label="Data"><input type="date" class="inp" value=${c.data} disabled=${ro} onInput=${(e) => set("data", e.target.value)} /></${Field}>
        <${Field} label="DDT"><input class="inp" value=${c.ddt} disabled=${ro} onInput=${(e) => set("ddt", e.target.value)} /></${Field}>
        <${Field} label="Codice commessa"><div class="inp-btn"><input class="inp" placeholder="es. 25/00139" list="dl-comm" value=${c.codice_commessa} disabled=${ro}
          onInput=${(e) => set("codice_commessa", e.target.value)} />
          <datalist id="dl-comm">${commesse.map((m) => html`<option value=${m.codice}>${m.cliente}</option>`)}</datalist>
          ${!ro && html`<button type="button" class="btn outline icon" title="Precompila quote da commessa" onClick=${autofill}><${Icon} n="wand" /></button>`}</div></${Field}>
        <${Field} label="Codice progetto"><input class="inp" placeholder="es. TA10338" value=${c.codice_progetto} disabled=${ro} onInput=${(e) => set("codice_progetto", e.target.value)} /></${Field}>
      </div>
    </${Card}>

    <${Card} title="Controlli dimensionali" right=${html`<div class="row-gap">
      <span class="muted small">${pass} PASS · <span class=${fails ? "t-red" : ""}>${fails} FAIL</span></span>
      ${!ro && MODELLI[c.tipo] && html`<button class="btn outline sm" onClick=${caricaModello}><${Icon} n="wand" s=${14} /> Modello ${c.tipo}</button>`}
      ${!ro && html`<button class="btn outline sm" onClick=${() => set("controlli_dimensionali", [...quote, vuota()])}><${Icon} n="plus" s=${14} /> Aggiungi quota</button>`}</div>`}>
      <div class="tbl-wrap"><table class="tbl quote">
        <thead><tr><th>Descrizione quota</th><th>Teorico</th><th>Toll. ±</th><th>Misurato</th><th>U.M.</th><th>Δ</th><th>Esito</th><th></th></tr></thead>
        <tbody>${quote.map((q, i) => { const e = calcEsito(q); const dl = num(q.valore_misurato) - num(q.valore_teorico);
          return html`<tr key=${i} class=${e === "FAIL" ? "row-fail" : ""}>
            <td><input class="inp" value=${q.descrizione} disabled=${ro} onInput=${(ev) => setQ(i, "descrizione", ev.target.value)} /></td>
            <td><input class="inp num" inputmode="decimal" value=${q.valore_teorico} disabled=${ro} onInput=${(ev) => setQ(i, "valore_teorico", ev.target.value)} /></td>
            <td><input class="inp num" inputmode="decimal" value=${q.tolleranza} disabled=${ro} onInput=${(ev) => setQ(i, "tolleranza", ev.target.value)} /></td>
            <td><input class="inp num" inputmode="decimal" value=${q.valore_misurato} disabled=${ro} onInput=${(ev) => setQ(i, "valore_misurato", ev.target.value)} /></td>
            <td><select class="inp um" value=${q.unita || "mm"} disabled=${ro} onChange=${(ev) => setQ(i, "unita", ev.target.value)}>
              ${["mm", "cm", "m", "µm", "kg", "%", "°", "N", "—"].map((u) => html`<option value=${u} selected=${(q.unita || "mm") === u}>${u}</option>`)}</select></td>
            <td class="mono small">${isNaN(dl) ? "" : (dl > 0 ? "+" : "") + fmtNum(dl)}</td>
            <td>${e ? html`<${Badge} v=${e} />` : html`<span class="muted small" title="Manca teorico, tolleranza o misurato">n.d.</span>`}</td>
            <td>${!ro && html`<button class="btn ghost icon sm" title="Rimuovi quota" onClick=${() => set("controlli_dimensionali", quote.filter((_, j) => j !== i).length ? quote.filter((_, j) => j !== i) : [vuota()])}><${Icon} n="trash" s=${14} /></button>`}</td>
          </tr>`; })}</tbody></table></div>
      <p class="muted small">Esito automatico: PASS se |misurato − teorico| ≤ tolleranza. Accetta virgola o punto decimale. Senza tolleranza l'esito resta "n.d.".</p>
    </${Card}>

    ${leg.vernice && html`<${Card} title="Vernice (dati vecchio gestionale)"><div class="kv-grid">${Object.entries(leg.vernice).map(([k, v]) => html`<div><span class="lbl">${k.replace(/_/g, " ")}</span><b>${v}</b></div>`)}</div></${Card}>`}

    <${Card}>
      <div class="form-grid">
        <${Field} label="Conformità generale">
          <div class="inp-btn"><${Select} value=${c.conformita_generale} disabled=${ro} onChange=${(v) => set("conformita_generale", v)}
            options=${[{ v: "conforme", l: "Conforme" }, { v: "non_conforme", l: "Non Conforme" }, { v: "con_riserva", l: "Con Riserva" }]} />
          ${!ro && (pass + fails > 0) && html`<button type="button" class="btn outline icon" title="Imposta dagli esiti" onClick=${() => set("conformita_generale", fails ? "non_conforme" : "conforme")}><${Icon} n="wand" /></button>`}</div>
          ${fails > 0 && c.conformita_generale === "conforme" && html`<small class="warn">⚠ ${fails} quote in FAIL ma conformità "Conforme"</small>`}
        </${Field}>
        <${Field} label="Stato"><${Select} value=${c.stato} disabled=${ro} placeholder="—" onChange=${(v) => set("stato", v)} options=${[{ v: "bozza", l: "Bozza" }, { v: "completato", l: "Completato" }]} /></${Field}>
        <${Field} label="Note" full><textarea class="inp" rows="3" value=${c.note} disabled=${ro} onInput=${(e) => set("note", e.target.value)}></textarea></${Field}>
      </div>
    </${Card}>

    <div class="grid-2">
      <${Card}><${SignaturePad} label="Firma compilatore" value=${c.firma} disabled=${ro} firmatario=${c.compilatore} onChange=${(f) => set("firma", f)} /></${Card}>
      <${Card}><${Allegati} parentType="controlli" parentId=${id} disabled=${ro} pending=${pending} onPending=${setPending} legacy=${c.allegati_legacy || []} /></${Card}>
    </div>
    ${id && html`<p class="meta muted small">Creato ${fmtDT(c.created_at)} da ${c.created_by || "—"}${c.updated_by ? ` · Ultima modifica ${fmtDT(c.updated_at)} da ${c.updated_by}` : ""}${c.legacy_id ? ` · ID vecchio gestionale ${c.legacy_id}` : ""}</p>`}
    ${admin && html`<div class="sticky-save"><button class="btn outline" disabled=${busy} onClick=${() => salva("bozza")}>Salva bozza</button>
      <button class="btn primary" disabled=${busy} onClick=${() => salva("completato")}><${Icon} n="check" /> Salva e completa</button></div>`}
  </div>`;
}
