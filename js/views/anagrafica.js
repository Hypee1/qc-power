import { html, useState, useEffect, Icon, PageHeader, Card, Spinner, Empty, Modal, Field, Select, toast, confirmDialog, norm, fornKey, download, csv, isoDay } from "../ui.js";
import { create, update, remove, isAdmin, list, onDataChange } from "../store.js";
import { indiceNomi, FONTI, TIPI_SOGGETTO, tipiLabel } from "../nomi.js";

// Distanza tra due parole (per scovare i doppioni scritti male: "tecnostel" ~ "tecnosteel")
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

// Riscrive il nome in tutti i record che appartengono alla chiave "fromKey"
async function rinominaRecord(fromKey, nome, onProg) {
  let n = 0;
  for (const [col, field] of FONTI) {
    const rows = await list(col, { force: true });
    for (const r of rows) if (r[field] && fornKey(r[field]) === fromKey && r[field] !== nome) { await update(col, r.id, { [field]: nome }, `${field}: ${r[field]} → ${nome}`); n++; onProg && onProg(n); }
  }
  return n;
}

export function Anagrafica() {
  const [idx, setIdx] = useState(null);
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [ed, setEd] = useState(null);
  const admin = isAdmin();
  const load = () => Promise.all([indiceNomi(), list("controlli"), list("nc"), list("audit_clienti")]).then(([i, C, N, A]) => {
    const s = {};
    const g = (k) => (s[k] = s[k] || { ctrl: 0, ctrlNC: 0, nc: 0, ncAperte: 0, audit: 0 });
    C.forEach((c) => { const k = fornKey(c.fornitore); if (!k) return; g(k).ctrl++; if (c.conformita_generale === "non_conforme") g(k).ctrlNC++; });
    N.forEach((x) => { const k = fornKey(x.controparte); if (!k) return; g(k).nc++; if (x.stato === "aperta") g(k).ncAperte++; });
    A.forEach((a) => [a.cliente, a.cliente_finale].forEach((v) => { const k = fornKey(v); if (k) g(k).audit++; }));
    setIdx(i); setStats(s);
  }).catch((e) => { toast.err("Errore di lettura: " + (e.code || e.message)); setIdx(new Map()); setStats({}); });
  useEffect(() => { load(); return onDataChange((c) => { if (!c || ["soggetti", "controlli", "nc", "audit_clienti"].includes(c)) load(); }); }, []);
  if (!idx || !stats) return html`<${Spinner} />`;

  const all = [...idx.values()].map((e) => ({ ...e, st: stats[e.key] || { ctrl: 0, ctrlNC: 0, nc: 0, ncAperte: 0, audit: 0 } }));
  const nq = norm(q);
  const rows = all.filter((e) => (!tipo || e.tipi.has(tipo)) && (!nq || norm(e.nome).includes(nq) || Object.keys(e.varianti).some((v) => norm(v).includes(nq))))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const grafie = all.filter((e) => Object.keys(e.varianti).filter((v) => v !== e.nome).length > 0);
  const doppi = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i].key, b = all[j].key; if (a.length < 5 || b.length < 5) continue;
    if (lev(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1) || (a.length >= 6 && b.length >= 6 && (a.startsWith(b) || b.startsWith(a)))) doppi.push([all[i], all[j]]);
  }
  const uniformaTutto = async () => {
    if (!(await confirmDialog("Uniformare le grafie?", `${grafie.length} soggetti sono scritti in modi diversi nei record (es. maiuscole/minuscole). Tutti i record verranno riscritti con il nome ufficiale.`, "Uniforma"))) return;
    let tot = 0;
    for (const e of grafie) tot += await rinominaRecord(e.key, e.nome);
    toast.ok(`${tot} record uniformati`);
  };
  const esporta = () => download(`anagrafica_fornitori_clienti_${isoDay()}.csv`, csv([["Nome", "Tipo", "Controlli", "Controlli non conformi", "NC", "NC aperte", "Audit", "Altre grafie", "Note"],
    ...rows.map((e) => [e.nome, [...e.tipi].join(" / "), e.st.ctrl, e.st.ctrlNC, e.st.nc, e.st.ncAperte, e.st.audit, Object.keys(e.varianti).filter((v) => v !== e.nome).join(", "), e.note || ""])]), "text/csv");

  return html`<div>
    <${PageHeader} title="Fornitori & Clienti" subtitle=${`Anagrafica unica dei nominativi usati in controlli, NC e audit · ${all.length} soggetti`}>
      <button class="btn outline" onClick=${esporta}><${Icon} n="download" /> CSV</button>
      ${admin && html`<button class="btn primary" onClick=${() => setEd({ nome: "", tipo: "fornitore", note: "", key: "" })}><${Icon} n="plus" /> Nuovo soggetto</button>`}
    </${PageHeader}>
    <div class="ro-note"><${Icon} n="layers" s=${14} /> Come funziona: «Tecnosteel», «TECNOSTEEL» e «Tecnosteel S.r.l.» sono lo stesso soggetto. Quando compili un controllo, una NC o un audit il nome viene suggerito e uniformato da solo, così i report contano tutto insieme.</div>
    ${admin && (grafie.length > 0 || doppi.length > 0) && html`<${Card} title="Da sistemare" cls="card-warn">
      ${grafie.length > 0 && html`<div class="row-between"><span><b>${grafie.length}</b> soggetti sono scritti in più modi nei record (stesso soggetto, grafia diversa).</span>
        <button class="btn outline sm" onClick=${uniformaTutto}><${Icon} n="wand" s=${14} /> Uniforma tutte le grafie</button></div>`}
      ${doppi.length > 0 && html`<div class="dup-list"><span class="muted small">Possibili doppioni (nomi molto simili, controlla e unisci se sono lo stesso):</span>
        ${doppi.slice(0, 12).map(([a, b]) => html`<div class="dup"><b>${a.nome}</b> <span class="muted">≈</span> <b>${b.nome}</b>
          <button class="link-btn" onClick=${() => setEd({ ...a, unisci: b.key })}>unisci</button></div>`)}</div>`}
    </${Card}>`}
    <${Card}>
      <div class="filters">
        <div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca nome…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="inp" value=${tipo} onChange=${(e) => setTipo(e.target.value)}><option value="">Tutti i tipi</option>${TIPI_SOGGETTO.map((t) => html`<option value=${t.v}>${t.l}</option>`)}</select>
      </div>
      ${rows.length === 0 ? html`<${Empty} text="Nessun soggetto." icon="building" />` : html`<div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Nome ufficiale</th><th>Tipo</th><th class="r">Controlli</th><th class="r">Non conf.</th><th class="r">NC</th><th class="r">Aperte</th><th class="r">Audit</th><th class="r"></th></tr></thead>
        <tbody>${rows.map((e) => { const alt = Object.keys(e.varianti).filter((v) => v !== e.nome);
          return html`<tr key=${e.key}>
            <td><b>${e.nome}</b>${!e.id && html` <span class="tag" title="Ancora non salvato in anagrafica: verrà aggiunto al prossimo salvataggio o modificandolo">auto</span>`}
              ${alt.length > 0 && html`<br /><small class="muted">anche scritto: ${alt.join(", ")}</small>`}</td>
            <td class="small">${tipiLabel(e.tipi)}</td>
            <td class="r">${e.st.ctrl || ""}</td><td class=${"r" + (e.st.ctrlNC ? " t-red" : "")}>${e.st.ctrlNC || ""}</td>
            <td class="r"><b>${e.st.nc || ""}</b></td><td class=${"r" + (e.st.ncAperte ? " t-amber" : "")}>${e.st.ncAperte || ""}</td><td class="r">${e.st.audit || ""}</td>
            <td class="r nowrap">
              <a class="btn ghost icon sm" title="Vedi NC" href=${"#/registro-nc"} onClick=${() => sessionStorage.setItem("qc-q-nc", e.nome)}><${Icon} n="alert" s=${14} /></a>
              ${admin && html`<button class="btn ghost icon sm" title="Modifica / unisci" onClick=${() => setEd({ ...e, tipo: e.tipo || [...e.tipi][0] || "fornitore" })}><${Icon} n="pencil" s=${14} /></button>`}</td>
          </tr>`; })}</tbody></table></div>`}
    </${Card}>
    ${ed && html`<${SoggettoModal} e=${ed} all=${all} onClose=${() => setEd(null)} />`}
  </div>`;
}

