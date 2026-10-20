import { html, useState, useEffect, Icon, Badge, PageHeader, Card, Field, Spinner, Empty, Modal, Select, toast, confirmDialog, fmtDate, norm, isoDay } from "../ui.js";
import { isAdmin, create, update, remove, audit } from "../store.js";
import { useCollections, fornitori } from "./common.js";
import { Allegati, flushPending } from "../widgets.js";
import { GuestPanel, GuestRowActions } from "../guest.js";

const vuoto = () => ({ numero: "", tipo: "ddt", fornitore: "", data: isoDay(), commessa: "", descrizione: "", note: "", certificato_disponibile: false, materiali: [] });

export function DDT() {
  const [d] = useCollections(["ddt", "controlli"]);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("all");
  const [ed, setEd] = useState(null);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const admin = isAdmin(), ro = !admin;
  useEffect(() => {
    const id = location.hash.split("?")[1];
    if (d && id) { const r = d.ddt.find((x) => x.id === id); if (r) setEd({ ...vuoto(), ...r }); }
  }, [d && d.ddt.length]);
  if (!d) return html`<${Spinner} />`;
  const nq = norm(q);
  const rows = d.ddt.filter((x) => (tipo === "all" || x.tipo === tipo) && (!nq || norm([x.numero, x.fornitore, x.descrizione, x.note, x.commessa].join(" ")).includes(nq)))
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const forn = fornitori([...d.ddt, ...d.controlli]);
  const open = (r) => { setPending([]); setEd({ ...vuoto(), ...r }); if (ro && r.id) audit("view", "ddt", r.id, r.numero); };
  const set = (k, v) => setEd((x) => ({ ...x, [k]: v }));
  const salva = async () => {
    if (!ed.numero.trim()) return toast.err("Inserisci il numero documento");
    setBusy(true);
    try {
      if (ed.id) await update("ddt", ed.id, ed, ed.numero);
      else { const r = await create("ddt", { ...ed, uid: crypto.randomUUID() }, ed.numero); await flushPending("ddt", r.id, pending); }
      toast.ok("Documento salvato"); setEd(null);
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  const del = async (r) => {
    if (!(await confirmDialog("Eliminare il documento?", `${r.numero} · ${r.fornitore}`))) return;
    await remove("ddt", r.id, r.numero); toast.ok("Documento eliminato"); setEd(null);
  };
  const collegati = ed && ed.numero ? d.controlli.filter((c) => c.ddt && norm(c.ddt).replace(/\D/g, "") && norm(c.ddt).replace(/\D/g, "") === norm(ed.numero).replace(/\D/g, "")) : [];

  return html`<div>
    <${PageHeader} title="Certificati & DDT" subtitle="Documenti di trasporto e certificati di conformità">
      ${admin && html`<button class="btn primary" onClick=${() => open(vuoto())}><${Icon} n="plus" /> Nuovo Documento</button>`}
    </${PageHeader}>
    <${Card}>
      <div class="filters">
        <div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca numero, fornitore, commessa…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="inp" value=${tipo} onChange=${(e) => setTipo(e.target.value)}><option value="all">Tutti i tipi</option><option value="ddt">DDT</option><option value="certificato">Certificato</option></select>
      </div>
      ${rows.length === 0 ? html`<${Empty} text="Nessun documento." />` : html`<div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Numero</th><th>Tipo</th><th>Fornitore</th><th>Data</th><th>Commessa / Descrizione</th><th>Cert.</th><th class="r">Azioni</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr key=${r.id} onClick=${() => open(r)}>
          <td class="mono"><b>${r.numero}</b></td><td><${Badge} v=${r.tipo} /></td><td>${r.fornitore || "—"}</td><td class="mono">${fmtDate(r.data)}</td>
          <td>${r.commessa || r.descrizione || "—"}${(r.materiali || []).length > 0 && html`<small class="muted block">${r.materiali.map((m) => m.tipo).join(", ")}</small>`}</td>
          <td>${r.certificato_disponibile ? html`<span class="t-green">✓</span>` : html`<span class="muted">—</span>`}</td>
          <td class="r nowrap" onClick=${(e) => e.stopPropagation()}>
            <button class="btn ghost icon" title=${admin ? "Modifica" : "Apri"} onClick=${() => open(r)}><${Icon} n=${admin ? "pencil" : "eye"} /></button>
            ${admin ? html`<button class="btn ghost icon danger-t" title="Elimina" onClick=${() => del(r)}><${Icon} n="trash" /></button>`
              : html`<${GuestRowActions} entity="ddt" id=${r.id} label=${`${r.tipo === "certificato" ? "Certificato" : "DDT"} ${r.numero} · ${r.fornitore}`} />`}
          </td></tr>`)}</tbody></table></div>`}
    </${Card}>

    <${Modal} open=${!!ed} wide onClose=${() => setEd(null)} title=${ed && ed.id ? (admin ? "Modifica documento" : "Documento " + ed.numero) : "Nuovo documento"}
      footer=${admin ? html`${ed && ed.id && html`<button class="btn ghost danger-t" onClick=${() => del(ed)}><${Icon} n="trash" /> Elimina</button>`}
        <button class="btn outline" onClick=${() => setEd(null)}>Annulla</button><button class="btn primary" disabled=${busy} onClick=${salva}><${Icon} n="save" /> Salva</button>`
        : html`<button class="btn outline" onClick=${() => setEd(null)}>Chiudi</button>`}>
      ${ed && html`<div class="form-grid">
        <${Field} label="Numero"><input class="inp" value=${ed.numero} disabled=${ro} onInput=${(e) => set("numero", e.target.value)} /></${Field}>
        <${Field} label="Tipo"><${Select} value=${ed.tipo} disabled=${ro} placeholder="—" options=${[{ v: "ddt", l: "DDT" }, { v: "certificato", l: "Certificato" }]} onChange=${(v) => set("tipo", v)} /></${Field}>
        <${Field} label="Fornitore"><input class="inp" list="dl-fd" value=${ed.fornitore} disabled=${ro} onInput=${(e) => set("fornitore", e.target.value)} /><datalist id="dl-fd">${forn.map((f) => html`<option value=${f} />`)}</datalist></${Field}>
        <${Field} label="Data arrivo"><input type="date" class="inp" value=${ed.data} disabled=${ro} onInput=${(e) => set("data", e.target.value)} /></${Field}>
        <${Field} label="Commessa"><input class="inp" value=${ed.commessa || ""} disabled=${ro} onInput=${(e) => set("commessa", e.target.value)} /></${Field}>
        <${Field} label=" "><label class="chk"><input type="checkbox" checked=${!!ed.certificato_disponibile} disabled=${ro} onChange=${(e) => set("certificato_disponibile", e.target.checked)} /> Certificato di conformità disponibile</label></${Field}>
        <${Field} label="Descrizione" full><input class="inp" value=${ed.descrizione} disabled=${ro} onInput=${(e) => set("descrizione", e.target.value)} /></${Field}>
        <div class="field full"><div class="lbl-row"><label>Materiali</label>${admin && html`<button class="btn ghost sm" onClick=${() => set("materiali", [...(ed.materiali || []), { tipo: "", descrizione: "" }])}><${Icon} n="plus" s=${14} /> Riga</button>`}</div>
          ${(ed.materiali || []).map((m, i) => html`<div class="mat-row"><input class="inp" placeholder="Tipo materiale" value=${m.tipo} disabled=${ro} onInput=${(e) => set("materiali", ed.materiali.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))} />
            <input class="inp" placeholder="Descrizione / disegno" value=${m.descrizione} disabled=${ro} onInput=${(e) => set("materiali", ed.materiali.map((x, j) => (j === i ? { ...x, descrizione: e.target.value } : x)))} />
            ${admin && html`<button class="btn ghost icon sm" onClick=${() => set("materiali", ed.materiali.filter((_, j) => j !== i))}><${Icon} n="trash" s=${14} /></button>`}</div>`)}</div>
        <${Field} label="Note" full><textarea class="inp" rows="2" value=${ed.note} disabled=${ro} onInput=${(e) => set("note", e.target.value)}></textarea></${Field}>
        <div class="full"><${Allegati} parentType="ddt" parentId=${ed.id} disabled=${ro} pending=${pending} onPending=${setPending} legacy=${ed.allegati_legacy || []} /></div>
        ${collegati.length > 0 && html`<div class="full"><label class="lbl">Controlli collegati a questo DDT</label><div class="mini-list">${collegati.map((c) => html`<a class="mini" href=${"#/controllo/" + c.id}>
          <div><b>${c.tipo}</b><small>${c.fornitore} · ${fmtDate(c.data)}</small></div><${Badge} v=${c.conformita_generale} /></a>`)}</div></div>`}
        ${ro && ed.id && html`<div class="full"><${GuestPanel} entity="ddt" id=${ed.id} label=${`${ed.tipo === "certificato" ? "Certificato" : "DDT"} ${ed.numero} · ${ed.fornitore}`} /></div>`}
      </div>`}
    </${Modal}>
  </div>`;
}
