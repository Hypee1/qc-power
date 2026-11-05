import { html, useState, useEffect, useRef, Icon, Badge, PageHeader, Card, Field, Spinner, toast, confirmDialog, isoDay, fmtDT, go } from "../ui.js";
import { get, create, update, remove, isAdmin, audit, list } from "../store.js";
import { SignaturePad, Allegati, flushPending } from "../widgets.js";
import { GuestPanel } from "../guest.js";
import { pdfResistenze } from "../pdf.js";
import { calcVerifica, fmtOhm, fmtW, fmtA, fmtPct, TOLL_DEFAULT } from "../resistenze-calc.js";

// ============================================================
//  CONTROLLO RESISTENZE AVVOLGIMENTI FUORI CASSA
// ============================================================
const avv = (collegamento, unita) => ({ collegamento, materiale: "rame", unita, r1: "", r2: "", r3: "", temp: "", tensione: "", corrente: "" });
export const vuotoRes = () => ({
  codice_progetto: "", matricola: "", commessa: "", potenza_kva: "", data: isoDay(), eseguito_da: "", strumento: "", note: "",
  pri: avv("triangolo", "ohm"), sec: avv("stella", "mohm"),
  spec: { r_pri: "", r_sec: "", p_pri: "", p_sec: "" }, toll: { ...TOLL_DEFAULT },
  dim: { bt_int_x: "", bt_int_y: "", bt_est_x: "", bt_est_y: "", bt_radiale: "", at_radiale: "", at_diam_est: "", cond_larghezza: "", cond_spessore: "" },
  firma: null,
});
const U = { ohm: "Ω", mohm: "mΩ", uohm: "µΩ" };
const LETTURE = { triangolo: ["U-V", "V-W", "W-U"], stella: ["u-v", "v-w", "w-u"] };