function SoggettoModal({ e: init, all, onClose }) {
  const [e, setE] = useState({ nome: init.nome, tipo: init.tipo || "fornitore", note: init.note || "", unisci: init.unisci || "" });
  const [busy, setBusy] = useState("");
  const set = (k, v) => setE({ ...e, [k]: v });
  const target = e.unisci && all.find((x) => x.key === e.unisci);
  const salva = async () => {
    const nome = e.nome.trim().replace(/\s+/g, " ");
    if (!nome) return toast.err("Scrivi il nome");
    const nk = fornKey(nome);
    const clash = all.find((x) => x.key === nk && x.key !== init.key);
    if (clash && !(await confirmDialog("Esiste già", `«${clash.nome}» è già in anagrafica: i record di «${init.nome}» verranno uniti a quel soggetto.`, "Unisci"))) return;
    setBusy("Salvataggio…");
    try {
      const dest = clash || null;
      const finalName = dest ? dest.nome : nome;
      if (dest) { if (init.id) await remove("soggetti", init.id, init.nome); }
      else if (init.id) await update("soggetti", init.id, { nome, tipo: e.tipo, note: e.note }, nome);
      else await create("soggetti", { nome, tipo: e.tipo, note: e.note }, nome);
      if (init.key) { const n = await rinominaRecord(init.key, finalName, (k) => setBusy(`Aggiorno record… ${k}`)); if (n) toast.ok(`${n} record aggiornati con «${finalName}»`); }
      toast.ok("Anagrafica salvata"); onClose();
    } catch (x) { toast.err("Errore: " + (x.code || x.message)); }
    setBusy("");
  };
  const unisci = async () => {
    if (!target) return;
    if (!(await confirmDialog("Unire i due soggetti?", `Tutti i controlli, le NC e gli audit di «${init.nome}» passeranno a «${target.nome}». «${init.nome}» sparirà dall'anagrafica.`, "Unisci"))) return;
    setBusy("Unione in corso…");
    try {
      const n = await rinominaRecord(init.key, target.nome, (k) => setBusy(`Aggiorno record… ${k}`));
      if (init.id) await remove("soggetti", init.id, init.nome);
      if (!target.id) await create("soggetti", { nome: target.nome, tipo: target.tipo || [...target.tipi][0] || "fornitore" }, target.nome);
      toast.ok(`Uniti: ${n} record spostati su «${target.nome}»`); onClose();
    } catch (x) { toast.err("Errore: " + (x.code || x.message)); }
    setBusy("");
  };
  const del = async () => {
    if (!(await confirmDialog("Togliere dall'anagrafica?", `«${init.nome}» non comparirà più come soggetto salvato. I record esistenti non vengono toccati.`, "Togli"))) return;
    await remove("soggetti", init.id, init.nome); onClose();
  };
  return html`<${Modal} open title=${init.key ? "Soggetto: " + init.nome : "Nuovo soggetto"} onClose=${onClose}
    footer=${html`${init.id && html`<button class="btn ghost danger-t" onClick=${del}><${Icon} n="trash" /> Togli</button>`}<span class="grow"></span>
      ${busy && html`<span class="muted small">${busy}</span>`}
      <button class="btn outline" onClick=${onClose}>Chiudi</button><button class="btn primary" disabled=${!!busy} onClick=${salva}><${Icon} n="save" /> Salva</button>`}>
    <div class="form-grid">
      <${Field} label="Nome ufficiale" full hint=${init.key ? "Se lo cambi, viene aggiornato anche in tutti i controlli, NC e audit collegati." : ""}>
        <input class="inp" value=${e.nome} onInput=${(x) => set("nome", x.target.value)} /></${Field}>
      <${Field} label="Tipo"><${Select} value=${e.tipo} placeholder="—" options=${TIPI_SOGGETTO} onChange=${(v) => set("tipo", v)} /></${Field}>
      <${Field} label="Note" full><input class="inp" value=${e.note} placeholder="es. referente, P.IVA, sede…" onInput=${(x) => set("note", x.target.value)} /></${Field}>
      ${init.key && html`<div class="field full merge-box"><label>Unisci a un altro soggetto (se è un doppione scritto male)</label>
        <div class="inp-btn"><select class="inp" value=${e.unisci} onChange=${(x) => set("unisci", x.target.value)}><option value="">Scegli il soggetto giusto…</option>
          ${all.filter((x) => x.key !== init.key).sort((a, b) => a.nome.localeCompare(b.nome)).map((x) => html`<option value=${x.key} selected=${e.unisci === x.key}>${x.nome}</option>`)}</select>
          <button class="btn outline" disabled=${!target || !!busy} onClick=${unisci}><${Icon} n="layers" /> Unisci</button></div></div>`}
    </div></${Modal}>`;
}
