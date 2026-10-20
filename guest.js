import { html, useState, useEffect, Icon, toast, Modal, Badge, fmtDT, ago } from "./ui.js";
import { sendSegnalazione, segnalazioniFor, isAdmin } from "./store.js";

const nameKey = "qc-guest-name";
const getName = () => { try { return localStorage.getItem(nameKey) || ""; } catch (e) { return ""; } };
const setName = (n) => { try { localStorage.setItem(nameKey, n); } catch (e) { } };

// Pannello "Sollecita" + "Vuoi aggiungere note?" — visibile solo all'ospite
export function GuestPanel({ entity, id, label }) {
  const [open, setOpen] = useState(false);
  const [testo, setTesto] = useState("");
  const [nome, setNome] = useState(getName());
  const [busy, setBusy] = useState(false);
  const [storia, setStoria] = useState([]);
  const load = () => segnalazioniFor(id).then(setStoria).catch(() => {});
  useEffect(() => { if (id) load(); }, [id]);
  if (isAdmin() || !id) return null;

  const invia = async (tipo) => {
    if (tipo === "nota" && !testo.trim()) return toast.err("Scrivi prima la nota");
    setBusy(true);
    try {
      setName(nome);
      await sendSegnalazione({ tipo, entity, entity_id: id, entity_label: label, testo: tipo === "nota" ? testo : testo || "Richiesta di aggiornamento", autore: nome || "Ospite" });
      toast.ok(tipo === "sollecito" ? "Sollecito inviato a Biagio" : "Nota inviata");
      setTesto(""); setOpen(false); load();
    } catch (e) { toast.err("Invio non riuscito (" + (e.code || e.message) + ")"); }
    setBusy(false);
  };
  return html`<section class="card guest-panel">
    <div class="gp-row">
      <div><h3><${Icon} n="megaphone" /> Serve un aggiornamento?</h3>
        <p class="muted small">Il sollecito arriva subito nel portale del Responsabile Qualità.</p></div>
      <button class="btn primary" disabled=${busy} onClick=${() => invia("sollecito")}><${Icon} n="megaphone" /> Sollecita</button>
    </div>
    <button class="link-btn" onClick=${() => setOpen(!open)}><${Icon} n="note" s=${14} /> Vuoi aggiungere note?</button>
    ${open && html`<div class="gp-form">
      <input class="inp" placeholder="Il tuo nome (facoltativo)" value=${nome} onInput=${(e) => setNome(e.target.value)} />
      <textarea class="inp" rows="3" maxlength="2000" placeholder="Scrivi qui la tua nota…" value=${testo} onInput=${(e) => setTesto(e.target.value)}></textarea>
      <div class="row-end"><button class="btn outline" onClick=${() => setOpen(false)}>Annulla</button>
        <button class="btn primary" disabled=${busy} onClick=${() => invia("nota")}><${Icon} n="note" /> Invia nota</button></div>
    </div>`}
    ${storia.length > 0 && html`<div class="gp-hist"><div class="lbl">Già inviati su questo documento</div>
      ${storia.slice(0, 6).map((s) => html`<div class="gp-item"><${Badge} v=${s.tipo} /> <span>${s.testo}</span>
        <span class="muted small">${s.autore} · ${ago(s.ts)}</span> <${Badge} v=${s.stato} />
        ${s.risposta && html`<div class="segn-r"><${Icon} n="back" s=${12} /> Risposta di Biagio: ${s.risposta}</div>`}</div>`)}</div>`}
  </section>`;
}

// Versione compatta per le righe dei registri: due icone che aprono una finestrella
export function GuestRowActions({ entity, id, label }) {
  const [mode, setMode] = useState(null);
  const [testo, setTesto] = useState("");
  const [nome, setNome] = useState(getName());
  const [busy, setBusy] = useState(false);
  if (isAdmin()) return null;
  const invia = async () => {
    if (mode === "nota" && !testo.trim()) return toast.err("Scrivi prima la nota");
    setBusy(true);
    try {
      setName(nome);
      await sendSegnalazione({ tipo: mode, entity, entity_id: id, entity_label: label, testo: testo || "Richiesta di aggiornamento", autore: nome || "Ospite" });
      toast.ok(mode === "sollecito" ? "Sollecito inviato" : "Nota inviata");
      setMode(null); setTesto("");
    } catch (e) { toast.err("Invio non riuscito"); }
    setBusy(false);
  };
  return html`<button class="btn ghost icon sollecita" title="Sollecita" onClick=${(e) => { e.stopPropagation(); setMode("sollecito"); }}><${Icon} n="megaphone" /></button>
    <button class="btn ghost icon" title="Aggiungi nota" onClick=${(e) => { e.stopPropagation(); setMode("nota"); }}><${Icon} n="note" /></button>
    <${Modal} open=${!!mode} onClose=${() => setMode(null)} title=${(mode === "sollecito" ? "Sollecita · " : "Nota · ") + label}
      footer=${html`<button class="btn outline" onClick=${() => setMode(null)}>Annulla</button>
        <button class="btn primary" disabled=${busy} onClick=${invia}><${Icon} n=${mode === "sollecito" ? "megaphone" : "note"} /> ${mode === "sollecito" ? "Invia sollecito" : "Invia nota"}</button>`}>
      <div class="form-col">
        ${mode === "sollecito" && html`<p class="muted">Chiedi a Biagio di aggiornare questo documento.</p>`}
        <input class="inp" placeholder="Il tuo nome (facoltativo)" value=${nome} onInput=${(e) => setNome(e.target.value)} />
        <label class="lbl">${mode === "sollecito" ? "Vuoi aggiungere note?" : "Nota"}</label>
        <textarea class="inp" rows="4" maxlength="2000" placeholder=${mode === "sollecito" ? "Facoltativo" : "Scrivi la nota…"} value=${testo} onInput=${(e) => setTesto(e.target.value)}></textarea>
      </div>
    </${Modal}>`;
}
