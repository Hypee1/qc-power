import { html, useState, Icon, PageHeader, Card, Spinner, Empty, fmtDate, isoDay } from "../ui.js";
import { isAdmin } from "../store.js";
import { useCollections } from "./common.js";
import { APP } from "../config.js";
import { Calendario, VoceRow, EventoModal, vociCalendario, nuovoEvento } from "./calendario.js";

const FILTRI = [["", "Tutto"], ["nc", "Scadenze NC"], ["audit", "Audit"], ["scadenza", "Scadenze"], ["evento", "Eventi"], ["nm", "Near miss"], ["rq", "Richieste"]];

export function Scadenziario() {
  const [d, reload] = useCollections(["nc", "audit_clienti", "eventi", "near_miss", "richieste"]);
  const [filtro, setFiltro] = useState("");
  const [giorno, setGiorno] = useState("");
  const [ev, setEv] = useState(null);
  const admin = isAdmin();
  if (!d) return html`<${Spinner} />`;
  const voci = vociCalendario(d);
  const match = (v) => !filtro || v.kind === filtro || (filtro === "audit" && v.kind === "audit_prev");
  const vis = voci.filter(match);
  const today = isoDay();
  const ncV = voci.filter((v) => v.kind === "nc");
  const scadute = ncV.filter((v) => v.status === "scaduta").length, inScad = ncV.filter((v) => v.status === "in_scadenza").length;
  const prossimi = voci.filter((v) => v.kind !== "nc" && (v.end || v.start) >= today && !v.done);
  const shown = giorno ? vis.filter((v) => v.start <= giorno && (v.end || v.start) >= giorno)
    : vis.filter((v) => (v.kind === "nc") || ((v.end || v.start) >= today && !v.done));

  const kpi = (k, label, val, cls, sub) => html`<button class=${"kpi kpi-btn " + cls + (filtro === k ? " sel" : "")} onClick=${() => { setFiltro(filtro === k ? "" : k); setGiorno(""); }}>
    <div><span class="lbl">${label}</span><b>${val}</b>${sub && html`<small>${sub}</small>`}</div></button>`;
  return html`<div>
    <${PageHeader} title="Calendario & Scadenze" subtitle=${`Scadenze NC (avviso a ${APP.avvisoGiorni} gg, SLA ${APP.slaGiorni} gg), audit dei clienti, eventi e scadenze`}>
      <button class="btn outline" onClick=${reload}><${Icon} n="refresh" /> Aggiorna</button>
      ${admin && html`<button class="btn primary" onClick=${() => setEv(nuovoEvento(giorno))}><${Icon} n="plus" /> Nuovo evento</button>`}
    </${PageHeader}>
    <div class="kpis">
      ${kpi("nc", "NC scadute / in scadenza", `${scadute} / ${inScad}`, "k-red", `${ncV.length} NC aperte con scadenza`)}
      ${kpi("audit", "Audit in arrivo", prossimi.filter((v) => v.kind === "audit" || v.kind === "audit_prev").length, "k-teal", "da oggi in poi")}
      ${kpi("scadenza", "Scadenze", prossimi.filter((v) => v.kind === "scadenza").length, "k-amber", "da fare")}
      ${kpi("evento", "Eventi", prossimi.filter((v) => v.kind === "evento").length, "k-violet", "in programma")}
    </div>
    ${scadute > 0 && html`<div class="alert-bar static"><${Icon} n="alert" /><span><b>Richiesta di revisione</b> — ${scadute} non conformità hanno superato la data di scadenza.</span></div>`}
    <div class="grid-2">
      <${Card} title="Calendario"><${Calendario} voci=${vis} giorno=${giorno} onGiorno=${setGiorno} /></${Card}>
      <${Card} title=${giorno ? "Giorno " + fmtDate(giorno) : "Scadenze e prossimi impegni"} right=${html`<span class="muted small">${shown.length} voci
        ${(filtro || giorno) ? html` · <button class="link-btn" onClick=${() => { setFiltro(""); setGiorno(""); }}>azzera</button>` : ""}
        ${admin && giorno ? html` · <button class="link-btn" onClick=${() => setEv(nuovoEvento(giorno))}>+ evento in questo giorno</button>` : ""}</span>`}>
        <div class="tabs sm">${FILTRI.map(([k, l]) => html`<button class=${"tab" + (filtro === k ? " on" : "")} onClick=${() => setFiltro(k)}>${l}</button>`)}</div>
        ${shown.length === 0 ? html`<${Empty} text=${giorno ? "Niente in questo giorno." : "Nessuna scadenza o impegno in programma."} icon="checkCircle" />`
          : html`<div class="mini-list">${shown.map((v) => html`<${VoceRow} key=${v.id} v=${v} onEdit=${setEv} />`)}</div>`}
      </${Card}>
    </div>
    ${ev && html`<${EventoModal} ev=${ev} onClose=${() => setEv(null)} />`}
  </div>`;
}
