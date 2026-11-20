import { html, useState, Icon, Badge, Modal, Field, Select, toast, confirmDialog, fmtDate, isoDay, pad, toDate } from "../ui.js";
import { create, update, remove, isAdmin } from "../store.js";
import { statoScadenza } from "./common.js";
import { ESITI_AUDIT } from "../config.js";
import { aziendaLabel, aziendaOf } from "../azienda.js";

export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const TIPI_EVENTO = [{ v: "evento", l: "Evento / promemoria" }, { v: "scadenza", l: "Scadenza" }, { v: "audit_prev", l: "Audit previsto" }];
const KIND = {
  nc: { l: "Scadenza NC", c: "red", i: "alert" },
  audit: { l: "Audit cliente", c: "teal", i: "award" },
  evento: { l: "Evento", c: "violet", i: "calendar" },
  scadenza: { l: "Scadenza", c: "amber", i: "clock" },
  audit_prev: { l: "Audit previsto", c: "teal", i: "award" },
  nm: { l: "Azione near miss", c: "orange", i: "hardhat" },
  rq: { l: "Richiesta (serve entro)", c: "blue", i: "cart" },
};
export const kindInfo = (k) => KIND[k] || KIND.evento;

// Unisce NC aperte (con scadenza), audit clienti ed eventi in un'unica lista di voci di calendario
export function vociCalendario({ nc = [], audit_clienti = [], eventi = [], near_miss = [], richieste = [] }) {
  const V = [];
  nc.forEach((n) => { const s = statoScadenza(n); if (!s) return;
    V.push({ id: "nc-" + n.id, kind: "nc", start: s.data, end: s.data, title: `NC ${n.numero_report || ""}${aziendaOf(n) === "service" ? " (Service)" : ""}`,
      sub: [n.controparte, n.materiale_descrizione].filter(Boolean).join(" · ") + (s.esplicita ? "" : " · scadenza automatica 30 gg"),
      status: s.status, giorni: s.giorni, href: "#/nc/" + n.id }); });
  audit_clienti.forEach((a) => { if (!a.data_inizio) return;
    const e = ESITI_AUDIT.find((x) => x.v === a.esito);
    V.push({ id: "au-" + a.id, kind: "audit", start: a.data_inizio, end: a.data_fine || a.data_inizio, title: `Audit ${a.cliente || ""}`,
      sub: [aziendaLabel(aziendaOf(a)), a.tipo, a.cliente_finale && "cliente finale " + a.cliente_finale, e && "esito " + e.l.toLowerCase()].filter(Boolean).join(" · "),
      badge: a.esito, href: "#/audit-cliente/" + a.id }); });
  eventi.forEach((e) => { if (!e.data) return;
    V.push({ id: "ev-" + e.id, kind: e.tipo || "evento", start: e.data, end: e.data_fine || e.data, title: e.titolo || "Evento",
      sub: [e.azienda && aziendaLabel(e.azienda), e.note].filter(Boolean).join(" · "), done: !!e.fatto, ev: e }); });
  near_miss.forEach((n) => (n.azioni || []).forEach((a, i) => { if (!a.scadenza || !a.azione || n.stato === "nm_chiuso") return;
    const g = Math.round((toDate(a.scadenza) - toDate(isoDay())) / 86400000);
    V.push({ id: `nm-${n.id}-${i}`, kind: "nm", start: a.scadenza, end: a.scadenza, title: `Near miss ${n.numero || ""}: ${a.azione}`,
      sub: [a.responsabile, n.reparto].filter(Boolean).join(" · "), done: !!a.fatta,
      status: a.fatta ? "" : g < 0 ? "scaduta" : g <= 7 ? "in_scadenza" : "", href: "#/near-miss/" + n.id }); }));
  richieste.forEach((r) => { if (!r.entro || ["rq_evasa", "rq_rifiutata", "rq_annullata"].includes(r.stato)) return;
    const g = Math.round((toDate(r.entro) - toDate(isoDay())) / 86400000);
    V.push({ id: "rq-" + r.id, kind: "rq", start: r.entro, end: r.entro, title: `Richiesta ${r.numero || ""}: ${r.oggetto || ""}`,
      sub: [r.richiesto_da, r.fornitore, r.priorita === "urgente" && "URGENTE"].filter(Boolean).join(" · "),
      status: g < 0 ? "scaduta" : g <= 7 ? "in_scadenza" : "", href: "#/richiesta/" + r.id }); });
  return V.sort((a, b) => a.start.localeCompare(b.start));
}
const inDay = (v, k) => v.start <= k && (v.end || v.start) >= k;
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const diffGg = (k) => Math.round((toDate(k) - toDate(isoDay())) / 86400000);

