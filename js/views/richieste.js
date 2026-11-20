import { html, useState, useEffect, useRef, Icon, Badge, PageHeader, Card, Field, Select, Spinner, Empty, toast, confirmDialog, isoDay, fmtDate, fmtDT, norm, download, csv, go, toDate } from "../ui.js";
import { get, create, update, remove, isAdmin, audit, session } from "../store.js";
import { TIPI_RICHIESTA, STATI_RICHIESTA, RQ_CHIUSE, PRIORITA_RQ, DESTINATARI_RQ, REPARTI } from "../config.js";
import { Allegati, flushPending } from "../widgets.js";
import { GuestPanel, GuestRowActions } from "../guest.js";
import { NomeInput, registraNomi, indiceNomi, canonico } from "../nomi.js";
import { useCollections, suggestNumero, numeroDuplicato, Bars } from "./common.js";
import { pdfRichiesta } from "../pdf.js";
import { AziendaPicker, AziendaTag, AziendaTabs, aziendaOf, aziendaLabel, tabMemo, LOGO_SERVICE } from "../azienda.js";

const vuota = (az = "") => ({ azienda: az, numero: "", data: isoDay(), tipo: "", oggetto: "", descrizione: "", quantita: "", um: "pz",
  reparto: "", richiesto_da: "", destinatario: "Ufficio acquisti", fornitore: "", priorita: "normale", entro: "", riferimento: "",
  stato: "rq_inviata", storico: [], esito: "", data_esito: "", ordine: "", data_consegna: "", note: "" });
export const statoRq = (v) => STATI_RICHIESTA.find((x) => x.v === v) || STATI_RICHIESTA[0];
export const rqAperta = (r) => !RQ_CHIUSE.includes(r.stato || "rq_inviata");
export const giorniAperta = (r) => { const a = toDate(r.data); if (!a) return null; const b = rqAperta(r) ? new Date() : toDate(r.data_esito || r.data_consegna) || new Date(); return Math.max(0, Math.round((b - a) / 86400000)); };
const ritardo = (r) => rqAperta(r) && r.entro && r.entro < isoDay();

