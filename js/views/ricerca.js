import { html, useState, useEffect, Icon, Badge, PageHeader, Card, Spinner, Empty, fmtDate, norm } from "../ui.js";
import { useCollections } from "./common.js";
import { pdfControllo, pdfNC, pdfRientro } from "../pdf.js";

const TABS = [["all", "Tutti"], ["nc", "Non Conformità"], ["controlli", "Controlli"], ["audit", "Audit"], ["near_miss", "Near miss"], ["richieste", "Richieste"], ["rientri", "Rientri"]];

export function Ricerca() {
  const [d] = useCollections(["nc", "controlli", "audit_clienti", "rientri", "near_miss", "richieste"]);
  const [q, setQ] = useState(() => sessionStorage.getItem("qc-q") || "");
  const [tab, setTab] = useState("all");
  useEffect(() => { const s = sessionStorage.getItem("qc-q"); if (s !== null) { setQ(s); sessionStorage.removeItem("qc-q"); } }, [location.hash]);
  if (!d) return html`<${Spinner} />`;
  const nq = norm(q);
  const words = nq.split(/\s+/).filter(Boolean);
  const match = (txt) => { const t = norm(txt); return words.every((w) => t.includes(w)); };
  const R = !words.length ? [] : [
    ...d.nc.filter((x) => match([x.numero_report, x.controparte, x.materiale_descrizione, x.descrizione_nc, x.documento_riferimento, x.causa, x.trattamento, x.azione_correttiva, x.origine_nc].join(" ")))
      .map((x) => ({ t: "nc", x, title: (x.azienda === "service" ? "NC Service " : "NC ") + x.numero_report, sub: `${x.materiale_descrizione || ""} · ${x.controparte || ""}`, date: x.data, badge: x.stato, href: "#/nc/" + x.id })),
    ...d.rientri.filter((x) => match([x.numero, x.numero_ddt, x.mittente, x.causale, x.costruttore, x.matricola, x.potenza, x.gruppo, x.riscontro_apertura, x.attivita_prevedere, x.osservazioni_prove].join(" ")))
      .map((x) => ({ t: "rientri", x, title: `Rientro ${x.numero}${x.azienda === "service" ? " (Service)" : ""}${x.matricola ? " · Matr. " + x.matricola : ""}`, sub: `${x.mittente || ""} · ${x.causale || ""}`, date: x.data, badge: x.stato, href: "#/rientro/" + x.id })),
    ...d.controlli.filter((x) => match([x.fornitore, x.tipo, x.sottotipo, x.ddt, x.codice_commessa, x.codice_progetto, x.note, x.descrizione_materiale, x.dati_legacy && x.dati_legacy.dettaglio_materiale, ...(x.controlli_dimensionali || []).map((q) => q.descrizione)].join(" ")))
      .map((x) => ({ t: "controlli", x, title: `${x.tipo || "Controllo"} · ${x.fornitore || ""}`, sub: `DDT ${x.ddt || "—"} · ${x.descrizione_materiale || (x.dati_legacy && x.dati_legacy.dettaglio_materiale) || x.percorso}`, date: x.data, badge: x.conformita_generale, href: "#/controllo/" + x.id })),
    ...d.richieste.filter((x) => match([x.numero, x.oggetto, x.descrizione, x.tipo, x.fornitore, x.richiesto_da, x.ordine, x.esito].join(" ")))
      .map((x) => ({ t: "richieste", x, title: `Richiesta ${x.numero || ""}: ${x.oggetto || ""}`, sub: [x.tipo, x.fornitore, x.richiesto_da].filter(Boolean).join(" · "), date: x.data, badge: x.stato, href: "#/richiesta/" + x.id })),
    ...d.near_miss.filter((x) => match([x.numero, x.reparto, x.luogo, x.tipo_pericolo, x.descrizione, x.segnalato_da, x.persone_coinvolte, x.causa].join(" ")))
      .map((x) => ({ t: "near_miss", x, title: `Near miss ${x.numero || ""}${x.azienda === "service" ? " (Service)" : ""}`, sub: [x.reparto, x.tipo_pericolo].filter(Boolean).join(" · "), date: x.data, badge: x.stato, href: "#/near-miss/" + x.id })),
    ...d.audit_clienti.filter((x) => match([x.cliente, x.cliente_finale, x.tipo, x.oggetto, x.auditor, x.note].join(" ")))
      .map((x) => ({ t: "audit", x, title: `Audit ${x.cliente || ""}${x.azienda === "service" ? " (Service)" : ""}`, sub: [x.tipo, x.cliente_finale && "cliente finale " + x.cliente_finale].filter(Boolean).join(" · "), date: x.data_inizio, badge: x.esito, href: "#/audit-cliente/" + x.id })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const shown = R.filter((r) => tab === "all" || r.t === tab);
  const count = (t) => (t === "all" ? R.length : R.filter((r) => r.t === t).length);
  return html`<div>
    <${PageHeader} title="Ricerca" subtitle="Ricerca globale su NC, controlli, audit e rientri" />
    <${Card}>
      <div class="search big"><${Icon} n="search" s=${18} /><input class="inp" autofocus placeholder="Cerca per numero NC, fornitore, cliente, materiale, DDT…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <div class="tabs">${TABS.map(([k, l]) => html`<button class=${"tab" + (tab === k ? " on" : "")} onClick=${() => setTab(k)}>${l}${words.length ? html` <em>${count(k)}</em>` : ""}</button>`)}</div>
      ${!words.length ? html`<${Empty} text="Digita un termine da cercare." icon="search" />`
        : shown.length === 0 ? html`<${Empty} text="Nessun risultato." />` : html`<div class="mini-list">
        ${shown.slice(0, 200).map((r) => html`<div class="mini">
          <span class="arch-ic"><${Icon} n=${r.t === "nc" ? "alert" : r.t === "rientri" ? "zap" : r.t === "controlli" ? "clipboard" : r.t === "near_miss" ? "hardhat" : r.t === "richieste" ? "cart" : "award"} /></span>
          <a href=${r.href} class="grow"><b>${r.title}</b><small>${r.sub}</small></a>
          <span class="mono small muted">${fmtDate(r.date)}</span>${r.badge && html`<${Badge} v=${r.badge} />`}
          ${(r.t === "nc" || r.t === "controlli" || r.t === "rientri") && html`<button class="btn ghost icon" title="PDF" onClick=${() => (r.t === "nc" ? pdfNC(r.x) : r.t === "rientri" ? pdfRientro(r.x) : pdfControllo(r.x))}><${Icon} n="download" /></button>`}
          <a class="btn ghost icon" href=${r.href}><${Icon} n="next" /></a></div>`)}</div>`}
    </${Card}>
  </div>`;
}
