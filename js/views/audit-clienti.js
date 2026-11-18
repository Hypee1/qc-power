import { html, useState, useEffect, useRef, Icon, Badge, PageHeader, Card, Field, Spinner, Empty, toast, confirmDialog, isoDay, fmtDate, fmtDT, norm, download, csv, go, fornKey } from "../ui.js";
import { get, create, update, remove, isAdmin, audit, list } from "../store.js";
import { ESITI_AUDIT, TIPI_AUDIT } from "../config.js";
import { Allegati, flushPending } from "../widgets.js";
import { GuestPanel, GuestRowActions } from "../guest.js";
import { NomeInput, registraNomi, indiceNomi, canonico } from "../nomi.js";
import { useCollections } from "./common.js";
import { AziendaPicker, AziendaTag, AziendaTabs, aziendaOf, aziendaLabel, tabMemo, LOGO_SERVICE } from "../azienda.js";

const vuoto = (az = "") => ({ azienda: az, tipo: "", cliente: "", cliente_finale: "", oggetto: "", data_inizio: isoDay(), data_fine: "",
  esito: "", rilievi: "", auditor: "", note: "" });
const esitoOf = (v) => ESITI_AUDIT.find((x) => x.v === v);
const durata = (a) => { if (!a.data_inizio) return ""; const g = a.data_fine ? Math.round((new Date(a.data_fine) - new Date(a.data_inizio)) / 86400000) + 1 : 1; return g > 1 ? g + " giorni" : "1 giorno"; };

export function EsitoPicker({ value, onChange, disabled }) {
  return html`<div class="esiti">${ESITI_AUDIT.map((e) => html`<button type="button" key=${e.v} disabled=${disabled}
    class=${"esito e-" + e.c + (value === e.v ? " on" : "")} onClick=${() => onChange(value === e.v ? "" : e.v)}>
    <${Icon} n=${e.v === "positivo" ? "checkCircle" : e.v === "negativo" ? "xCircle" : "alert"} s=${15} />${e.l}</button>`)}</div>`;
}

