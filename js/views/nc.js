import { html, useState, useEffect, useRef, Icon, Badge, PageHeader, Card, Field, Spinner, Select, toast, confirmDialog, isoDay, fmtDate, fmtDT, go } from "../ui.js";
import { get, create, update, remove, isAdmin, audit, list, session } from "../store.js";
import { ORIGINI_NC, CLASSIFICAZIONI, TRATTAMENTI, ND } from "../config.js";
import { SignaturePad, Allegati, flushPending } from "../widgets.js";
import { GuestPanel } from "../guest.js";
import { pdfNC } from "../pdf.js";
import { suggestNumero, numeroDuplicato, statoScadenza, scadenzaNC, fornitori } from "./common.js";

const STEPS = [
  { n: 1, l: "Info generali", i: "file" }, { n: 2, l: "Materiale", i: "box" }, { n: 3, l: "Rilevazione", i: "clipboard" },
  { n: 4, l: "Trattamento", i: "wand" }, { n: 5, l: "Efficacia", i: "checkCircle" }, { n: 6, l: "Stato", i: "history" },
];
const vuota = () => ({
  numero_report: "", data: isoDay(), documento_riferimento: "", origine_nc: "", controparte: "", classificazione: "",
  materiale_descrizione: "", quantita: "", quantita_definitiva: false, descrizione_nc: "", responsabile_rilevazione: "",
  firma_rilevazione: null, trattamento_tipo: "", causa: "", trattamento: "", data_completamento: "", firma_trattamento: null,
  efficacia: "", azione_correttiva: "", data_azione: "", data_verifica_efficacia: "", firma_efficacia: null,
  stato: "aperta", data_chiusura: "", data_scadenza: "", storico: [],
});

function NDCheck({ value, onSet, disabled }) {
  if (disabled) return null;
  return html`<label class="chk small"><input type="checkbox" checked=${value === ND} onChange=${(e) => onSet(e.target.checked ? ND : "")} /> Non disponibile</label>`;
}

