import { html, useState, useEffect, Icon, PageHeader, Card, Field, Spinner, Empty, Modal, toast, confirmDialog, fmtDate, norm, Badge } from "../ui.js";
import { isAdmin, create, update, remove, audit } from "../store.js";
import { useCollections } from "./common.js";
import { GuestPanel, GuestRowActions } from "../guest.js";

const vuota = () => ({ codice: "", descrizione: "", cliente: "", data_consegna: "", quantita_macchine: "", quote_template: [], materiali: [] });

export function Commesse() {
  const [d] = useCollections(["commesse", "controlli"]);
  const [q, setQ] = useState("");
  const [ed, setEd] = useState(null);
  const [busy, setBusy] = useState(false);
  const admin = isAdmin(), ro = !admin;
  useEffect(() => {
    const id = location.hash.split("?")[1];
    if (d && id) { const r = d.commesse.find((x) => x.id === id); if (r) setEd({ ...vuota(), ...r }); }
  }, [d && d.commesse.length]);
  if (!d) return html`<${Spinner} />`;
  const nq = norm(q);
  const rows = d.commesse.filter((x) => !nq || norm([x.codice, x.descrizione, x.cliente].join(" ")).includes(nq)).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const set = (k, v) => setEd((x) => ({ ...x, [k]: v }));
  const setT = (i, k, v) => set("quote_template", ed.quote_template.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const open = (r) => { setEd({ ...vuota(), ...r }); if (ro && r.id) audit("view", "commesse", r.id, r.codice); };
  const salva = async () => {
    if (!ed.codice.trim()) return toast.err("Inserisci il codice commessa");
    if (d.commesse.some((x) => x.id !== ed.id && norm(x.codice) === norm(ed.codice))) return toast.err("Codice commessa già esistente");
    setBusy(true);
    try {
      const body = { ...ed, quote_template: ed.quote_template.filter((t) => t.descrizione) };
      if (ed.id) await update("commesse", ed.id, body, ed.codice); else await create("commesse", { ...body, uid: crypto.randomUUID() }, ed.codice);
      toast.ok("Commessa salvata"); setEd(null);
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  const del = async (r) => {
    if (!(await confirmDialog("Eliminare la commessa?", `${r.codice} · ${r.cliente || ""}`))) return;
    await remove("commesse", r.id, r.codice); toast.ok("Commessa eliminata"); setEd(null);
  };
  const ctrl = ed && ed.codice ? d.controlli.filter((c) => c.codice_commessa && norm(c.codice_commessa) === norm(ed.codice)) : [];

  return html`<div>
    <${PageHeader} title="Commesse" subtitle="Anagrafica commesse e template quote per precompilazione">
      ${admin && html`<button class="btn primary" onClick=${() => open(vuota())}><${Icon} n="plus" /> Nuova Commessa</button>`}
    </${PageHeader}>
    <${Card}>
      <div class="filters"><div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca codice, cliente…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div></div>
      ${rows.length === 0 ? html`<${Empty} text="Nessuna commessa registrata." icon="box" />` : html`<div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Codice</th><th>Cliente</th><th>Descrizione</th><th>Consegna</th><th>Template</th><th class="r">Azioni</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr key=${r.id} onClick=${() => open(r)}>
          <td class="mono"><b>${r.codice}</b></td><td>${r.cliente || "—"}</td><td class="ell">${r.descrizione || "—"}</td><td class="mono">${fmtDate(r.data_consegna)}</td>
          <td class="small">${(r.quote_template || []).length} quote${(r.materiali || []).length ? ` · ${r.materiali.length} materiali` : ""}</td>
          <td class="r nowrap" onClick=${(e) => e.stopPropagation()}>
            <button class="btn ghost icon" onClick=${() => open(r)}><${Icon} n=${admin ? "pencil" : "eye"} /></button>
            ${admin ? html`<button class="btn ghost icon danger-t" onClick=${() => del(r)}><${Icon} n="trash" /></button>` : html`<${GuestRowActions} entity="commesse" id=${r.id} label=${"Commessa " + r.codice} />`}
          </td></tr>`)}</tbody></table></div>`}
    </${Card}>

    <${Modal} open=${!!ed} wide onClose=${() => setEd(null)} title=${ed && ed.id ? "Commessa " + ed.codice : "Nuova commessa"}
      footer=${admin ? html`<button class="btn outline" onClick=${() => setEd(null)}>Annulla</button><button class="btn primary" disabled=${busy} onClick=${salva}><${Icon} n="save" /> Salva</button>`
        : html`<button class="btn outline" onClick=${() => setEd(null)}>Chiudi</button>`}>
      ${ed && html`<div class="form-grid">
        <${Field} label="Codice"><input class="inp" placeholder="es. 25/00139" value=${ed.codice} disabled=${ro} onInput=${(e) => set("codice", e.target.value)} /></${Field}>
        <${Field} label="Cliente"><input class="inp" value=${ed.cliente} disabled=${ro} onInput=${(e) => set("cliente", e.target.value)} /></${Field}>
        <${Field} label="Data consegna"><input type="date" class="inp" value=${ed.data_consegna} disabled=${ro} onInput=${(e) => set("data_consegna", e.target.value)} /></${Field}>
        <${Field} label="Quantità macchine"><input class="inp" value=${ed.quantita_macchine} disabled=${ro} onInput=${(e) => set("quantita_macchine", e.target.value)} /></${Field}>
        <${Field} label="Descrizione" full><textarea class="inp" rows="2" value=${ed.descrizione} disabled=${ro} onInput=${(e) => set("descrizione", e.target.value)}></textarea></${Field}>
        <div class="field full"><div class="lbl-row"><label>Template quote (precompila i controlli)</label>
          ${admin && html`<button class="btn outline sm" onClick=${() => set("quote_template", [...ed.quote_template, { descrizione: "", valore_teorico: "", tolleranza: "", unita: "mm" }])}><${Icon} n="plus" s=${14} /> Quota</button>`}</div>
          ${ed.quote_template.length === 0 && html`<small class="muted">Nessuna quota: aggiungile per precompilare i controlli con il pulsante bacchetta.</small>`}
          ${ed.quote_template.map((t, i) => html`<div class="mat-row four"><input class="inp" placeholder="Descrizione" value=${t.descrizione} disabled=${ro} onInput=${(e) => setT(i, "descrizione", e.target.value)} />
            <input class="inp" placeholder="Teorico" value=${t.valore_teorico} disabled=${ro} onInput=${(e) => setT(i, "valore_teorico", e.target.value)} />
            <input class="inp" placeholder="Toll. ±" value=${t.tolleranza} disabled=${ro} onInput=${(e) => setT(i, "tolleranza", e.target.value)} />
            ${admin && html`<button class="btn ghost icon sm" onClick=${() => set("quote_template", ed.quote_template.filter((_, j) => j !== i))}><${Icon} n="trash" s=${14} /></button>`}</div>`)}</div>
        ${(ed.materiali || []).length > 0 && html`<div class="full"><label class="lbl">Distinta materiali (${ed.materiali.length})</label><div class="tbl-wrap"><table class="tbl small">
          <thead><tr><th>Componente</th><th>Tipologia</th><th>Descrizione</th><th>Q.tà</th></tr></thead>
          <tbody>${ed.materiali.map((m) => html`<tr><td class="mono">${m.Componente || ""}</td><td>${m.Tipologia || ""}</td><td>${m.Descrizione || m.descrizione || ""}</td><td>${(m.Quantita || "").replace("Qtà:", "")} ${m.UM || ""}</td></tr>`)}</tbody></table></div></div>`}
        ${ctrl.length > 0 && html`<div class="full"><label class="lbl">Controlli su questa commessa</label><div class="mini-list">${ctrl.map((c) => html`<a class="mini" href=${"#/controllo/" + c.id}><div><b>${c.tipo}</b><small>${c.fornitore} · ${fmtDate(c.data)}</small></div><${Badge} v=${c.conformita_generale} /></a>`)}</div></div>`}
        ${ro && ed.id && html`<div class="full"><${GuestPanel} entity="commesse" id=${ed.id} label=${"Commessa " + ed.codice} /></div>`}
      </div>`}
    </${Modal}>
  </div>`;
}
