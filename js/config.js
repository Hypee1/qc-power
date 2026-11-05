// ============================================================
//  CONFIGURAZIONE — l'unico file che (forse) dovrai toccare
// ============================================================

// Configurazione Firebase (progetto "controllo-quality").
// NB: questi valori NON sono segreti: la protezione vera la fanno
// Firebase Authentication + le regole Firestore (firestore.rules).
export const firebaseConfig = {
  apiKey: "AIzaSyBV3D0h1xmenV7HILvE0Kw2qySSDmuqGWo",
  authDomain: "controllo-quality.firebaseapp.com",
  projectId: "controllo-quality",
  storageBucket: "controllo-quality.firebasestorage.app",
  messagingSenderId: "1035937087737",
  appId: "1:1035937087737:web:379ebab5ef799638a26228",
  measurementId: "G-M5EE62F6T6",
};

// I due account da creare in Firebase Console → Authentication → Utenti.
// Se cambi queste email, cambiale anche in firestore.rules (stesse identiche).
export const ACCOUNTS = {
  admin: { email: "admin@macepower.qc", label: "Biagio", sub: "Amministratore", role: "admin" },
  guest: { email: "ospite@macepower.qc", label: "Ospite", sub: "Sola consultazione", role: "ospite" },
};

export const APP = {
  nome: "MACE POWER",
  sotto: "QUALITY CONTROL",
  slaGiorni: 30,          // scadenza NC: 30 giorni dall'apertura (se non c'è una data scadenza esplicita)
  avvisoGiorni: 7,        // "in scadenza" quando mancano ≤ 7 giorni
  maxAllegatoKB: 700,     // dimensione massima di un file allegato (dopo compressione immagini)
  // Base URL dei vecchi file su Altervista (allegati legacy). Lascia "" se non più disponibili.
  legacyFilesBase: "",
};

export const PERCORSI = {
  carpenteria: ["Cassa", "Coperchio", "Conservatore", "Muffola AT", "Muffola BT"],
  produzione: ["Filo / Piattina / Nastro", "Tapparella", "Carta diamantata", "Nucleo", "Controllo libero"],
};

export const ORIGINI_NC = ["Accettazione", "Processo", "Collaudo", "Reclamo Cliente", "Reclamo Fornitore", "Altro"];
export const CLASSIFICAZIONI = [
  { v: "RF", l: "RF — Reclamo a Fornitore" },
  { v: "NC", l: "NC — Non Conformità interna" },
  { v: "RC", l: "RC — Reclamo Cliente" },
];
export const TRATTAMENTI = ["accettato", "rifiutato", "rilavorato", "scartato", "altro"];
export const ND = "Ancora non definito";

// ---------- Rientri trasformatori (Mod. MAC PA4190/1) ----------
export const GARANZIA = [{ v: "si", l: "Sì, in garanzia" }, { v: "no", l: "No" }, { v: "da_valutare", l: "Da valutare" }];
export const ACCESSORI_RIENTRO = [
  ["conservatore", "Conservatore d'olio"], ["essiccatore", "Essiccatore"], ["buchholz", "Relè Buchholz"], ["termometro", "Termometro"],
  ["livello_olio", "Indicatore livello olio"], ["dgpt2", "DGPT2"], ["pt100", "Sonde PT100"], ["bulloneria_mt", "Bulloneria MT"],
  ["bulloneria_bt", "Bulloneria BT"], ["banderuole", "Banderuole"], ["ruote", "Ruote"], ["cassetta_ausiliari", "Cassetta ausiliari"],
  ["cert_olio", "Certificato olio"], ["cert_collaudo", "Certificato di collaudo"], ["altro", "Altro"],
];
export const PROVE_RIENTRO = [
  ["tensione_applicata", "Isolamento a tensione applicata"], ["tensione_indotta", "Isolamento a tensione indotta"], ["vuoto", "Prova a vuoto"],
  ["cortocircuito", "Verifica elettrica in cortocircuito"], ["rapporto", "Verifica rapporto di trasformazione"],
  ["resistenza", "Misura resistenza avvolgimenti"], ["rigidita_olio", "Rigidità dielettrica su campione olio"], ["altro", "Altro"],
];
export const LAVORI_RIENTRO = [["manutenzione", "Manutenzione"], ["riparazione", "Riparazione"], ["rottamazione", "Rottamazione"]];
