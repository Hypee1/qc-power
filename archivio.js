import { html, useState, useEffect, Icon, Badge, PageHeader, Card, Spinner, Empty, fmtDate, norm } from "../ui.js";
import { useCollections } from "./common.js";
import { pdfControllo, pdfNC } from "../pdf.js";

const TABS = [["all", "Tutti"], ["nc", "Non Conformità"], ["controlli", "Controlli"], ["commesse", "Commesse"], ["ddt", "Certificati & DDT"]];

export function Archivio() {
  const [d] = useCollections(["nc", "controlli", "commesse", "ddt"]);
  const [q, setQ] = useState(() => sessionStorage.getItem("qc-q") || "");
  const [tab, setTab] = useState("all");
  useEffect(() => { const s = sessionStorage.getItem("qc-q"); if (s !== null) { setQ(s); sessionStorage.removeItem("qc-q"); } }, [location.hash]);
  if (!d) return html`<${Spinner} />`;
  const nq = norm(q);
  const words = nq.split(/\s+/).filter(Boolean);
  const match = (txt) => { const t = norm(txt); return words.every((w) => t.includes(w)); };
  const R = !words.length ? [] : [
    ...d.nc.filter((x) => match([x.numero_report, x.controparte, x.materiale_descrizione, x.descrizione_nc, x.documento_riferimento, x.causa, x.trattamento, x.azione_correttiva, x.origine_nc].join(" ")))
      .map((x) => ({ t: "nc", x, title: "NC " + x.numero_report, sub: `${x.materiale_descrizione || ""} · ${x.controparte || ""}`, date: x.data, badge: x.stato, href: "#/nc/" + x.id })),
    ...d.controlli.filter((x) => match([x.fornitore, x.tipo, x.sottotipo, x.ddt, x.codice_commessa, x.codice_progetto, x.note, x.descrizione_materiale, x.dati_legacy && x.dati_legacy.dettaglio_materiale, ...(x.controlli_dimensionali || []).map((q) => q.descrizione)].join(" ")))
      .map((x) => ({ t: "controlli", x, title: `${x.tipo || "Controllo"} · ${x.fornitore || ""}`, sub: `DDT ${x.ddt || "—"} · ${x.descrizione_materiale || (x.dati_legacy && x.dati_legacy.dettaglio_materiale) || x.percorso}`, date: x.data, badge: x.conformita_generale, href: "#/controllo/" + x.id })),
    ...d.commesse.filter((x) => match([x.codice, x.descrizione, x.cliente, ...(x.materiali || []).map((m) => m.Descrizione || m.descrizione)].join(" ")))
      .map((x) => ({ t: "commesse", x, title: "Commessa " + x.codice, sub: `${x.cliente || ""} · ${x.descrizione || ""}`, date: x.data_consegna, href: "#/commesse?" + x.id })),
    ...d.ddt.filter((x) => match([x.numero, x.fornitore, x.descrizione, x.note, x.commessa, ...(x.materiali || []).map((m) => m.tipo + " " + m.descrizione)].join(" ")))
      .map((x) => ({ t: "ddt", x, title: `${x.tipo === "certificato" ? "Certificato" : "DDT"} ${x.numero}`, sub: `${x.fornitore || ""} · ${x.descrizione || ""}`, date: x.data, badge: x.tipo, href: "#/ddt?" + x.id })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const shown = R.filter((r) => tab === "all" || r.t === tab);
  const count = (t) => (t === "all" ? R.length : R.filter((r) => r.t === t).length);
  return html`<div>
    <${PageHeader} title="Archivio documentale" subtitle="Ricerca globale su NC, controlli, commesse e documenti" />
    <${Card}>
      <div class="search big"><${Icon} n="search" s=${18} /><input class="inp" autofocus placeholder="Cerca per numero NC, fornitore, materiale, commessa, documento…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <div class="tabs">${TABS.map(([k, l]) => html`<button class=${"tab" + (tab === k ? " on" : "")} onClick=${() => setTab(k)}>${l}${words.length ? html` <em>${count(k)}</em>` : ""}</button>`)}</div>
      ${!words.length ? html`<${Empty} text="Digita un termine per interrogare l'archivio documentale." icon="search" />`
        : shown.length === 0 ? html`<${Empty} text="Nessun risultato." />` : html`<div class="mini-list">
        ${shown.slice(0, 200).map((r) => html`<div class="mini">
          <span class="arch-ic"><${Icon} n=${r.t === "nc" ? "alert" : r.t === "controlli" ? "clipboard" : r.t === "ddt" ? "truck" : "box"} /></span>
          <a href=${r.href} class="grow"><b>${r.title}</b><small>${r.sub}</small></a>
          <span class="mono small muted">${fmtDate(r.date)}</span>${r.badge && html`<${Badge} v=${r.badge} />`}
          ${(r.t === "nc" || r.t === "controlli") && html`<button class="btn ghost icon" title="PDF" onClick=${() => (r.t === "nc" ? pdfNC(r.x) : pdfControllo(r.x))}><${Icon} n="download" /></button>`}
          <a class="btn ghost icon" href=${r.href}><${Icon} n="next" /></a></div>`)}</div>`}
    </${Card}>
  </div>`;
}
