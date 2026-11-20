// ============================================================
//  PROTEZIONI LATO SITO
//  (la serratura vera è in firestore.rules: queste sono le "porte blindate" del browser)
// ============================================================

// 1) Anti-clickjacking: il sito non può essere caricato dentro la pagina di un altro sito
//    (trucco per farti cliccare su pulsanti nascosti). GitHub Pages non permette l'header
//    X-Frame-Options, quindi lo facciamo da qui.
export function antiFrame() {
  if (window.top !== window.self || !document.documentElement.classList.contains("ok-frame")) {
    document.documentElement.innerHTML = "";
    try { window.top.location = window.self.location.href; } catch (e) { }
    throw new Error("Il sito non può essere aperto dentro un'altra pagina.");
  }
}

// 2) Avviso in console contro chi ti dice "incolla questo codice qui" (furto di sessione)
export function consoleWarning() {
  try {
    console.log("%cSTOP!", "color:#dc2626;font:800 46px sans-serif");
    console.log("%cQuesta è una funzione per sviluppatori. Se qualcuno ti ha detto di copiare e incollare qualcosa qui, è un tentativo di rubare l'accesso al sistema qualità MACE POWER.", "font:600 15px sans-serif");
  } catch (e) { }
}

// 3) Blocco tentativi di login: resiste anche se ricarichi la pagina.
//    5 errori → 1 minuto, poi 5 minuti, poi 15, poi 60.
const LK = "qc-lock";
const read = () => { try { return JSON.parse(localStorage.getItem(LK) || "{}"); } catch (e) { return {}; } };
const write = (v) => { try { localStorage.setItem(LK, JSON.stringify(v)); } catch (e) { } };
export function loginLocked() { const s = read(); return s.until && Date.now() < s.until ? s.until : 0; }
export function loginFailed() {
  const s = read(); s.fails = (s.fails || 0) + 1;
  if (s.fails % 5 === 0) { const step = Math.min(3, s.fails / 5 - 1); s.until = Date.now() + [1, 5, 15, 60][step] * 60000; }
  write(s); return s.until && Date.now() < s.until ? s.until : 0;
}
export function loginOk() { write({}); }

// 4) Durata massima della sessione: 12 ore dal login, poi si rientra (come nelle regole del database)
export const MAX_SESSION_H = 12;
export async function sessioneScaduta(user) {
  try {
    const t = await user.getIdTokenResult();
    const auth = new Date(t.authTime).getTime();
    return !isNaN(auth) && Date.now() - auth > MAX_SESSION_H * 3600000 - 5 * 60000;
  } catch (e) { return false; }
}

// 5) Allegati: solo tipi di file sicuri, controllando i primi byte (non basta il nome del file)
export const TIPI_OK = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/gif": ["gif"],
  "application/pdf": ["pdf"], "text/plain": ["txt"],
  "application/msword": ["doc"], "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};
export function mimeDaNome(name) {
  const ext = String(name || "").toLowerCase().split(".").pop();
  return Object.keys(TIPI_OK).find((m) => TIPI_OK[m].includes(ext)) || "";
}
// Firma iniziale dei file (magic bytes): un .exe rinominato in .pdf viene scartato
const MAGIC = {
  "image/jpeg": [[0xff, 0xd8, 0xff]], "image/png": [[0x89, 0x50, 0x4e, 0x47]], "image/gif": [[0x47, 0x49, 0x46, 0x38]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
  "application/msword": [[0xd0, 0xcf, 0x11, 0xe0]], "application/vnd.ms-excel": [[0xd0, 0xcf, 0x11, 0xe0]],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [[0x50, 0x4b, 0x03, 0x04]],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [[0x50, 0x4b, 0x03, 0x04]],
};
export async function verificaFile(file) {
  const tipo = TIPI_OK[file.type] ? file.type : mimeDaNome(file.name);
  if (!tipo) return { ok: false, motivo: "tipo di file non ammesso (solo foto, PDF, Word, Excel, testo)" };
  const ext = String(file.name).toLowerCase().split(".").pop();
  if (!TIPI_OK[tipo].includes(ext)) return { ok: false, motivo: "estensione non coerente con il contenuto" };
  if (/\.(exe|js|html?|svg|bat|cmd|ps1|vbs|jar|msi|scr|hta|lnk)(\.|$)/i.test(file.name)) return { ok: false, motivo: "nome file sospetto (doppia estensione)" };
  const sig = MAGIC[tipo];
  if (sig) {
    const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (!sig.some((s) => s.every((v, i) => b[i] === v))) return { ok: false, motivo: "il contenuto non corrisponde al tipo dichiarato" };
  }
  return { ok: true, tipo };
}
// Quali file si possono aprire in anteprima nel browser (gli altri vengono solo scaricati)
export const APRIBILE = (t) => ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "text/plain"].includes(t);

// 6) Export CSV/Excel: una cella che inizia con = + - @ può diventare una formula
//    pericolosa quando apri il file in Excel ("CSV injection"). La neutralizziamo.
export function cellaSicura(v) {
  const s = String(v ?? "");
  return /^[=+@\t\r]/.test(s) || /^-[^\d.,\s]/.test(s) ? "'" + s : s;
}

// 7) Password: almeno 12 caratteri con lettere, numeri e un simbolo
export function controllaPassword(pw, email = "") {
  if (pw.length < 12) return "almeno 12 caratteri";
  if (!/[a-zà-ù]/i.test(pw) || !/\d/.test(pw)) return "servono lettere e numeri";
  if (!/[^a-z0-9]/i.test(pw)) return "serve almeno un simbolo (es. ! ? # @ -)";
  if (/(.)\1\1\1/.test(pw)) return "troppi caratteri ripetuti";
  const low = pw.toLowerCase();
  if (["password", "macepower", "mace", "qualita", "admin", "ospite", "123456", "qwerty"].some((w) => low.includes(w))) return "non usare parole facili (mace, admin, password…)";
  if (email && low.includes(email.split("@")[0].toLowerCase())) return "non usare il nome utente nella password";
  return "";
}

// 8) Import JSON: solo record "puliti" (niente percorsi strani negli ID, niente campi speciali)
export function pulisciRecord(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const id = String(r.id ?? "").trim();
  if (!id || id.length > 120 || /[\/\\]|^\.\.?$|^__.*__$/.test(id)) return null;
  const out = {};
  for (const [k, v] of Object.entries(r)) if (!/^__|^(constructor|prototype)$/.test(k)) out[k] = v;
  out.id = id;
  return out;
}