export function Calendario({ voci, giorno, onGiorno, compact }) {
  const [mese, setMese] = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); });
  const y = mese.getFullYear(), m = mese.getMonth();
  const start = new Date(y, m, 1 - ((new Date(y, m, 1).getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const today = isoDay();
  return html`<div class=${"calw" + (compact ? " compact" : "")}>
    <div class="cal-nav"><button class="btn ghost icon sm" onClick=${() => setMese(new Date(y, m - 1, 1))} aria-label="Mese precedente"><${Icon} n="left" /></button>
      <b class="cal-m">${MESI[m]} ${y}</b><button class="btn ghost icon sm" onClick=${() => setMese(new Date(y, m + 1, 1))} aria-label="Mese successivo"><${Icon} n="right" /></button>
      <button class="link-btn" onClick=${() => { const t = new Date(); setMese(new Date(t.getFullYear(), t.getMonth(), 1)); onGiorno && onGiorno(today); }}>oggi</button></div>
    <div class="cal">${["lun", "mar", "mer", "gio", "ven", "sab", "dom"].map((g) => html`<span class="cal-h">${g}</span>`)}
      ${days.map((dd) => { const k = dayKey(dd); const ev = voci.filter((v) => inDay(v, k));
        const st = ev.some((x) => x.status === "scaduta") ? " ev-scaduta" : ev.some((x) => x.status === "in_scadenza") ? " ev-in_scadenza" : "";
        const kinds = [...new Set(ev.map((x) => x.kind))];
        return html`<button class=${"cal-d" + (dd.getMonth() !== m ? " out" : "") + (k === today ? " today" : "") + (giorno === k ? " sel" : "") + st}
          onClick=${() => onGiorno && onGiorno(giorno === k ? "" : k)} title=${ev.map((x) => x.title).join("\n")}>
          <span class="cal-n">${dd.getDate()}</span>
          ${ev.length > 0 && html`<span class="cal-dots">${kinds.slice(0, 4).map((kk) => html`<i class=${"dot d-" + kindInfo(kk).c}></i>`)}${ev.length > 1 ? html`<em>${ev.length}</em>` : ""}</span>`}</button>`; })}
    </div>
    <div class="legend"><i class="lg-red"></i>Scadenza NC <i class="lg-teal"></i>Audit <i class="lg-amber"></i>Scadenza <i class="lg-violet"></i>Evento <i class="lg-orange"></i>Near miss <i class="lg-blue"></i>Richieste</div>
  </div>`;
}

export function VoceRow({ v, onEdit }) {
  const ki = kindInfo(v.kind);
  const g = diffGg(v.start), gEnd = diffGg(v.end || v.start);
  const quando = g <= 0 && gEnd >= 0 && v.start !== v.end ? "in corso" : g === 0 ? "oggi" : g === 1 ? "domani" : g > 0 ? `tra ${g} gg` : `${Math.abs(g)} gg fa`;
  const inner = html`<span class=${"vk vk-" + ki.c}><${Icon} n=${ki.i} s=${14} /></span>
    <div class="grow"><b class=${v.done ? "done" : ""}>${v.title}</b><small>${ki.l}${v.sub ? " · " + v.sub : ""}</small></div>
    <div class="r"><span class="mono small">${fmtDate(v.start)}${v.end && v.end !== v.start ? " → " + fmtDate(v.end) : ""}</span>
      <small class=${v.status === "scaduta" ? "t-red" : v.status === "in_scadenza" ? "t-amber" : "muted"}>${v.done ? "fatto" : quando}</small></div>
    ${v.status && v.status !== "in_corso" && !v.done ? html`<${Badge} v=${v.status} />` : v.badge ? html`<${Badge} v=${v.badge} />` : null}`;
  return v.href ? html`<a class="mini" href=${v.href}>${inner}<${Icon} n="next" s=${14} /></a>`
    : html`<div class="mini">${inner}${isAdmin() && onEdit && html`<button class="btn ghost icon sm" title="Modifica" onClick=${() => onEdit(v.ev)}><${Icon} n="pencil" s=${14} /></button>`}</div>`;
}

const nuovoEvento = (data) => ({ titolo: "", tipo: "evento", data: data || isoDay(), data_fine: "", azienda: "", note: "", fatto: false });
export function EventoModal({ ev, onClose }) {
  const [e, setE] = useState(ev);
  const [busy, setBusy] = useState(false);
  if (!e) return null;
  const set = (k, v) => setE({ ...e, [k]: v });
  const salva = async () => {
    if (!e.titolo.trim()) return toast.err("Scrivi il titolo");
    if (!e.data) return toast.err("Inserisci la data");
    if (e.data_fine && e.data_fine < e.data) return toast.err("La data fine è prima della data inizio");
    setBusy(true);
    try { if (e.id) await update("eventi", e.id, e, e.titolo); else await create("eventi", e, e.titolo); toast.ok("Evento salvato"); onClose(); }
    catch (x) { toast.err("Salvataggio non riuscito: " + (x.code || x.message)); }
    setBusy(false);
  };
  const del = async () => { if (!(await confirmDialog("Eliminare l'evento?", e.titolo))) return; await remove("eventi", e.id, e.titolo); onClose(); };
  return html`<${Modal} open title=${e.id ? "Modifica evento" : "Nuovo evento / scadenza"} onClose=${onClose}
    footer=${html`${e.id && html`<button class="btn ghost danger-t" onClick=${del}><${Icon} n="trash" /> Elimina</button>`}<span class="grow"></span>
      <button class="btn outline" onClick=${onClose}>Annulla</button><button class="btn primary" disabled=${busy} onClick=${salva}><${Icon} n="save" /> Salva</button>`}>
    <div class="form-grid">
      <${Field} label="Titolo *" full><input class="inp" placeholder="es. Taratura micrometri, Audit Enel previsto, Rinnovo ISO…" value=${e.titolo} onInput=${(x) => set("titolo", x.target.value)} /></${Field}>
      <${Field} label="Tipo"><${Select} value=${e.tipo} placeholder="—" options=${TIPI_EVENTO} onChange=${(v) => set("tipo", v)} /></${Field}>
      <${Field} label="Azienda"><${Select} value=${e.azienda} placeholder="Entrambe / non specificata" options=${[{ v: "power", l: "MACE POWER" }, { v: "service", l: "MACE SERVICE" }]} onChange=${(v) => set("azienda", v)} /></${Field}>
      <${Field} label="Data *"><input type="date" class="inp" value=${e.data} onInput=${(x) => set("data", x.target.value)} /></${Field}>
      <${Field} label="Data fine (se dura più giorni)"><input type="date" class="inp" value=${e.data_fine} onInput=${(x) => set("data_fine", x.target.value)} /></${Field}>
      <${Field} label="Note" full><textarea class="inp" rows="2" value=${e.note} onInput=${(x) => set("note", x.target.value)}></textarea></${Field}>
      ${e.id && html`<${Field} label=" " full><label class="chk"><input type="checkbox" checked=${!!e.fatto} onChange=${(x) => set("fatto", x.target.checked)} /> Fatto / completato</label></${Field}>`}
    </div></${Modal}>`;
}
export { nuovoEvento };