export function AuditClienteForm({ id }) {
  const admin = isAdmin(), ro = !admin;
  const [a, setA] = useState(id ? null : vuoto(/az=service/.test(location.hash) ? "service" : /az=power/.test(location.hash) ? "power" : ""));
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const dirty = useRef(false);
  useEffect(() => {
    if (!id) return;
    get("audit_clienti", id).then((r) => {
      if (!r) { toast.err("Audit non trovato"); return go("/registro-audit"); }
      setA({ ...vuoto(), ...r });
      if (!admin) audit("view", "audit_clienti", id, r.cliente);
    }).catch((e) => toast.err("Errore di lettura: " + e.code));
  }, [id]);
  useEffect(() => {
    const f = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", f); return () => removeEventListener("beforeunload", f);
  }, []);
  if (!a) return html`<${Spinner} />`;
  const set = (k, v) => { dirty.current = true; setA((x) => ({ ...x, [k]: v })); };
  const az = aziendaOf(a);

  if (!id && !a.azienda) return html`<div>
    <a class="back" href="#/registro-audit"><${Icon} n="back" s=${14} /> Registro Audit</a>
    <${PageHeader} title="Nuovo Audit" subtitle="Scegli prima l'azienda" />
    <${Card} title="L'audit è stato fatto a MACE POWER o a MACE SERVICE? *">
      <p class="muted small">I due registri audit sono separati (schede Power / Service).</p>
      <${AziendaPicker} value="" onChange=${(v) => set("azienda", v)} />
    </${Card}></div>`;

  const salva = async () => {
    if (!a.cliente.trim()) return toast.err("Indica il cliente che ha fatto l'audit");
    if (!a.data_inizio) return toast.err("Inserisci la data di inizio");
    if (a.data_fine && a.data_fine < a.data_inizio) return toast.err("La data di fine è prima dell'inizio");
    const idx = await indiceNomi().catch(() => new Map());
    const body = { ...a, azienda: az, cliente: canonico(idx, a.cliente), cliente_finale: canonico(idx, a.cliente_finale) };
    setBusy(true);
    try {
      await registraNomi([[body.cliente, "cliente"], [body.cliente_finale, "cliente"]]);
      const label = `Audit ${body.cliente} ${body.data_inizio}`;
      if (id) { await update("audit_clienti", id, body, label); setA(body); toast.ok("Audit aggiornato"); dirty.current = false; }
      else {
        const r = await create("audit_clienti", body, label);
        await flushPending("audit_clienti", r.id, pending); setPending([]);
        dirty.current = false; toast.ok("Audit registrato"); go("/audit-cliente/" + r.id); return;
      }
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  const elimina = async () => {
    if (!(await confirmDialog("Eliminare l'audit?", `Audit ${a.cliente} del ${fmtDate(a.data_inizio)}: verranno eliminati anche i report allegati.`))) return;
    await remove("audit_clienti", id, a.cliente); dirty.current = false; toast.ok("Audit eliminato"); go("/registro-audit");
  };
  const inp = (k, ph = "") => html`<input class="inp" placeholder=${ph} value=${a[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)} />`;
  const date = (k) => html`<input type="date" class="inp" value=${a[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)} />`;

  return html`<div>
    <a class="back" href="#/registro-audit"><${Icon} n="back" s=${14} /> Registro Audit</a>
    <${PageHeader} title=${id ? "Audit cliente" : "Nuovo Audit"} subtitle=${[a.cliente, a.data_inizio && fmtDate(a.data_inizio)].filter(Boolean).join(" · ") || "Audit, verifiche e test svolti dai clienti"}>
      <${AziendaTag} v=${az} /> ${a.esito && html`<${Badge} v=${a.esito} />`}
      ${admin && id && html`<button class="btn ghost danger-t" title="Elimina" onClick=${elimina}><${Icon} n="trash" /></button>`}
      ${admin && html`<button class="btn primary" disabled=${busy} onClick=${salva}>${busy ? html`<span class="spin sm"></span>` : html`<${Icon} n="save" />`} Salva</button>`}
    </${PageHeader}>
    ${az === "service" && html`<div class="az-banner"><img src=${LOGO_SERVICE} alt="Mace Service" /><span>Audit registrato per <b>MACE SERVICE</b> · registro audit Service</span></div>`}
    ${ro && html`<div class="ro-note"><${Icon} n="lock" s=${14} /> Modalità sola consultazione (Ospite). Modifiche disabilitate.</div>`}
    ${ro && html`<${GuestPanel} entity="audit_clienti" id=${id} label=${`Audit ${a.cliente} · ${fmtDate(a.data_inizio)}`} />`}

    <${Card} title="Report dell'audit">
      <${Allegati} parentType="audit_clienti" parentId=${id} disabled=${ro} pending=${pending} onPending=${setPending}
        label="Report PDF dell'audit (e altri documenti)" btn="Carica report PDF" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" />
      <p class="muted small">PDF fino a 8 MB (i file grandi vengono salvati a pezzi e ricomposti quando li apri).</p>
    </${Card}>

    <${Card} title="Dati dell'audit">
      <div class="form-grid">
        <${Field} label="Azienda *"><div class="az-inline"><${AziendaTag} v=${az} />${!ro && html` <button class="link-btn" onClick=${() => set("azienda", az === "service" ? "power" : "service")}>
          cambia in ${az === "service" ? "MACE POWER" : "MACE SERVICE"}</button>`}</div></${Field}>
        <${Field} label="Tipo di audit / test"><input class="inp" list="dl-taudit" value=${a.tipo} disabled=${ro} onInput=${(e) => set("tipo", e.target.value)} />
          <datalist id="dl-taudit">${TIPI_AUDIT.map((t) => html`<option value=${t} />`)}</datalist></${Field}>
        <${Field} label="Cliente che ha fatto l'audit / test *"><${NomeInput} tipo="cliente" value=${a.cliente} disabled=${ro} onChange=${(v) => set("cliente", v)} placeholder="es. Enel, Terna…" /></${Field}>
        <${Field} label="Cliente finale (se c'è)"><${NomeInput} tipo="cliente" value=${a.cliente_finale} disabled=${ro} onChange=${(v) => set("cliente_finale", v)} placeholder="Facoltativo" /></${Field}>
        <${Field} label="Data inizio *">${date("data_inizio")}</${Field}>
        <${Field} label="Data fine" hint=${durata(a)}>${date("data_fine")}</${Field}>
        <${Field} label="Oggetto / prodotto verificato">${inp("oggetto", "es. Trasformatore 1600 kVA matr. …, sistema qualità")}</${Field}>
        <${Field} label="Auditor / referenti cliente">${inp("auditor", "Facoltativo")}</${Field}>
        <${Field} label="Esito" full><${EsitoPicker} value=${a.esito} disabled=${ro} onChange=${(v) => set("esito", v)} /></${Field}>
        <${Field} label="N° rilievi / osservazioni" hint="Facoltativo: utile per il report di fine anno">
          <input class="inp" inputmode="numeric" value=${a.rilievi} disabled=${ro} onInput=${(e) => set("rilievi", e.target.value.replace(/[^\d]/g, ""))} /></${Field}>
        <${Field} label="Note" full><textarea class="inp" rows="4" value=${a.note} disabled=${ro} placeholder="Rilievi principali, azioni richieste, prossime verifiche…" onInput=${(e) => set("note", e.target.value)}></textarea></${Field}>
      </div>
    </${Card}>
    ${id && html`<p class="meta muted small">Registrato ${fmtDT(a.created_at)} da ${a.created_by || "—"}${a.updated_by ? ` · Ultima modifica ${fmtDT(a.updated_at)} da ${a.updated_by}` : ""}</p>`}
  </div>`;
}

const memo = tabMemo("qc-tab-audit");
export function RegistroAudit() {
  const [d] = useCollections(["audit_clienti"]);
  const [az, setAzS] = useState(memo.get());
  const [q, setQ] = useState("");
  const [esito, setEsito] = useState("");
  const [anno, setAnno] = useState("");
  const admin = isAdmin();
  if (!d) return html`<${Spinner} />`;
  const ALL = d.audit_clienti;
  const setAz = (v) => { memo.set(v); setAzS(v); };
  const A = ALL.filter((x) => aziendaOf(x) === az);
  const counts = { power: ALL.filter((x) => aziendaOf(x) === "power").length, service: ALL.filter((x) => aziendaOf(x) === "service").length };
  const anni = [...new Set(A.map((x) => (x.data_inizio || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const nq = norm(q);
  const rows = A.filter((x) => (!esito || x.esito === esito) && (!anno || (x.data_inizio || "").startsWith(anno))
    && (!nq || norm([x.cliente, x.cliente_finale, x.tipo, x.oggetto, x.auditor, x.note].join(" ")).includes(nq)))
    .sort((a, b) => (b.data_inizio || "").localeCompare(a.data_inizio || ""));
  const del = async (x) => {
    if (!(await confirmDialog("Eliminare l'audit?", `${x.cliente} · ${fmtDate(x.data_inizio)}`))) return;
    try { await remove("audit_clienti", x.id, x.cliente); toast.ok("Audit eliminato"); } catch (e) { toast.err("Eliminazione non riuscita"); }
  };
  const esporta = () => download(`registro_audit_${az}_${isoDay()}.csv`, csv([
    ["Azienda", "Data inizio", "Data fine", "Cliente", "Cliente finale", "Tipo", "Oggetto", "Auditor", "Esito", "Rilievi", "Note"],
    ...rows.map((x) => [aziendaLabel(aziendaOf(x)), x.data_inizio, x.data_fine, x.cliente, x.cliente_finale, x.tipo, x.oggetto, x.auditor, (esitoOf(x.esito) || {}).l || "", x.rilievi, x.note])]), "text/csv");
  const cnt = (v) => rows.filter((x) => x.esito === v).length;

  return html`<div>
    <${PageHeader} title=${az === "service" ? "Registro Audit · Mace Service" : "Registro Audit"} subtitle=${`Audit, verifiche e test dei clienti ${aziendaLabel(az)} · ${rows.length} di ${A.length}`}>
      ${admin && html`<button class="btn outline" onClick=${esporta}><${Icon} n="download" /> Excel/CSV</button>
        <a class="btn primary" href=${"#/audit-cliente?az=" + az}><${Icon} n="plus" /> Nuovo audit ${az === "service" ? "Service" : ""}</a>`}
    </${PageHeader}>
    <${AziendaTabs} value=${az} onChange=${setAz} counts=${counts} />
    <div class="kpis">${ESITI_AUDIT.map((e) => html`<button class=${"kpi kpi-btn k-" + e.c + (esito === e.v ? " sel" : "")} onClick=${() => setEsito(esito === e.v ? "" : e.v)}>
      <div><span class="lbl">${e.l}</span><b>${cnt(e.v)}</b></div></button>`)}</div>
    <${Card}>
      <div class="filters">
        <div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca cliente, cliente finale, tipo, note…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="inp" value=${esito} onChange=${(e) => setEsito(e.target.value)}><option value="">Tutti gli esiti</option>${ESITI_AUDIT.map((e) => html`<option value=${e.v}>${e.l}</option>`)}</select>
        <select class="inp" value=${anno} onChange=${(e) => setAnno(e.target.value)}><option value="">Tutti gli anni</option>${anni.map((y) => html`<option>${y}</option>`)}</select>
      </div>
      ${rows.length === 0 ? html`<${Empty} text=${A.length ? "Nessun audit trovato." : "Nessun audit registrato. Premi «Nuovo audit» e carica il report PDF."} icon="award" />` : html`<div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Date</th><th>Cliente</th><th>Cliente finale</th><th>Tipo</th><th>Esito</th><th class="r">Azioni</th></tr></thead>
        <tbody>${rows.map((x) => html`<tr key=${x.id} onClick=${() => go("/audit-cliente/" + x.id)}>
          <td class="mono nowrap">${fmtDate(x.data_inizio)}${x.data_fine && x.data_fine !== x.data_inizio ? html`<br /><span class="muted">→ ${fmtDate(x.data_fine)}</span>` : ""}</td>
          <td><b>${x.cliente || "—"}</b></td><td>${x.cliente_finale || html`<span class="muted">—</span>`}</td>
          <td class="ell">${x.tipo || html`<span class="muted">—</span>`}${x.oggetto ? html`<br /><small class="muted">${x.oggetto}</small>` : ""}</td>
          <td>${x.esito ? html`<${Badge} v=${x.esito} />` : html`<span class="muted small">da definire</span>`}</td>
          <td class="r nowrap" onClick=${(e) => e.stopPropagation()}>
            <a class="btn ghost icon" title="Apri" href=${"#/audit-cliente/" + x.id}><${Icon} n="eye" /></a>
            ${admin ? html`<button class="btn ghost icon danger-t" title="Elimina" onClick=${() => del(x)}><${Icon} n="trash" /></button>`
              : html`<${GuestRowActions} entity="audit_clienti" id=${x.id} label=${`Audit ${x.cliente} · ${fmtDate(x.data_inizio)}`} />`}
          </td></tr>`)}</tbody></table></div>`}
    </${Card}>
  </div>`;
}
