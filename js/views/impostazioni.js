import { html, useState, Icon, PageHeader, Card, Field, toast, confirmDialog, download } from "../ui.js";
import { importBatch, wipeCollection, list, audit, session } from "../store.js";
import { auth } from "../fb.js";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "../../vendor/firebase.js";

const COLS = [["controlli", "Controlli accettazione"], ["nc", "Non conformità"], ["ddt", "Certificati & DDT"], ["commesse", "Commesse"]];

export function Impostazioni() {
  const [seed, setSeed] = useState(null);
  const [sel, setSel] = useState({ controlli: true, nc: true, ddt: true, commesse: true });
  const [prog, setProg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ old: "", n1: "", n2: "" });

  const onFile = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j.controlli && !j.nc) throw new Error("File non riconosciuto");
      setSeed(j); toast.ok("File letto: controlla i numeri e premi Importa");
    } catch (err) { toast.err("File non valido: " + err.message); }
  };
  const importa = async () => {
    const cols = COLS.filter(([k]) => sel[k] && (seed[k] || []).length);
    if (!(await confirmDialog("Importare i dati?", `Verranno scritti ${cols.map(([k, l]) => `${seed[k].length} ${l}`).join(", ")}. I record con lo stesso ID vengono sovrascritti (nessun doppione).`, "Importa"))) return;
    setBusy(true);
    try {
      for (const [k, l] of cols) await importBatch(k, seed[k], (n) => setProg(`${l}: ${n}/${seed[k].length}`));
      audit("import", "", "", cols.map(([k]) => `${k}:${seed[k].length}`).join(" "));
      setProg("Import completato ✓"); toast.ok("Import completato");
    } catch (e) { toast.err("Import interrotto: " + (e.code || e.message)); setProg("Errore: " + (e.code || e.message)); }
    setBusy(false);
  };
  const backup = async () => {
    setBusy(true);
    try {
      const out = { format: "macepower-qc-seed", version: 1, exported_at: new Date().toISOString() };
      for (const [k] of COLS) out[k] = await list(k, { force: true });
      download(`backup_qc_${out.exported_at.slice(0, 10)}.json`, JSON.stringify(out), "application/json");
      audit("pdf_download", "", "", "backup completo JSON");
    } catch (e) { toast.err("Backup non riuscito: " + e.code); }
    setBusy(false);
  };
  const svuota = async (k, l) => {
    if (!(await confirmDialog(`Svuotare "${l}"?`, "Elimina TUTTI i record di questa sezione dal database. Fai prima un backup!", "Svuota tutto"))) return;
    if (!(await confirmDialog("Sei sicuro?", "Ultima conferma: l'operazione non si può annullare.", "Sì, svuota"))) return;
    setBusy(true); try { await wipeCollection(k); audit("delete", k, "*", "svuotata collezione"); toast.ok(l + " svuotata"); } catch (e) { toast.err(e.code); } setBusy(false);
  };
  const cambiaPw = async () => {
    if (pw.n1.length < 8) return toast.err("La nuova password deve avere almeno 8 caratteri");
    if (pw.n1 !== pw.n2) return toast.err("Le due password non coincidono");
    try {
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, pw.old));
      await updatePassword(auth.currentUser, pw.n1);
      audit("password", "", "", session.user.email); setPw({ old: "", n1: "", n2: "" }); toast.ok("Password aggiornata");
    } catch (e) { toast.err(e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" ? "Password attuale errata" : "Errore: " + e.code); }
  };

  return html`<div>
    <${PageHeader} title="Impostazioni & Import" subtitle="Caricamento dati, backup e sicurezza" />
    <div class="grid-2">
      <${Card} title="1 · Importa dati (prima volta)">
        <p class="muted small">Carica il file <b>seed-data.json</b> (controlli, NC, DDT e commesse del vecchio sito). Puoi ripetere l'import: i record con lo stesso ID vengono aggiornati, non duplicati.</p>
        <label class="btn outline"><${Icon} n="upload" /> Scegli file JSON<input type="file" accept=".json,application/json" hidden onChange=${onFile} /></label>
        ${seed && html`<div class="import-box">
          ${COLS.map(([k, l]) => html`<label class="chk"><input type="checkbox" checked=${sel[k]} onChange=${(e) => setSel({ ...sel, [k]: e.target.checked })} /> ${l}: <b>${(seed[k] || []).length}</b></label>`)}
          <small class="muted">File del ${seed.exported_at ? new Date(seed.exported_at).toLocaleString("it-IT") : "—"}</small>
          <button class="btn primary" disabled=${busy} onClick=${importa}><${Icon} n="upload" /> Importa nel database</button>
        </div>`}
        ${prog && html`<p class="mono small">${prog}</p>`}
      </${Card}>
      <${Card} title="2 · Backup">
        <p class="muted small">Scarica una copia completa (JSON) di controlli, NC, DDT e commesse. Lo stesso file si può reimportare qui sopra. Consiglio: una volta al mese.</p>
        <button class="btn outline" disabled=${busy} onClick=${backup}><${Icon} n="download" /> Scarica backup</button>
      </${Card}>
      <${Card} title="3 · Cambia la tua password">
        <div class="form-col">
          <${Field} label="Password attuale"><input type="password" class="inp" autocomplete="current-password" value=${pw.old} onInput=${(e) => setPw({ ...pw, old: e.target.value })} /></${Field}>
          <${Field} label="Nuova password (min. 8)"><input type="password" class="inp" autocomplete="new-password" value=${pw.n1} onInput=${(e) => setPw({ ...pw, n1: e.target.value })} /></${Field}>
          <${Field} label="Ripeti nuova password"><input type="password" class="inp" autocomplete="new-password" value=${pw.n2} onInput=${(e) => setPw({ ...pw, n2: e.target.value })} /></${Field}>
          <button class="btn primary" onClick=${cambiaPw}><${Icon} n="key" /> Aggiorna password</button>
          <small class="muted">La password dell'Ospite si cambia da Firebase Console → Authentication → Utenti → ⋮ → Reimposta password.</small>
        </div>
      </${Card}>
      <${Card} title="Zona pericolosa">
        <p class="muted small">Svuota una sezione (es. per rifare l'import da zero).</p>
        <div class="row-gap wrap">${COLS.map(([k, l]) => html`<button class="btn ghost danger-t sm" disabled=${busy} onClick=${() => svuota(k, l)}><${Icon} n="trash" s=${14} /> ${l}</button>`)}</div>
      </${Card}>
    </div>
  </div>`;
}
