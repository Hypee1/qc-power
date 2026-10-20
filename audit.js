import { html, useState, useEffect, Icon, Badge, PageHeader, Card, Spinner, Empty, toDate, fmtTime, shortId, download, csv, fmtDT } from "../ui.js";
import { recentRows } from "../store.js";

export const AZIONI = {
  login: ["Login", "green"], logout: ["Logout", "zinc"], timeout: ["Logout per inattività", "zinc"], login_fallito: ["Login fallito", "red"],
  create: ["Creazione", "blue"], update: ["Modifica", "amber"], delete: ["Eliminazione", "red"], pdf_download: ["Download PDF", "violet"],
  view: ["Visualizzazione", "zinc"], sollecito: ["Sollecito", "red"], nota: ["Nota ospite", "blue"], allegato: ["Allegato", "blue"],
  import: ["Import dati", "violet"], password: ["Cambio password", "amber"], ripresa_sessione: ["Ripresa sessione", "zinc"],
};
const CAT = { accessi: ["login", "logout", "timeout", "login_fallito"], modifiche: ["create", "update", "delete", "allegato", "import"], documenti: ["pdf_download", "view"], ospite: ["sollecito", "nota"] };
const ENT = { controlli: "controllo", nc: "nc", ddt: "ddt", commesse: "commessa", segnalazioni: "segnalazione" };
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export function AuditLog() {
  const [rows, setRows] = useState(null);
  const [cat, setCat] = useState("");
  const [chi, setChi] = useState("");
  const load = () => recentRows("audit", 1500).then(setRows).catch((e) => { console.error(e); setRows([]); });
  useEffect(() => { load(); }, []);
  if (!rows) return html`<${Spinner} />`;
  const f = rows.filter((r) => (!cat || (CAT[cat] || []).includes(r.action)) && (!chi || r.user_role === chi));
  const groups = [];
  f.forEach((r) => { const d = toDate(r.ts) || new Date(0); const k = d.toDateString(); let g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push((g = { k, d, items: [] })); g.items.push(r); });
  const link = (r) => r.entity === "controlli" ? "#/controllo/" + r.entity_id : r.entity === "nc" ? "#/nc/" + r.entity_id : r.entity === "ddt" ? "#/ddt?" + r.entity_id : r.entity === "commesse" ? "#/commesse?" + r.entity_id : null;
  const esporta = () => download("audit_log.csv", csv([["Data/ora", "Azione", "Entità", "ID", "Descrizione", "Dettagli", "Utente", "Ruolo"],
    ...f.map((r) => [fmtDT(r.ts), (AZIONI[r.action] || [r.action])[0], r.entity, r.entity_id, r.label, r.details, r.user_email, r.user_role])]), "text/csv");
  return html`<div>
    <${PageHeader} title="Audit Log" subtitle="Tracciamento accessi e operazioni di sistema">
      <button class="btn outline" onClick=${esporta}><${Icon} n="download" /> CSV</button><button class="btn outline" onClick=${load}><${Icon} n="refresh" /> Aggiorna</button>
    </${PageHeader}>
    <${Card}>
      <div class="filters">
        <select class="inp" value=${cat} onChange=${(e) => setCat(e.target.value)}><option value="">Tutte le categorie</option><option value="accessi">Accessi</option><option value="modifiche">Modifiche</option><option value="documenti">Visualizzazioni & PDF</option><option value="ospite">Solleciti & note</option></select>
        <select class="inp" value=${chi} onChange=${(e) => setChi(e.target.value)}><option value="">Tutti gli utenti</option><option value="admin">Admin</option><option value="ospite">Ospite</option></select>
        <span class="muted small">${f.length} eventi</span>
      </div>
      ${groups.length === 0 ? html`<${Empty} text="Nessun evento." />` : groups.map((g) => html`<div class="day-g">
        <div class="day-h"><b>${GIORNI[g.d.getDay()]} ${g.d.getDate()} ${MESI[g.d.getMonth()]} ${g.d.getFullYear()}</b><span class="muted small">${g.items.length} eventi</span></div>
        ${g.items.map((r) => { const [l, c] = AZIONI[r.action] || [r.action, "zinc"]; const h = link(r);
          return html`<div class="ev"><span class=${"dot d-" + c}></span><span class="ev-a">${l}</span>
            <span class="ev-e">${r.entity ? html`${h ? html`<a href=${h}>${ENT[r.entity] || r.entity} · ${r.label || shortId(r.entity_id)}</a>` : html`${ENT[r.entity] || r.entity} · ${r.label || shortId(r.entity_id)}`}` : "—"}
              ${r.details && html`<small class="muted block">“${r.details}”</small>`}</span>
            <span class="ev-u">${r.user_email} <${Badge} v=${r.user_role} /></span><span class="mono small">${fmtTime(r.ts)}</span></div>`; })}
      </div>`)}
    </${Card}>
  </div>`;
}
