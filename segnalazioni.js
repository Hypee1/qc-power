import { html, useState, useEffect, Icon, Badge, PageHeader, Card, Spinner, Empty, toast, confirmDialog, fmtDT, ago } from "../ui.js";
import { watchSegnalazioni, setSegnalazione, delSegnalazione, audit } from "../store.js";

const link = (s) => s.entity === "controlli" ? "#/controllo/" + s.entity_id : s.entity === "nc" ? "#/nc/" + s.entity_id : s.entity === "ddt" ? "#/ddt?" + s.entity_id : s.entity === "commesse" ? "#/commesse?" + s.entity_id : "#/";
const ENT = { controlli: "Controllo", nc: "NC", ddt: "Documento", commesse: "Commessa" };

export function Segnalazioni() {
  const [rows, setRows] = useState(null);
  const [stato, setStato] = useState("aperte");
  const [tipo, setTipo] = useState("");
  const [risp, setRisp] = useState({});
  useEffect(() => watchSegnalazioni(setRows), []);
  if (!rows) return html`<${Spinner} />`;
  const f = rows.filter((s) => (stato === "aperte" ? s.stato !== "risolta" : !stato || s.stato === stato) && (!tipo || s.tipo === tipo));
  const nuove = rows.filter((s) => s.stato === "nuova");
  const act = async (s, data, msg) => { try { await setSegnalazione(s.id, data); msg && toast.ok(msg); } catch (e) { toast.err("Errore: " + e.code); } };
  const rispondi = async (s) => {
    const t = (risp[s.id] || "").trim(); if (!t) return toast.err("Scrivi la risposta");
    await act(s, { risposta: t, risposta_ts: new Date().toISOString(), stato: "risolta" }, "Risposta salvata: l'ospite la vede sul documento");
    audit("update", "segnalazioni", s.id, s.entity_label, t); setRisp({ ...risp, [s.id]: "" });
  };
  return html`<div>
    <${PageHeader} title="Segnalazioni" subtitle="Solleciti e note inviati dall'ospite — arrivano qui in tempo reale">
      ${nuove.length > 0 && html`<button class="btn outline" onClick=${() => Promise.all(nuove.map((s) => setSegnalazione(s.id, { stato: "letta" }))).then(() => toast.ok("Tutte lette"))}><${Icon} n="check" /> Segna tutte come lette</button>`}
    </${PageHeader}>
    <div class="kpis three">
      <div class="kpi k-red"><div><span class="lbl">Nuove</span><b>${nuove.length}</b><small>da leggere</small></div><span class="kpi-ic"><${Icon} n="bell" s=${18} /></span></div>
      <div class="kpi k-amber"><div><span class="lbl">Solleciti aperti</span><b>${rows.filter((s) => s.tipo === "sollecito" && s.stato !== "risolta").length}</b><small>richieste di aggiornamento</small></div><span class="kpi-ic"><${Icon} n="megaphone" s=${18} /></span></div>
      <div class="kpi k-blue"><div><span class="lbl">Note</span><b>${rows.filter((s) => s.tipo === "nota").length}</b><small>totali ricevute</small></div><span class="kpi-ic"><${Icon} n="note" s=${18} /></span></div>
    </div>
    <${Card}>
      <div class="filters">
        <select class="inp" value=${stato} onChange=${(e) => setStato(e.target.value)}><option value="aperte">Da gestire</option><option value="nuova">Nuove</option><option value="letta">Lette</option><option value="risolta">Risolte</option><option value="">Tutte</option></select>
        <select class="inp" value=${tipo} onChange=${(e) => setTipo(e.target.value)}><option value="">Solleciti e note</option><option value="sollecito">Solo solleciti</option><option value="nota">Solo note</option></select>
        <span class="muted small">${f.length} segnalazioni</span>
      </div>
      ${f.length === 0 ? html`<${Empty} text="Niente da gestire. Tutto in ordine." icon="checkCircle" />` : html`<div class="segn-list">
        ${f.map((s) => html`<div key=${s.id} class=${"segn" + (s.stato === "nuova" ? " new" : "")}>
          <div class="segn-h"><${Badge} v=${s.tipo} /><a href=${link(s)} onClick=${() => s.stato === "nuova" && setSegnalazione(s.id, { stato: "letta" })}><b>${s.entity_label || ENT[s.entity]}</b></a>
            <span class="grow"></span><span class="muted small" title=${fmtDT(s.ts)}>${ago(s.ts)}</span><${Badge} v=${s.stato} /></div>
          <p class="segn-t">${s.testo}</p>
          <div class="muted small">da <b>${s.autore || "Ospite"}</b> · ${s.dispositivo || ""}</div>
          ${s.risposta && html`<div class="segn-r"><${Icon} n="back" s=${12} /> Tua risposta: ${s.risposta} <span class="muted small">· ${fmtDT(s.risposta_ts)}</span></div>`}
          <div class="segn-a">
            ${s.stato !== "risolta" && html`<input class="inp grow" placeholder="Rispondi all'ospite (facoltativo)…" value=${risp[s.id] || ""} onInput=${(e) => setRisp({ ...risp, [s.id]: e.target.value })} />
              <button class="btn outline sm" onClick=${() => rispondi(s)}><${Icon} n="note" s=${14} /> Rispondi e risolvi</button>`}
            <a class="btn outline sm" href=${link(s)} onClick=${() => s.stato === "nuova" && setSegnalazione(s.id, { stato: "letta" })}><${Icon} n="pencil" s=${14} /> Apri e aggiorna</a>
            ${s.stato === "nuova" && html`<button class="btn ghost sm" onClick=${() => act(s, { stato: "letta" })}>Segna letta</button>`}
            ${s.stato !== "risolta" ? html`<button class="btn ghost sm" onClick=${() => act(s, { stato: "risolta" }, "Segnata come risolta")}><${Icon} n="check" s=${14} /> Risolta</button>`
              : html`<button class="btn ghost sm" onClick=${() => act(s, { stato: "letta" })}>Riapri</button>`}
            <button class="btn ghost icon sm danger-t" title="Elimina" onClick=${async () => (await confirmDialog("Eliminare la segnalazione?", s.testo)) && delSegnalazione(s.id)}><${Icon} n="trash" s=${14} /></button>
          </div></div>`)}</div>`}
    </${Card}>
  </div>`;
}
