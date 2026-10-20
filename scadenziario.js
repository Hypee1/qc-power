import { html, useState, Icon, Badge, PageHeader, Card, Spinner, Empty, fmtDate, isoDay, pad } from "../ui.js";
import { useCollections, statoScadenza } from "./common.js";
import { APP } from "../config.js";

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export function Scadenziario() {
  const [d, reload] = useCollections(["nc"]);
  const [mese, setMese] = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); });
  const [filtro, setFiltro] = useState("");
  const [giorno, setGiorno] = useState("");
  if (!d) return html`<${Spinner} />`;
  const items = d.nc.map((n) => ({ n, s: statoScadenza(n) })).filter((x) => x.s).sort((a, b) => a.s.giorni - b.s.giorni);
  const cnt = (st) => items.filter((x) => x.s.status === st).length;
  const shown = items.filter((x) => (!filtro || x.s.status === filtro) && (!giorno || x.s.data === giorno));

  const y = mese.getFullYear(), m = mese.getMonth();
  const start = new Date(y, m, 1 - ((new Date(y, m, 1).getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const today = isoDay();
  const byDay = {};
  items.forEach((x) => { (byDay[x.s.data] = byDay[x.s.data] || []).push(x); });

  const kpi = (st, label, cls) => html`<button class=${"kpi kpi-btn " + cls + (filtro === st ? " sel" : "")} onClick=${() => setFiltro(filtro === st ? "" : st)}>
    <div><span class="lbl">${label}</span><b>${cnt(st)}</b></div></button>`;
  return html`<div>
    <${PageHeader} title="Scadenziario" subtitle=${`Scadenze NC · avviso a ${APP.avvisoGiorni} giorni · SLA ${APP.slaGiorni} gg dall'apertura`}>
      <button class="btn outline" onClick=${reload}><${Icon} n="refresh" /> Aggiorna</button>
    </${PageHeader}>
    <div class="kpis three">${kpi("scaduta", "Scadute", "k-red")}${kpi("in_scadenza", "In scadenza", "k-amber")}${kpi("in_corso", "In corso", "k-blue")}</div>
    ${cnt("scaduta") > 0 && html`<div class="alert-bar static"><${Icon} n="alert" /><span><b>Richiesta di revisione</b> — ${cnt("scaduta")} non conformità hanno superato la data di scadenza e richiedono revisione immediata.</span></div>`}
    <div class="grid-2">
      <${Card} title="Calendario scadenze" right=${html`<div class="row-gap"><button class="btn ghost icon sm" onClick=${() => setMese(new Date(y, m - 1, 1))}><${Icon} n="left" /></button>
        <b class="cal-m">${MESI[m]} ${y}</b><button class="btn ghost icon sm" onClick=${() => setMese(new Date(y, m + 1, 1))}><${Icon} n="right" /></button></div>`}>
        <div class="cal">${["lun", "mar", "mer", "gio", "ven", "sab", "dom"].map((g) => html`<span class="cal-h">${g}</span>`)}
          ${days.map((dd) => { const k = `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`; const ev = byDay[k] || [];
            const st = ev.some((x) => x.s.status === "scaduta") ? "scaduta" : ev.some((x) => x.s.status === "in_scadenza") ? "in_scadenza" : ev.length ? "in_corso" : "";
            return html`<button class=${"cal-d" + (dd.getMonth() !== m ? " out" : "") + (k === today ? " today" : "") + (giorno === k ? " sel" : "") + (st ? " ev-" + st : "")}
              onClick=${() => setGiorno(giorno === k ? "" : k)} title=${ev.map((x) => x.n.numero_report).join(", ")}>${dd.getDate()}${ev.length > 0 && html`<i>${ev.length}</i>`}</button>`; })}
        </div>
        <div class="legend"><i class="lg-red"></i>Scaduta <i class="lg-amber"></i>In scadenza <i class="lg-blue"></i>In corso</div>
      </${Card}>
      <${Card} title="Tutte le NC aperte" right=${html`<span class="muted small">${shown.length} voci${giorno ? " · " + fmtDate(giorno) : ""}${filtro || giorno ? html` · <button class="link-btn" onClick=${() => { setFiltro(""); setGiorno(""); }}>azzera</button>` : ""}</span>`}>
        ${shown.length === 0 ? html`<${Empty} text="Nessuna NC aperta con scadenza." icon="checkCircle" />` : html`<div class="mini-list">
          ${shown.map(({ n, s }) => html`<a class="mini" href=${"#/nc/" + n.id}>
            <div><b>${n.numero_report}</b><small>${n.materiale_descrizione || "—"} · ${n.controparte || ""}</small></div>
            <div class="r"><span class="mono small">${fmtDate(s.data)}${s.esplicita ? "" : " (SLA)"}</span><small class=${s.giorni < 0 ? "t-red" : s.giorni <= APP.avvisoGiorni ? "t-amber" : "muted"}>
              ${s.giorni < 0 ? Math.abs(s.giorni) + " gg fa" : s.giorni === 0 ? "oggi" : "tra " + s.giorni + " gg"}</small></div>
            <${Badge} v=${s.status} /></a>`)}</div>`}
      </${Card}>
    </div>
  </div>`;
}