export function NCForm({ id }) {
  const admin = isAdmin(), ro = !admin;
  const draftKey = "nc-draft-" + (id || "new");
  const [n, setN] = useState(id ? null : vuota());
  const [step, setStep] = useState(1);
  const [full, setFull] = useState(ro);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState([]);
  const [pending, setPending] = useState([]);
  const [agg, setAgg] = useState({ data: isoDay(), note: "", stato: "" });
  const touched = useRef(false);

  useEffect(() => {
    list("nc").then((r) => {
      setAll(r);
      if (!id) setN((x) => (x.numero_report ? x : { ...x, numero_report: suggestNumero(r) }));
    }).catch(() => {});
    if (id) {
      get("nc", id).then((r) => {
        if (!r) { toast.err("NC non trovata"); return go("/registro-nc"); }
        setN({ ...vuota(), ...r });
        if (!admin) audit("view", "nc", id, r.numero_report);
      }).catch((e) => toast.err("Errore di lettura: " + e.code));
    } else if (admin) {
      try { const d = localStorage.getItem(draftKey); if (d) { setN({ ...vuota(), ...JSON.parse(d) }); toast.info("Bozza ripristinata"); } } catch (e) { }
    }
  }, [id]);
  useEffect(() => {
    if (id || ro || !touched.current || !n) return;
    const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify(n)); } catch (e) { } }, 1200);
    return () => clearTimeout(t);
  }, [n]);
  useEffect(() => {
    const f = (e) => { if (touched.current) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", f); return () => removeEventListener("beforeunload", f);
  }, []);
  if (!n) return html`<${Spinner} />`;

  const set = (k, v) => { touched.current = true; setN((x) => ({ ...x, [k]: v })); };
  const setFirma = (k) => (f) => set(k, f);
  const setFirmatario = (k) => (name) => set(k, { ...(n[k] || {}), firmatario: name });
  const dup = numeroDuplicato(all, n.numero_report, id);
  const sc = statoScadenza(n);
  const fl = n.firma_legacy || {};
  const controparti = fornitori(all, "controparte");

  const salva = async () => {
    if (!n.numero_report.trim()) { setStep(1); return toast.err("Inserisci il numero report"); }
    if (!n.data) { setStep(1); return toast.err("Inserisci la data"); }
    if (dup && !(await confirmDialog("Numero già usato", `Esiste già una NC con numero ${n.numero_report}. Salvare comunque?`, "Salva comunque"))) return;
    const body = { ...n };
    if (body.stato === "chiusa") {
      if (!body.data_chiusura) body.data_chiusura = isoDay();
      const miss = [!body.descrizione_nc && "descrizione", !body.trattamento_tipo && "tipo trattamento", !body.azione_correttiva && "azione correttiva"].filter(Boolean);
      if (miss.length && !(await confirmDialog("Chiudere la NC incompleta?", "Mancano: " + miss.join(", ") + ".", "Chiudi comunque"))) return;
    } else body.data_chiusura = body.data_chiusura || "";
    setBusy(true);
    try {
      if (id) { await update("nc", id, body, body.numero_report); setN(body); toast.ok("NC aggiornata"); }
      else {
        const r = await create("nc", { ...body, uid: crypto.randomUUID() }, body.numero_report);
        await flushPending("nc", r.id, pending); setPending([]);
        try { localStorage.removeItem(draftKey); } catch (e) { }
        touched.current = false; toast.ok("NC creata"); go("/nc/" + r.id); return;
      }
      touched.current = false;
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  const elimina = async () => {
    if (!(await confirmDialog("Eliminare la NC?", `NC ${n.numero_report}: operazione irreversibile.`))) return;
    await remove("nc", id, n.numero_report); touched.current = false; toast.ok("NC eliminata"); go("/registro-nc");
  };
  const aggiungiAgg = async () => {
    if (!agg.note.trim()) return toast.err("Scrivi l'aggiornamento");
    const s = [...(n.storico || []), { ...agg, stato: agg.stato || n.stato, autore: session.user.label, created_at: new Date().toISOString() }];
    const body = { ...n, storico: s, ...(agg.stato ? { stato: agg.stato, data_chiusura: agg.stato === "chiusa" ? (n.data_chiusura || agg.data) : n.data_chiusura } : {}) };
    try { if (id) await update("nc", id, { storico: s, stato: body.stato, data_chiusura: body.data_chiusura }, n.numero_report + " (aggiornamento)"); setN(body); setAgg({ data: isoDay(), note: "", stato: "" }); toast.ok("Aggiornamento registrato"); }
    catch (e) { toast.err("Errore: " + e.code); }
  };
  const ta = (k, rows = 3, extra) => html`<textarea class="inp" rows=${rows} value=${n[k]} disabled=${ro || (extra && n[k] === ND)} onInput=${(e) => set(k, e.target.value)}></textarea>`;
  const inp = (k, ph = "") => html`<input class="inp" placeholder=${ph} value=${n[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)} />`;
  const date = (k) => html`<input type="date" class="inp" value=${n[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)} />`;

  const S = {
    1: html`<div class="form-grid">
      <${Field} label="Numero report" hint=${dup ? html`<span class="warn">⚠ Numero già usato da un'altra NC</span>` : "Formato consigliato NN/AA (es. 28/26)"}>${inp("numero_report")}</${Field}>
      <${Field} label="Data">${date("data")}</${Field}>
      <${Field} label="Documento riferimento">${inp("documento_riferimento", "es. DDT 304/2026, Commessa 25/00139")}</${Field}>
      <${Field} label="Origine NC"><${Select} value=${n.origine_nc} disabled=${ro} options=${[...ORIGINI_NC, ...(n.origine_nc && !ORIGINI_NC.includes(n.origine_nc) ? [n.origine_nc] : [])]} onChange=${(v) => set("origine_nc", v)} /></${Field}>
      <${Field} label="Controparte (fornitore/cliente)"><input class="inp" list="dl-cp" value=${n.controparte} disabled=${ro} onInput=${(e) => set("controparte", e.target.value)} />
        <datalist id="dl-cp">${controparti.map((c) => html`<option value=${c} />`)}</datalist></${Field}>
      <${Field} label="Classificazione"><${Select} value=${n.classificazione} disabled=${ro} placeholder="RF / NC / RC" options=${CLASSIFICAZIONI} onChange=${(v) => set("classificazione", v)} /></${Field}>
      ${n.funzione && html`<${Field} label="Funzione (vecchio gestionale)" full><input class="inp" value=${n.funzione} disabled /></${Field}>`}
    </div>`,
    2: html`<div class="form-grid">
      <${Field} label="Descrizione materiale" full>${ta("materiale_descrizione", 3)}</${Field}>
      <${Field} label="Quantità">${inp("quantita")}</${Field}>
      <${Field} label=" "><label class="chk"><input type="checkbox" checked=${!!n.quantita_definitiva} disabled=${ro} onChange=${(e) => set("quantita_definitiva", e.target.checked)} /> Quantità definitiva</label></${Field}>
      <div class="full"><${Allegati} parentType="nc" parentId=${id} disabled=${ro} pending=${pending} onPending=${setPending} legacy=${n.allegati_legacy || []} /></div>
    </div>`,
    3: html`<div class="form-grid">
      <${Field} label="Descrizione non conformità" full>${ta("descrizione_nc", 5)}</${Field}>
      <${Field} label="Responsabile rilevazione">${inp("responsabile_rilevazione")}</${Field}>
      <div class="full"><${SignaturePad} label="Firma rilevazione" value=${n.firma_rilevazione} disabled=${ro} firmatario=${(n.firma_rilevazione && n.firma_rilevazione.firmatario) || n.responsabile_rilevazione}
        onChange=${setFirma("firma_rilevazione")} />${fl.rilevazione && html`<small class="muted">Firma vecchio gestionale: ${fl.rilevazione}</small>`}</div>
    </div>`,
    4: html`<div class="form-grid">
      <${Field} label="Tipo trattamento"><${Select} value=${n.trattamento_tipo} disabled=${ro} options=${TRATTAMENTI.map((t) => ({ v: t, l: t[0].toUpperCase() + t.slice(1) }))} onChange=${(v) => set("trattamento_tipo", v)} /></${Field}>
      <${Field} label="Data completamento">${date("data_completamento")}</${Field}>
      <${Field} label="Causa" full>${ta("causa", 3)}</${Field}>
      <div class="field full"><div class="lbl-row"><label>Trattamento</label><${NDCheck} value=${n.trattamento} disabled=${ro} onSet=${(v) => set("trattamento", v)} /></div>${ta("trattamento", 3, true)}</div>
      <div class="full"><${SignaturePad} label="Firma trattamento" value=${n.firma_trattamento} disabled=${ro}
        firmatario=${(n.firma_trattamento && n.firma_trattamento.firmatario) || ""} onFirmatario=${setFirmatario("firma_trattamento")} onChange=${setFirma("firma_trattamento")} />
        ${fl.trattamento && html`<small class="muted">Firma vecchio gestionale: ${fl.trattamento}</small>`}</div>
    </div>`,
    5: html`<div class="form-grid">
      <div class="field full"><div class="lbl-row"><label>Azione correttiva</label><${NDCheck} value=${n.azione_correttiva} disabled=${ro} onSet=${(v) => set("azione_correttiva", v)} /></div>${ta("azione_correttiva", 3, true)}</div>
      <${Field} label="Data azione">${date("data_azione")}</${Field}>
      <${Field} label="Data verifica efficacia">${date("data_verifica_efficacia")}</${Field}>
      <${Field} label="Efficacia" full>${ta("efficacia", 3)}</${Field}>
      <div class="full"><${SignaturePad} label="Firma efficacia" value=${n.firma_efficacia} disabled=${ro}
        firmatario=${(n.firma_efficacia && n.firma_efficacia.firmatario) || ""} onFirmatario=${setFirmatario("firma_efficacia")} onChange=${setFirma("firma_efficacia")} />
        ${fl.azione && html`<small class="muted">Firma vecchio gestionale: ${fl.azione}</small>`}</div>
    </div>`,
    6: html`<div class="form-grid">
      <${Field} label="Stato"><${Select} value=${n.stato} disabled=${ro} placeholder="—" options=${[{ v: "aperta", l: "Aperta" }, { v: "chiusa", l: "Chiusa" }]} onChange=${(v) => { set("stato", v); if (v === "chiusa" && !n.data_chiusura) set("data_chiusura", isoDay()); }} /></${Field}>
      <${Field} label="Data chiusura">${date("data_chiusura")}</${Field}>
      <${Field} label="Data scadenza (revisione)" hint=${!n.data_scadenza && scadenzaNC(n) ? `Se vuota: scadenza automatica ${fmtDate(scadenzaNC(n).data)} (30 gg dall'apertura)` : ""}>${date("data_scadenza")}</${Field}>
      ${sc && html`<${Field} label="Situazione scadenza"><div><${Badge} v=${sc.status} /> <span class="small muted">${sc.giorni < 0 ? Math.abs(sc.giorni) + " gg di ritardo" : sc.giorni + " gg rimanenti"}</span></div></${Field}>`}
    </div>`,
  };

  return html`<div>
    <a class="back" href="#/registro-nc"><${Icon} n="back" s=${14} /> Registro NC</a>
    <${PageHeader} title=${id ? "Non Conformità" : "Nuova Non Conformità"} subtitle=${n.numero_report}>
      <${Badge} v=${n.stato} />${sc && sc.status !== "in_corso" && html` <${Badge} v=${sc.status} />`}
      ${id && html`<button class="btn outline" onClick=${() => pdfNC({ ...n, id })}><${Icon} n="download" /> PDF</button>`}
      ${admin && id && html`<button class="btn ghost danger-t" title="Elimina" onClick=${elimina}><${Icon} n="trash" /></button>`}
      ${admin && html`<button class="btn primary" disabled=${busy} onClick=${salva}>${busy ? html`<span class="spin sm"></span>` : html`<${Icon} n="save" />`} Salva</button>`}
    </${PageHeader}>
    ${ro && html`<div class="ro-note"><${Icon} n="lock" s=${14} /> Modalità sola consultazione (Ospite). Modifiche disabilitate.</div>`}
    ${ro && html`<${GuestPanel} entity="nc" id=${id} label=${`NC ${n.numero_report} · ${n.materiale_descrizione || ""}`} />`}

    <div class="row-between"><div class="stepper">${STEPS.map((s, i) => html`<button key=${s.n} class=${"step" + (!full && step === s.n ? " on" : !full && step > s.n ? " done" : "")} onClick=${() => { setFull(false); setStep(s.n); }}>
      <span class="step-n">${!full && step > s.n ? html`<${Icon} n="check" s=${12} />` : s.n}</span><span class="step-l">${s.l}</span></button>${i < STEPS.length - 1 && html`<i class="step-line"></i>`}`)}</div>
      <button class="btn ghost sm" onClick=${() => setFull(!full)}><${Icon} n=${full ? "list" : "file"} s=${14} /> ${full ? "Vista a passi" : "Vista completa"}</button></div>

    ${full ? STEPS.map((s) => html`<${Card} title=${s.n + ". " + s.l} key=${s.n}>${S[s.n]}</${Card}>`) : html`<${Card}>${S[step]}
      <div class="row-between wiz-nav"><button class="btn outline" disabled=${step === 1} onClick=${() => setStep(step - 1)}><${Icon} n="back" /> Indietro</button>
        ${step < 6 ? html`<button class="btn primary" onClick=${() => setStep(step + 1)}>Avanti <${Icon} n="next" /></button>`
          : admin && html`<button class="btn primary" disabled=${busy} onClick=${salva}><${Icon} n="save" /> Salva NC</button>`}</div></${Card}>`}

    ${id && html`<${Card} title="Storico aggiornamenti" right=${html`<span class="muted small">${(n.storico || []).length} voci</span>`}>
      ${(n.storico || []).length === 0 ? html`<p class="muted small">Nessun aggiornamento registrato.</p>` : html`<div class="timeline">
        ${[...n.storico].reverse().map((s) => html`<div class="tl"><span class="tl-d">${fmtDate(s.data)}</span><div><p>${s.note || html`<i class="muted">(senza note)</i>`}</p>
          <small class="muted">${s.autore || "—"}${s.stato ? " · stato: " + s.stato : ""}${s.legacy ? " · vecchio gestionale" : ""}</small></div></div>`)}</div>`}
      ${admin && html`<div class="agg-form"><input type="date" class="inp" value=${agg.data} onInput=${(e) => setAgg({ ...agg, data: e.target.value })} />
        <input class="inp grow" placeholder="Aggiornamento (es. risposta al sollecito, esito verifica…)" value=${agg.note} onInput=${(e) => setAgg({ ...agg, note: e.target.value })} />
        <select class="inp" value=${agg.stato} onChange=${(e) => setAgg({ ...agg, stato: e.target.value })}><option value="">Stato invariato</option><option value="aperta">→ Aperta</option><option value="chiusa">→ Chiusa</option></select>
        <button class="btn outline" onClick=${aggiungiAgg}><${Icon} n="plus" /> Aggiungi</button></div>`}
    </${Card}>`}
    ${id && html`<p class="meta muted small">Creata ${fmtDT(n.created_at)} da ${n.created_by || "—"}${n.updated_by ? ` · Ultima modifica ${fmtDT(n.updated_at)} da ${n.updated_by}` : ""}${n.legacy_id ? ` · ID vecchio gestionale ${n.legacy_id}` : ""}</p>`}
  </div>`;
}