export function ResistenzaForm({ id }) {
  const admin = isAdmin(), ro = !admin;
  const dupId = id ? null : (location.hash.match(/dup=([\w-]+)/) || [])[1];
  const draftKey = "res-draft-new";
  const [r, setR] = useState(id || dupId ? null : vuotoRes());
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const [progetti, setProgetti] = useState([]);
  const touched = useRef(false);

  useEffect(() => {
    list("resistenze").then((rows) => setProgetti([...new Set(rows.map((x) => x.codice_progetto).filter(Boolean))].sort())).catch(() => {});
    const src = id || dupId;
    if (src) {
      get("resistenze", src).then((x) => {
        if (!x) { toast.err("Misura non trovata"); return go("/resistenze"); }
        const base = { ...vuotoRes(), ...x, pri: { ...vuotoRes().pri, ...x.pri }, sec: { ...vuotoRes().sec, ...x.sec }, spec: { ...vuotoRes().spec, ...x.spec }, toll: { ...TOLL_DEFAULT, ...x.toll }, dim: { ...vuotoRes().dim, ...x.dim } };
        if (dupId) {
          // stesso progetto: tengo dati, specifica e dimensioni, svuoto le misure
          const clr = (w) => ({ ...w, r1: "", r2: "", r3: "", temp: "" });
          const { id: _i, created_at, created_by, updated_at, updated_by, risultati, ...rest } = base;
          setR({ ...rest, matricola: "", data: isoDay(), pri: clr(base.pri), sec: clr(base.sec), firma: null });
          toast.info("Duplicato: inserisci le nuove letture");
        } else { setR(base); if (!admin) audit("view", "resistenze", id, x.codice_progetto); }
      }).catch((e) => toast.err("Errore di lettura: " + e.code));
    } else if (admin) {
      try { const d = localStorage.getItem(draftKey); if (d) { setR({ ...vuotoRes(), ...JSON.parse(d) }); toast.info("Bozza ripristinata"); } } catch (e) { }
    }
  }, [id]);
  useEffect(() => {
    if (id || ro || !touched.current || !r) return;
    const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify(r)); } catch (e) { } }, 1000);
    return () => clearTimeout(t);
  }, [r]);
  useEffect(() => {
    const f = (e) => { if (touched.current) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", f); return () => removeEventListener("beforeunload", f);
  }, []);
  if (!r) return html`<${Spinner} />`;

  const set = (k, v) => { touched.current = true; setR((x) => ({ ...x, [k]: v })); };
  const setIn = (g, k, v) => { touched.current = true; setR((x) => ({ ...x, [g]: { ...x[g], [k]: v } })); };
  const V = calcVerifica(r);

  const salva = async () => {
    if (!r.codice_progetto.trim()) return toast.err("Inserisci il codice progetto");
    if (!r.potenza_kva) return toast.err("Inserisci la potenza nominale (kVA)");
    if (!r.data) return toast.err("Inserisci la data della misura");
    if (!V.P.r75 && !V.S.r75) return toast.err("Inserisci almeno una lettura con la temperatura");
    // salvo anche i risultati calcolati: il registro li mostra senza ricalcolare
    const body = { ...r, risultati: { pri_r75: V.P.r75, sec_r75: V.S.r75, pri_p: V.P.pTot, sec_p: V.S.pTot, p_tot: V.mTot, p_spec: V.sTot, pmax: V.pmax, esito: V.esito, squilibrio: V.squilibrioMax } };
    const label = `${body.codice_progetto}${body.matricola ? " · matr. " + body.matricola : ""}`;
    setBusy(true);
    try {
      if (id) { await update("resistenze", id, body, label); setR(body); toast.ok("Misura aggiornata"); }
      else {
        const x = await create("resistenze", body, label);
        await flushPending("resistenze", x.id, pending); setPending([]);
        try { localStorage.removeItem(draftKey); } catch (e) { }
        touched.current = false; toast.ok("Misura registrata"); go("/resistenza/" + x.id); return;
      }
      touched.current = false;
    } catch (e) { toast.err("Salvataggio non riuscito: " + (e.code || e.message)); }
    setBusy(false);
  };
  const elimina = async () => {
    if (!(await confirmDialog("Eliminare la misura?", `${r.codice_progetto}: operazione irreversibile.`))) return;
    await remove("resistenze", id, r.codice_progetto); touched.current = false; toast.ok("Misura eliminata"); go("/resistenze");
  };

  const txt = (val, on, ph = "", extra = {}) => html`<input class="inp" value=${val} placeholder=${ph} disabled=${ro} onInput=${(e) => on(e.target.value)} ...${extra} />`;
  const numIn = (val, on, ph = "", unit) => html`<div class=${"inp-u" + (unit ? "" : " nou")}><input class="inp" inputmode="decimal" value=${val} placeholder=${ph} disabled=${ro} onInput=${(e) => on(e.target.value)} />${unit && html`<span>${unit}</span>`}</div>`;
  const seg = (val, on, opts) => html`<div class="seg">${opts.map(([v, l]) => html`<button type="button" key=${v} disabled=${ro} class=${"seg-b" + (val === v ? " on" : "")} onClick=${() => on(v)}>${l}</button>`)}</div>`;

  const Winding = (g, titolo, sigla, c) => {
    const w = r[g], u = U[w.unita];
    const sq = c.squilibrio, sqHigh = sq !== null && sq > V.toll.squilibrio;
    return html`<section class=${"card wind wind-" + g}>
      <div class="card-h"><h3><span class="wind-tag">${sigla}</span> ${titolo}</h3>${c.r75 ? html`<span class="badge b-green">calcolato</span>` : html`<span class="muted small">in attesa di letture</span>`}</div>
      <div class="wind-opts">
        <div><label>Collegamento</label>${seg(w.collegamento, (v) => setIn(g, "collegamento", v), [["stella", "Stella / Yn"], ["triangolo", "Triangolo / D"]])}</div>
        <div><label>Conduttore</label>${seg(w.materiale, (v) => setIn(g, "materiale", v), [["rame", "Rame"], ["alluminio", "Alluminio"]])}</div>
        <div><label>Unità letture</label>${seg(w.unita, (v) => setIn(g, "unita", v), [["ohm", "Ω"], ["mohm", "mΩ"], ["uohm", "µΩ"]])}</div>
      </div>
      <div class="lbl-row"><label>Resistenza misurata tra i morsetti</label><small class="muted">1 lettura minimo · 3 per lo squilibrio</small></div>
      <div class="read-grid">${["r1", "r2", "r3"].map((k, i) => html`<div class="read"><small>${LETTURE[w.collegamento][i]}</small>${numIn(w[k], (v) => setIn(g, k, v), "—", u)}</div>`)}</div>
      <div class="form-grid two tight">
        <${Field} label="Temperatura avvolgimento">${numIn(w.temp, (v) => setIn(g, "temp", v), "es. 22,5", "°C")}</${Field}>
        <${Field} label="Tensione nominale">${numIn(w.tensione, (v) => setIn(g, "tensione", v), g === "pri" ? "es. 20000" : "es. 400", "V")}</${Field}>
        <${Field} label="Corrente nominale di linea" hint=${c.iAuto ? `Calcolata da potenza e tensione: ${fmtA(c.iLinea)}` : "Lascia vuoto per calcolarla da potenza e tensione"}>
          ${numIn(w.corrente, (v) => setIn(g, "corrente", v), c.iAuto ? c.iLinea.toFixed(2).replace(".", ",") : "auto", "A")}</${Field}>
      </div>
      <div class="res-box">
        <div><span>R media misurata</span><b>${fmtOhm(c.rMedia)}</b></div>
        <div class=${sqHigh ? "warn-row" : ""}><span>Squilibrio letture</span><b>${sq === null ? "—" : fmtPct(sq, false)}${sqHigh ? " ⚠" : ""}</b></div>
        <div class="hl"><span>R a 75 °C (tra morsetti)</span><b>${fmtOhm(c.r75)}</b></div>
        <div><span>R di fase a 75 °C</span><b>${fmtOhm(c.rFase75)}</b></div>
        <div><span>Corrente di fase</span><b>${fmtA(c.iFase)}</b></div>
        <div class="hl"><span>Perdite I²R a 75 °C (trifase)</span><b>${fmtW(c.pTot)}</b></div>
      </div>
    </section>`;
  };

  const specUnit = { r_pri: U[r.pri.unita], r_sec: U[r.sec.unita], p_pri: "W", p_sec: "W" };
  const fmtMis = (x) => (x.key.startsWith("r") ? fmtOhm(x.mis) : fmtW(x.mis));
  const fmtSpec = (x) => (x.key.startsWith("r") ? fmtOhm(x.spec) : fmtW(x.spec));
  const maxP = Math.max(1, ...V.righe.filter((x) => x.key.startsWith("p")).flatMap((x) => [x.spec || 0, x.mis || 0]));

  return html`<div>
    <a class="back" href="#/resistenze"><${Icon} n="back" s=${14} /> Registro resistenze</a>
    <${PageHeader} title=${id ? "Resistenze fuori cassa" : "Nuova misura resistenze"} subtitle=${[r.codice_progetto, r.matricola && "Matr. " + r.matricola, r.potenza_kva && r.potenza_kva + " kVA"].filter(Boolean).join(" · ") || "Controllo resistenze avvolgimenti fuori cassa"}>
      <${Badge} v=${V.esito} />
      ${id && html`<button class="btn outline" onClick=${() => pdfResistenze({ ...r, id })}><${Icon} n="download" /> PDF</button>`}
      ${admin && id && html`<a class="btn outline" href=${"#/resistenza?dup=" + id} title="Nuova misura con gli stessi dati progetto e specifica"><${Icon} n="layers" /> Duplica</a>`}
      ${admin && id && html`<button class="btn ghost danger-t" title="Elimina" onClick=${elimina}><${Icon} n="trash" /></button>`}
      ${admin && html`<button class="btn primary" disabled=${busy} onClick=${salva}>${busy ? html`<span class="spin sm"></span>` : html`<${Icon} n="save" />`} Salva nel registro</button>`}
    </${PageHeader}>
    ${ro && html`<div class="ro-note"><${Icon} n="lock" s=${14} /> Modalità sola consultazione (Ospite). Modifiche disabilitate.</div>`}
    ${ro && html`<${GuestPanel} entity="resistenze" id=${id} label=${`Resistenze ${r.codice_progetto}`} />`}

    <${Card} title="1 · Progetto">
      <div class="form-grid">
        <${Field} label="Codice progetto *"><input class="inp" list="dl-prog" value=${r.codice_progetto} disabled=${ro} placeholder="es. MP-2026-0042" onInput=${(e) => set("codice_progetto", e.target.value)} />
          <datalist id="dl-prog">${progetti.map((p) => html`<option value=${p} />`)}</datalist></${Field}>
        <${Field} label="Matricola">${txt(r.matricola, (v) => set("matricola", v))}</${Field}>
        <${Field} label="Potenza nominale *">${numIn(r.potenza_kva, (v) => set("potenza_kva", v), "es. 630", "kVA")}</${Field}>
        <${Field} label="Data misura *"><input type="date" class="inp" value=${r.data} disabled=${ro} onInput=${(e) => set("data", e.target.value)} /></${Field}>
        <${Field} label="Commessa">${txt(r.commessa, (v) => set("commessa", v))}</${Field}>
        <${Field} label="Eseguito da">${txt(r.eseguito_da, (v) => set("eseguito_da", v))}</${Field}>
        <${Field} label="Strumento (micro-ohmmetro, n° serie)">${txt(r.strumento, (v) => set("strumento", v))}</${Field}>
        <${Field} label="Note" full>${txt(r.note, (v) => set("note", v), "es. misura dopo essiccazione, collaudo finale…")}</${Field}>
      </div>
    </${Card}>

    <div class="grid-2 wind-grid">
      ${Winding("pri", "Primario", "AT", V.P)}
      ${Winding("sec", "Secondario", "BT", V.S)}
    </div>

    <${Card} title="2 · Verifica rispetto alla specifica" right=${html`<${Badge} v=${V.esito} />`}>
      <p class="muted small">Scrivi i valori di specifica nella colonna «Specifica»: scostamento ed esito si aggiornano da soli. Resistenze nella stessa unità delle letture.</p>
      <div class="tbl-wrap"><table class="tbl ver-tbl">
        <thead><tr><th>Grandezza</th><th>Specifica</th><th class="r">Misurato a 75 °C</th><th class="r">Scostamento</th><th>Tolleranza</th><th>Esito</th></tr></thead>
        <tbody>${V.righe.map((x) => html`<tr key=${x.key} class=${(x.key === "p_tot" ? "tot " : "") + (x.esito === "ko" ? "row-fail" : "")}>
          <td><b>${x.label}</b></td>
          <td>${x.key === "p_tot" ? html`<span class="mono">${fmtW(x.spec)}</span><small class="muted block">somma AT + BT</small>` : numIn(r.spec[x.key], (v) => setIn("spec", x.key, v), "—", specUnit[x.key])}</td>
          <td class="r mono">${fmtMis(x)}</td>
          <td class=${"r mono " + (x.esito === "ko" ? "t-red" : x.esito === "ok" ? "t-green" : "")}>${fmtPct(x.dev)}</td>
          <td class="nowrap small muted">${x.mode === "abs" ? "±" : "≤ +"}${String(x.toll).replace(".", ",")} %</td>
          <td>${x.esito ? html`<span class=${"badge " + (x.esito === "ok" ? "b-green" : "b-red")}>${x.esito === "ok" ? "OK" : "KO"}</span>` : html`<span class="muted">—</span>`}</td></tr>`)}</tbody></table></div>

      <div class="ver-sum">
        <div class="ver-big"><span class="lbl">Perdite totali misurate</span><b>${fmtW(V.mTot)}</b><small class="muted">specifica ${fmtW(V.sTot)}</small></div>
        <div class=${"ver-big pm " + (V.pmax === null ? "" : V.pmax <= V.toll.p_tot ? "ok" : "ko")}><span class="lbl">Scostamento totale (Pmax)</span><b>${fmtPct(V.pmax)}</b><small class="muted">limite ≤ +${V.toll.p_tot} %</small></div>
        <div class="ver-bars">${V.righe.filter((x) => x.key.startsWith("p")).map((x) => html`<div class="vb" key=${x.key}><small>${x.key === "p_pri" ? "AT" : x.key === "p_sec" ? "BT" : "Tot."}</small>
          <div class="vb-t"><i class="vb-s" style=${`width:${((x.spec || 0) / maxP) * 100}%`}></i><i class=${"vb-m " + (x.esito || "")} style=${`width:${((x.mis || 0) / maxP) * 100}%`}></i></div></div>`)}
          <small class="muted legend"><i class="lg-s"></i> specifica <i class="lg-m"></i> misurato</small></div>
      </div>
      ${V.squilibrioAlto && html`<div class="ro-note warn-note"><${Icon} n="alert" s=${14} /> Squilibrio tra le letture ${fmtPct(V.squilibrioMax, false)}: oltre il ${V.toll.squilibrio} %, ricontrolla contatti e collegamenti.</div>`}

      <details class="toll-det"><summary>Tolleranze usate</summary>
        <div class="form-grid">
          <${Field} label="Perdite totali (max +%)" hint="IEC 60076-1: +10 %">${numIn(r.toll.p_tot, (v) => setIn("toll", "p_tot", v), "", "%")}</${Field}>
          <${Field} label="Perdite singolo avvolgimento (max +%)" hint="IEC 60076-1: +15 %">${numIn(r.toll.p_avv, (v) => setIn("toll", "p_avv", v), "", "%")}</${Field}>
          <${Field} label="Resistenze (±%)">${numIn(r.toll.r, (v) => setIn("toll", "r", v), "", "%")}</${Field}>
          <${Field} label="Squilibrio letture (avviso oltre %)">${numIn(r.toll.squilibrio, (v) => setIn("toll", "squilibrio", v), "", "%")}</${Field}>
        </div></details>
    </${Card}>

    <details class="card dim-card" open=${Object.values(r.dim || {}).some(Boolean)}>
      <summary><h3>3 · Dati avvolgimento BT / AT <span class="muted small">facoltativo · finisce nel PDF se compilato</span></h3></summary>
      <div class="form-grid dim-grid">
        <${Field} label="BT · X interna">${numIn(r.dim.bt_int_x, (v) => setIn("dim", "bt_int_x", v), "—", "mm")}</${Field}>
        <${Field} label="BT · Y interna">${numIn(r.dim.bt_int_y, (v) => setIn("dim", "bt_int_y", v), "—", "mm")}</${Field}>
        <${Field} label="BT · X esterna">${numIn(r.dim.bt_est_x, (v) => setIn("dim", "bt_est_x", v), "—", "mm")}</${Field}>
        <${Field} label="BT · Y esterna">${numIn(r.dim.bt_est_y, (v) => setIn("dim", "bt_est_y", v), "—", "mm")}</${Field}>
        <${Field} label="Radiale BT">${numIn(r.dim.bt_radiale, (v) => setIn("dim", "bt_radiale", v), "—", "mm")}</${Field}>
        <${Field} label="Radiale AT esterno">${numIn(r.dim.at_radiale, (v) => setIn("dim", "at_radiale", v), "—", "mm")}</${Field}>
        <${Field} label="Diametro esterno AT">${numIn(r.dim.at_diam_est, (v) => setIn("dim", "at_diam_est", v), "—", "mm")}</${Field}>
        <${Field} label="Conduttore · larghezza">${numIn(r.dim.cond_larghezza, (v) => setIn("dim", "cond_larghezza", v), "—", "mm")}</${Field}>
        <${Field} label="Conduttore · spessore">${numIn(r.dim.cond_spessore, (v) => setIn("dim", "cond_spessore", v), "—", "mm")}</${Field}>
      </div>
    </details>

    <${Card} title="4 · Firma e allegati">
      <div class="form-grid">
        <div class="full"><${SignaturePad} label="Firma operatore" value=${r.firma} disabled=${ro} firmatario=${(r.firma && r.firma.firmatario) || r.eseguito_da} onChange=${(f) => set("firma", f)} /></div>
        <div class="full"><${Allegati} parentType="resistenze" parentId=${id} disabled=${ro} pending=${pending} onPending=${setPending} /></div>
      </div>
    </${Card}>
    ${admin && html`<div class="row-end wiz-nav"><button class="btn primary" disabled=${busy} onClick=${salva}><${Icon} n="save" /> Salva nel registro</button></div>`}
    ${id && html`<p class="meta muted small">Registrata ${fmtDT(r.created_at)} da ${r.created_by || "—"}${r.updated_by ? ` · Ultima modifica ${fmtDT(r.updated_at)} da ${r.updated_by}` : ""}</p>`}
  </div>`;
}