export function RichiestaForm({ id }) {
  const admin = isAdmin(), ro = !admin;
  const [r, setR] = useState(id ? null : vuota(/az=service/.test(location.hash) ? "service" : /az=power/.test(location.hash) ? "power" : ""));
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const [agg, setAgg] = useState({ data: isoDay(), nota: "", stato: "" });
  const dirty = useRef(false);
  const [d] = useCollections(["richieste"]);
  useEffect(() => {
    if (!id) return;
    get("richieste", id).then((x) => {
      if (!x) { toast.err("Richiesta non trovata"); return go("/registro-richieste"); }
      setR({ ...vuota(), ...x });
      if (!admin) audit("view", "richieste", id, x.numero);
    }).catch((e) => toast.err("Errore di lettura: " + e.code));
  }, [id]);
  useEffect(() => {
    if (id || !r || !r.azienda || r.numero || !d) return;
    setR((x) => ({ ...x, numero: suggestNumero(d.richieste.filter((y) => aziendaOf(y) === x.azienda), "numero") }));
  }, [r && r.azienda, d]);
  useEffect(() => {
    const f = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", f); return () => removeEventListener("beforeunload", f);
  }, []);
  if (!r) return html`<${Spinner} />`;
  const set = (k, v) => { dirty.current = true; setR((x) => ({ ...x, [k]: v })); };
  const az = aziendaOf(r);
  const dup = d ? numeroDuplicato(d.richieste.filter((y) => aziendaOf(y) === az), r.numero, id, "numero") : false;

  if (!id && !r.azienda) return html`<div>
    <a class="back" href="#/registro-richieste"><${Icon} n="back" s=${14} /> Registro Richieste</a>
    <${PageHeader} title="Nuova Richiesta" subtitle="Scegli prima l'azienda" />
    <${Card} title="La richiesta è per MACE POWER o MACE SERVICE? *">
      <p class="muted small">I due registri richieste sono separati (schede Power / Service).</p>
      <${AziendaPicker} value="" onChange=${(v) => set("azienda", v)} />
    </${Card}></div>`;

  const corpo = async (x) => {
    const idx = await indiceNomi().catch(() => new Map());
    const b = { ...x, azienda: az, fornitore: canonico(idx, x.fornitore) };
    if (!RQ_CHIUSE.includes(b.stato)) b.data_esito = b.data_esito || "";
    else if (!b.data_esito) b.data_esito = isoDay();
    if (b.stato === "rq_evasa" && !b.data_consegna) b.data_consegna = b.data_esito;
    return b;
  };
  const salva = async () => {
    if (!r.numero.trim()) return toast.err("Inserisci il numero");
    if (!r.oggetto.trim()) return toast.err("Scrivi cosa hai richiesto (oggetto)");
    if (dup && !(await confirmDialog("Numero già usato", `Esiste già una richiesta ${aziendaLabel(az)} con numero ${r.numero}. Salvare comunque?`, "Salva comunque"))) return;
    setBusy(true);
    try {
      const body = await corpo(r);
      if (body.fornitore) await registraNomi([[body.fornitore, "fornitore"]]);
      const label = `Richiesta ${body.numero} · ${body.oggetto}`;
      if (id) { await update("richieste", id, body, label); setR(body); dirty.current = false; toast.ok("Richiesta aggiornata"); }
      else {
        const x = await create("richieste", body, label);
        await flushPending("richieste", x.id, pending); setPending([]);
        dirty.current = false; toast.ok("Richiesta registrata"); go("/richiesta/" + x.id); return;
      }
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  // Aggiornamento: aggiunge una riga allo storico e (se scelto) cambia lo stato
  const aggiungi = async () => {
    if (!agg.nota.trim() && !agg.stato) return toast.err("Scrivi la nota o scegli il nuovo stato");
    const riga = { data: agg.data || isoDay(), nota: agg.nota.trim(), stato: agg.stato || "", autore: (session.user && session.user.email) || "", ts: new Date().toISOString() };
    const nuovo = { ...r, storico: [...(r.storico || []), riga], stato: agg.stato || r.stato };
    if (agg.stato && RQ_CHIUSE.includes(agg.stato) && !nuovo.data_esito) nuovo.data_esito = riga.data;
    if (agg.stato === "rq_evasa" && !nuovo.data_consegna) nuovo.data_consegna = riga.data;
    if (!id) { setR(nuovo); dirty.current = true; setAgg({ data: isoDay(), nota: "", stato: "" }); return; }
    try {
      await update("richieste", id, { storico: nuovo.storico, stato: nuovo.stato, data_esito: nuovo.data_esito, data_consegna: nuovo.data_consegna }, `Richiesta ${r.numero} (aggiornamento)`);
      setR(nuovo); setAgg({ data: isoDay(), nota: "", stato: "" }); toast.ok("Aggiornamento registrato");
    } catch (e) { toast.err("Errore: " + (e.code || e.message)); }
  };
  const togliAgg = async (i) => {
    if (!(await confirmDialog("Togliere l'aggiornamento?", "La riga sparisce dallo storico (lo stato attuale non cambia)."))) return;
    const s = r.storico.filter((_, j) => j !== i);
    if (id) await update("richieste", id, { storico: s }, `Richiesta ${r.numero} (storico)`);
    setR({ ...r, storico: s });
  };
  const elimina = async () => {
    if (!(await confirmDialog("Eliminare la richiesta?", `Richiesta ${r.numero}: verranno eliminati anche gli allegati.`))) return;
    await remove("richieste", id, r.numero); dirty.current = false; toast.ok("Richiesta eliminata"); go("/registro-richieste");
  };
  const inp = (k, ph = "") => html`<input class="inp" placeholder=${ph} value=${r[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)} />`;
  const area = (k, ph = "", rows = 3) => html`<textarea class="inp" rows=${rows} placeholder=${ph} value=${r[k]} disabled=${ro} onInput=${(e) => set(k, e.target.value)}></textarea>`;
  const sel = (k, opts, ph = "Seleziona…") => html`<${Select} value=${r[k]} placeholder=${ph} disabled=${ro} options=${opts.map((o) => (typeof o === "string" ? { v: o, l: o } : o))} onChange=${(v) => set(k, v)} />`;
  const gg = giorniAperta(r);

  return html`<div>
    <a class="back" href="#/registro-richieste"><${Icon} n="back" s=${14} /> Registro Richieste</a>
    <${PageHeader} title=${id ? "Richiesta " + r.numero : "Nuova Richiesta"} subtitle=${[r.oggetto, r.data && fmtDate(r.data), id && gg !== null && (rqAperta(r) ? `aperta da ${gg} gg` : `chiusa in ${gg} gg`)].filter(Boolean).join(" · ") || "Richiesta di acquisto, DPI, manutenzione, servizio…"}>
      <${AziendaTag} v=${az} /> ${r.priorita && r.priorita !== "normale" && html`<${Badge} v=${r.priorita} />`} <${Badge} v=${r.stato} />
      ${ritardo(r) && html`<${Badge} v="scaduta" />`}
      ${id && html`<button class="btn outline" onClick=${() => pdfRichiesta({ ...r, id })}><${Icon} n="download" /> PDF</button>`}
      ${admin && id && html`<button class="btn ghost danger-t" title="Elimina" onClick=${elimina}><${Icon} n="trash" /></button>`}
      ${admin && html`<button class="btn primary" disabled=${busy} onClick=${salva}>${busy ? html`<span class="spin sm"></span>` : html`<${Icon} n="save" />`} Salva</button>`}
    </${PageHeader}>
    ${az === "service" && html`<div class="az-banner"><img src=${LOGO_SERVICE} alt="Mace Service" /><span>Richiesta per <b>MACE SERVICE</b> · registro Service</span></div>`}
    ${ro && html`<div class="ro-note"><${Icon} n="lock" s=${14} /> Modalità sola consultazione (Ospite). Modifiche disabilitate.</div>`}
    ${ro && html`<${GuestPanel} entity="richieste" id=${id} label=${`Richiesta ${r.numero} · ${r.oggetto}`} />`}

    <${Card} title="1 · La richiesta">
      <div class="form-grid">
        <${Field} label="Azienda *"><div class="az-inline"><${AziendaTag} v=${az} />${!ro && html` <button class="link-btn" onClick=${() => { set("azienda", az === "service" ? "power" : "service"); if (!id) set("numero", ""); }}>
          cambia in ${az === "service" ? "MACE POWER" : "MACE SERVICE"}</button>`}</div></${Field}>
        <${Field} label="Numero *" hint=${dup ? html`<span class="warn">⚠ Numero già usato</span>` : `Registro ${aziendaLabel(az)} · formato NN/AA`}>${inp("numero")}</${Field}>
        <${Field} label="Data richiesta *"><input type="date" class="inp" value=${r.data} disabled=${ro} onInput=${(e) => set("data", e.target.value)} /></${Field}>
        <${Field} label="Tipo di richiesta"><input class="inp" list="dl-trq" value=${r.tipo} disabled=${ro} onInput=${(e) => set("tipo", e.target.value)} />
          <datalist id="dl-trq">${TIPI_RICHIESTA.map((t) => html`<option value=${t} />`)}</datalist></${Field}>
        <${Field} label="Oggetto *" full>${inp("oggetto", "es. Funi metalliche per sollevamento Ø 16 mm con redance e capicorda")}</${Field}>
        <${Field} label="Descrizione / specifiche" full>${area("descrizione", "Caratteristiche, portata, lunghezza, norma, marca preferita, motivo della richiesta…")}</${Field}>
        <${Field} label="Quantità"><div class="inp-btn">${inp("quantita", "es. 4")}<input class="inp um" list="dl-um" value=${r.um} disabled=${ro} onInput=${(e) => set("um", e.target.value)} />
          <datalist id="dl-um">${["pz", "m", "kg", "l", "conf.", "paia", "set", "ore"].map((u) => html`<option value=${u} />`)}</datalist></div></${Field}>
        <${Field} label="Priorità">${sel("priorita", PRIORITA_RQ, "—")}</${Field}>
        <${Field} label="Serve entro il" hint=${ritardo(r) ? html`<span class="warn">⚠ Data superata e richiesta ancora aperta</span>` : "Compare nel calendario"}>
          <input type="date" class="inp" value=${r.entro} disabled=${ro} onInput=${(e) => set("entro", e.target.value)} /></${Field}>
        <${Field} label="Reparto richiedente"><input class="inp" list="dl-rep2" value=${r.reparto} disabled=${ro} onInput=${(e) => set("reparto", e.target.value)} />
          <datalist id="dl-rep2">${REPARTI.map((x) => html`<option value=${x} />`)}</datalist></${Field}>
        <${Field} label="Richiesto da">${inp("richiesto_da", "Nome e cognome")}</${Field}>
        <${Field} label="Inviata a"><input class="inp" list="dl-dst" value=${r.destinatario} disabled=${ro} onInput=${(e) => set("destinatario", e.target.value)} />
          <datalist id="dl-dst">${DESTINATARI_RQ.map((x) => html`<option value=${x} />`)}</datalist></${Field}>
        <${Field} label="Fornitore proposto / scelto"><${NomeInput} tipo="fornitore" value=${r.fornitore} disabled=${ro} onChange=${(v) => set("fornitore", v)} placeholder="Facoltativo" /></${Field}>
        <${Field} label="Collegata a (NC, near miss, commessa…)">${inp("riferimento", "es. Near miss 01/26, NC 12/26")}</${Field}>
      </div>
    </${Card}>

    <${Card} title="2 · Preventivi, offerte e documenti">
      <${Allegati} parentType="richieste" parentId=${id} disabled=${ro} pending=${pending} onPending=${setPending}
        label="Preventivi, offerte, schede tecniche, foto" btn="Allega file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" />
    </${Card}>

    <${Card} title="3 · Stato e aggiornamenti" right=${html`<${Badge} v=${r.stato} />`}>
      <div class="rq-steps">${STATI_RICHIESTA.filter((s) => !["rq_rifiutata", "rq_annullata"].includes(s.v) || r.stato === s.v).map((s, i, arr) => {
        const cur = arr.findIndex((x) => x.v === r.stato);
        return html`<button type="button" disabled=${ro} class=${"rq-step" + (i < cur ? " done" : "") + (i === cur ? " on c-" + s.c : "")} onClick=${() => set("stato", s.v)}><b>${i + 1}</b>${s.l}</button>`; })}
        ${!ro && !RQ_CHIUSE.slice(1).includes(r.stato) && html`<span class="rq-alt"><button class="link-btn" onClick=${() => set("stato", "rq_rifiutata")}>rifiutata</button> · <button class="link-btn" onClick=${() => set("stato", "rq_annullata")}>annullata</button></span>`}
      </div>
      ${(r.storico || []).length === 0 ? html`<p class="muted small">Nessun aggiornamento. Aggiungi qui sotto solleciti, risposte, preventivi ricevuti, date di consegna…</p>`
        : html`<div class="timeline">${r.storico.map((s, i) => html`<div class="tl-it" key=${i}>
          <span class="tl-d mono">${fmtDate(s.data)}</span>
          <div class="grow">${s.stato && html`<${Badge} v=${s.stato} /> `}${s.nota}<small class="muted"> · ${(s.autore || "").split("@")[0]}</small></div>
          ${!ro && html`<button class="btn ghost icon sm" title="Togli" onClick=${() => togliAgg(i)}><${Icon} n="trash" s=${13} /></button>`}</div>`)}</div>`}
      ${!ro && html`<div class="agg-row">
        <input type="date" class="inp" value=${agg.data} onInput=${(e) => setAgg({ ...agg, data: e.target.value })} />
        <input class="inp grow" placeholder="Aggiornamento: es. sollecitato l'ufficio acquisti, arrivato preventivo da…, consegna prevista il…" value=${agg.nota} onInput=${(e) => setAgg({ ...agg, nota: e.target.value })} onKeyDown=${(e) => e.key === "Enter" && aggiungi()} />
        <select class="inp w-auto" value=${agg.stato} onChange=${(e) => setAgg({ ...agg, stato: e.target.value })}><option value="">Stato invariato</option>${STATI_RICHIESTA.map((s) => html`<option value=${s.v}>→ ${s.l}</option>`)}</select>
        <button class="btn outline" onClick=${aggiungi}><${Icon} n="plus" /> Aggiungi</button></div>`}
    </${Card}>

    <${Card} title="4 · Esito">
      <div class="form-grid">
        <${Field} label="N° ordine / riferimento acquisto">${inp("ordine", "es. ODA 2026/154")}</${Field}>
        <${Field} label="Data esito / decisione"><input type="date" class="inp" value=${r.data_esito} disabled=${ro} onInput=${(e) => set("data_esito", e.target.value)} /></${Field}>
        <${Field} label="Data consegna"><input type="date" class="inp" value=${r.data_consegna} disabled=${ro} onInput=${(e) => set("data_consegna", e.target.value)} /></${Field}>
        <${Field} label=" "><span></span></${Field}>
        <${Field} label="Esito / risposta" full>${area("esito", "es. Approvata dalla direzione, ordinate 4 funi a Tecnosteel, consegnate e controllate in accettazione", 3)}</${Field}>
        <${Field} label="Note" full>${area("note", "", 2)}</${Field}>
      </div>
    </${Card}>
    ${id && html`<p class="meta muted small">Registrata ${fmtDT(r.created_at)} da ${r.created_by || "—"}${r.updated_by ? ` · Ultima modifica ${fmtDT(r.updated_at)} da ${r.updated_by}` : ""}</p>`}
  </div>`;
}

const memo = tabMemo("qc-tab-rq");
export function RegistroRichieste() {
  const [d] = useCollections(["richieste"]);
  const [az, setAzS] = useState(memo.get());
  const [q, setQ] = useState("");
  const [stato, setStato] = useState("");
  const [tipo, setTipo] = useState("");
  const [prio, setPrio] = useState("");
  const [anno, setAnno] = useState("");
  const admin = isAdmin();
  if (!d) return html`<${Spinner} />`;
  const ALL = d.richieste;
  const setAz = (v) => { memo.set(v); setAzS(v); };
  const A = ALL.filter((x) => aziendaOf(x) === az);
  const counts = { power: ALL.filter((x) => aziendaOf(x) === "power").length, service: ALL.filter((x) => aziendaOf(x) === "service").length };
  const anni = [...new Set(A.map((x) => (x.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const tipi = [...new Set(A.map((x) => x.tipo).filter(Boolean))].sort();
  const nq = norm(q);
  const okStato = (x) => !stato || (stato === "_aperte" ? rqAperta(x) : stato === "_ritardo" ? ritardo(x) : (x.stato || "rq_inviata") === stato);
  const rows = A.filter((x) => okStato(x) && (!tipo || x.tipo === tipo) && (!prio || x.priorita === prio) && (!anno || (x.data || "").startsWith(anno))
    && (!nq || norm([x.numero, x.oggetto, x.descrizione, x.tipo, x.fornitore, x.richiesto_da, x.reparto, x.ordine, x.esito, x.riferimento].join(" ")).includes(nq)))
    .sort((a, b) => (rqAperta(b) ? 1 : 0) - (rqAperta(a) ? 1 : 0) || (b.data || "").localeCompare(a.data || "") || (b.numero || "").localeCompare(a.numero || ""));
  const del = async (x) => {
    if (!(await confirmDialog("Eliminare la richiesta?", `${x.numero} · ${x.oggetto}`))) return;
    try { await remove("richieste", x.id, x.numero); toast.ok("Richiesta eliminata"); } catch (e) { toast.err("Eliminazione non riuscita"); }
  };
  const esporta = () => download(`registro_richieste_${az}_${isoDay()}.csv`, csv([
    ["Azienda", "Numero", "Data", "Tipo", "Oggetto", "Descrizione", "Quantità", "Priorità", "Serve entro", "Reparto", "Richiesto da", "Inviata a", "Fornitore", "Collegata a", "Stato", "Giorni", "N° ordine", "Data esito", "Data consegna", "Esito", "Aggiornamenti"],
    ...rows.map((x) => [aziendaLabel(aziendaOf(x)), x.numero, x.data, x.tipo, x.oggetto, x.descrizione, `${x.quantita || ""} ${x.quantita ? x.um || "" : ""}`.trim(), x.priorita, x.entro, x.reparto,
      x.richiesto_da, x.destinatario, x.fornitore, x.riferimento, statoRq(x.stato).l, giorniAperta(x), x.ordine, x.data_esito, x.data_consegna, x.esito,
      (x.storico || []).map((s) => `${s.data}: ${s.nota}${s.stato ? " [" + statoRq(s.stato).l + "]" : ""}`).join(" | ")])]), "text/csv");
  const k = (key, label, val, cls, sub) => html`<button class=${"kpi kpi-btn " + cls + (stato === key ? " sel" : "")} onClick=${() => setStato(stato === key ? "" : key)}>
    <div><span class="lbl">${label}</span><b>${val}</b>${sub && html`<small>${sub}</small>`}</div></button>`;
  const chiuse = A.filter((x) => x.stato === "rq_evasa");
  const tMedio = chiuse.length ? Math.round(chiuse.reduce((s, x) => s + (giorniAperta(x) || 0), 0) / chiuse.length) : null;
  const perStato = STATI_RICHIESTA.map((s) => ({ l: s.l, v: rows.filter((x) => (x.stato || "rq_inviata") === s.v).length, c: `var(--${s.c})` })).filter((x) => x.v);

  return html`<div>
    <${PageHeader} title=${az === "service" ? "Richieste effettuate · Mace Service" : "Richieste effettuate"} subtitle=${`Acquisti, DPI, manutenzioni e servizi richiesti ${aziendaLabel(az)} · ${rows.length} di ${A.length}`}>
      ${admin && html`<button class="btn outline" onClick=${esporta}><${Icon} n="download" /> Excel/CSV</button>
        <a class="btn primary" href=${"#/richiesta?az=" + az}><${Icon} n="plus" /> Nuova richiesta ${az === "service" ? "Service" : ""}</a>`}
    </${PageHeader}>
    <${AziendaTabs} value=${az} onChange=${setAz} counts=${counts} />
    <div class="kpis">
      ${k("_aperte", "In corso", A.filter(rqAperta).length, "k-blue", `${A.filter((x) => rqAperta(x) && x.priorita === "urgente").length} urgenti`)}
      ${k("_ritardo", "In ritardo", A.filter(ritardo).length, "k-red", "data «serve entro» superata")}
      ${k("rq_evasa", "Evase", chiuse.length, "k-green", tMedio === null ? "" : `in media in ${tMedio} gg`)}
      ${k("rq_rifiutata", "Rifiutate", A.filter((x) => x.stato === "rq_rifiutata").length, "k-zinc", `${A.filter((x) => x.stato === "rq_annullata").length} annullate`)}
    </div>
    <${Card}>
      <div class="filters">
        <div class="search"><${Icon} n="search" /><input class="inp" placeholder="Cerca oggetto, fornitore, richiedente, n° ordine…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="inp" value=${stato} onChange=${(e) => setStato(e.target.value)}><option value="">Tutti gli stati</option><option value="_aperte">Solo in corso</option><option value="_ritardo">In ritardo</option>${STATI_RICHIESTA.map((s) => html`<option value=${s.v}>${s.l}</option>`)}</select>
        <select class="inp" value=${tipo} onChange=${(e) => setTipo(e.target.value)}><option value="">Tutti i tipi</option>${tipi.map((t) => html`<option>${t}</option>`)}</select>
        <select class="inp" value=${prio} onChange=${(e) => setPrio(e.target.value)}><option value="">Ogni priorità</option>${PRIORITA_RQ.map((p) => html`<option value=${p.v}>${p.l}</option>`)}</select>
        <select class="inp" value=${anno} onChange=${(e) => setAnno(e.target.value)}><option value="">Tutti gli anni</option>${anni.map((y) => html`<option>${y}</option>`)}</select>
      </div>
      ${rows.length === 0 ? html`<${Empty} text=${A.length ? "Nessuna richiesta trovata." : "Nessuna richiesta registrata. Premi «Nuova richiesta»."} icon="cart" />` : html`<div class="tbl-wrap"><table class="tbl hover">
        <thead><tr><th>Numero</th><th>Data</th><th>Oggetto</th><th>Richiesto da / fornitore</th><th>Entro</th><th>Stato</th><th>Ultimo aggiornamento</th><th class="r"></th></tr></thead>
        <tbody>${rows.map((x) => { const last = (x.storico || [])[x.storico ? x.storico.length - 1 : 0]; const gg = giorniAperta(x);
          return html`<tr key=${x.id} onClick=${() => go("/richiesta/" + x.id)} class=${rqAperta(x) ? "" : "row-dim"}>
          <td class="mono"><b>${x.numero || "—"}</b></td>
          <td class="mono nowrap">${fmtDate(x.data)}${gg !== null ? html`<br /><span class="muted">${rqAperta(x) ? `da ${gg} gg` : `${gg} gg`}</span>` : ""}</td>
          <td class="ell"><b>${x.oggetto || "—"}</b>${x.priorita === "urgente" || x.priorita === "alta" ? html` <${Badge} v=${x.priorita} />` : ""}<br /><small class="muted">${[x.tipo, x.quantita && `${x.quantita} ${x.um || ""}`].filter(Boolean).join(" · ")}</small></td>
          <td class="small">${x.richiesto_da || "—"}${x.fornitore ? html`<br /><span class="muted">${x.fornitore}</span>` : ""}</td>
          <td class=${"mono nowrap" + (ritardo(x) ? " t-red" : "")}>${x.entro ? fmtDate(x.entro) : html`<span class="muted">—</span>`}</td>
          <td><${Badge} v=${x.stato || "rq_inviata"} /></td>
          <td class="small ell">${last ? html`<span class="mono muted">${fmtDate(last.data)}</span> ${last.nota || statoRq(last.stato).l}` : html`<span class="muted">—</span>`}</td>
          <td class="r nowrap" onClick=${(e) => e.stopPropagation()}>
            <button class="btn ghost icon" title="PDF" onClick=${() => pdfRichiesta(x)}><${Icon} n="download" /></button>
            ${admin ? html`<button class="btn ghost icon danger-t" title="Elimina" onClick=${() => del(x)}><${Icon} n="trash" /></button>`
              : html`<${GuestRowActions} entity="richieste" id=${x.id} label=${`Richiesta ${x.numero} · ${x.oggetto}`} />`}
          </td></tr>`; })}</tbody></table></div>`}
    </${Card}>
    ${perStato.length > 0 && html`<${Card} title="Richieste per stato"><${Bars} data=${perStato} /></${Card}>`}
  </div>`;
}
