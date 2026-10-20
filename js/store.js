import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, writeBatch,
} from "../vendor/firebase.js";
import { db } from "./fb.js";
import { deviceInfo, netInfo } from "./device.js";

// ---------- Utente corrente ----------
export const session = { user: null, sid: null, beat: null };
export const isAdmin = () => session.user && session.user.role === "admin";

// ---------- Cache in memoria (meno letture = gratis su piano Spark) ----------
const cache = new Map();
const listeners = new Set();
export const onDataChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (col) => listeners.forEach((f) => f(col));
export const invalidate = (col) => { col ? cache.delete(col) : cache.clear(); emit(col); };

export async function list(col, { force = false } = {}) {
  if (!force && cache.has(col)) return cache.get(col);
  const snap = await getDocs(collection(db, col));
  const rows = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  cache.set(col, rows);
  return rows;
}
export async function get(col, id) {
  const c = cache.get(col);
  const hit = c && c.find((x) => x.id === id);
  if (hit) return hit;
  const s = await getDoc(doc(db, col, id));
  return s.exists() ? { ...s.data(), id: s.id } : null;
}
const stamp = () => new Date().toISOString();
function clean(o) {
  const { id, ...rest } = o;
  return JSON.parse(JSON.stringify(rest)); // via undefined, Date → string
}
export async function create(col, data, label) {
  const ref = doc(collection(db, col));
  const body = { ...clean(data), created_at: stamp(), updated_at: stamp(), created_by: session.user.email };
  await setDoc(ref, body);
  const row = { ...body, id: ref.id };
  if (cache.has(col)) cache.set(col, [row, ...cache.get(col)]);
  emit(col);
  audit("create", col, ref.id, label);
  return row;
}
export async function update(col, id, data, label) {
  const body = { ...clean(data), updated_at: stamp(), updated_by: session.user.email };
  await setDoc(doc(db, col, id), body, { merge: true });
  if (cache.has(col)) cache.set(col, cache.get(col).map((x) => (x.id === id ? { ...x, ...body, id } : x)));
  emit(col);
  audit("update", col, id, label);
}
export async function remove(col, id, label) {
  await deleteDoc(doc(db, col, id));
  if (cache.has(col)) cache.set(col, cache.get(col).filter((x) => x.id !== id));
  // elimina anche gli allegati collegati
  try {
    const s = await getDocs(query(collection(db, "allegati"), where("parent_id", "==", id)));
    await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
  } catch (e) { /* ok */ }
  emit(col);
  audit("delete", col, id, label);
}

// ---------- Audit log ----------
export function audit(action, entity, entity_id, label = "", details = "") {
  if (!session.user) return Promise.resolve();
  return addDoc(collection(db, "audit"), {
    action, entity: entity || "", entity_id: entity_id || "", label: String(label || "").slice(0, 200),
    details: String(details || "").slice(0, 500), user_email: session.user.email, user_role: session.user.role,
    ts: serverTimestamp(), sid: session.sid || "",
  }).catch(() => {});
}

// ---------- Accessi / sessioni (Console admin) ----------
export async function logAccess(evento, email, role, extra = {}) {
  const dev = deviceInfo();
  const net = await netInfo();
  const data = { evento, email: (email || "").slice(0, 120), role: role || "", ts: serverTimestamp(),
    ip: net.ip, citta: net.citta, regione: net.regione, paese: net.paese, provider: net.provider,
    dispositivo: dev.tipo, os: dev.os, browser: dev.browser, modello: dev.modello, schermo: dev.schermo,
    lingua: dev.lingua, fuso: dev.fuso, ua: dev.ua, sid: session.sid || "", ...extra };
  try { await addDoc(collection(db, "accessi"), data); } catch (e) { console.warn("log accesso", e.code); }
  return data;
}
export function startSession(user) {
  const ref = doc(collection(db, "sessioni"));
  session.sid = ref.id;
  sessionStorage.setItem("qc-sid", ref.id);
  clearInterval(session.beat);
  session.beat = setInterval(() => heartbeat(), 60000);
  const dev = deviceInfo();
  // la rete (IP) si risolve in background: l'interfaccia non aspetta
  return netInfo().then((net) => setDoc(ref, { email: user.email, role: user.role, inizio: serverTimestamp(), ultimo: serverTimestamp(),
      fine: null, pagine: 1, pagina: location.hash || "#/", ip: net.ip, citta: net.citta, provider: net.provider,
      dispositivo: dev.tipo, os: dev.os, browser: dev.browser, modello: dev.modello, schermo: dev.schermo }))
    .catch((e) => console.warn("sessione", e.code));
}
let pages = 1;
export function heartbeat(newPage) {
  if (!session.sid || !session.user) return;
  if (newPage) pages++;
  updateDoc(doc(db, "sessioni", session.sid), { ultimo: serverTimestamp(), pagina: location.hash || "#/", pagine: pages })
    .catch(() => {});
}
export async function endSession() {
  clearInterval(session.beat);
  if (session.sid) {
    try { await updateDoc(doc(db, "sessioni", session.sid), { fine: serverTimestamp(), ultimo: serverTimestamp() }); } catch (e) { }
  }
  sessionStorage.removeItem("qc-sid");
  session.sid = null;
}
export async function recentRows(col, n = 500, field = "ts") {
  const s = await getDocs(query(collection(db, col), orderBy(field, "desc"), limit(n)));
  return s.docs.map((d) => ({ ...d.data(), id: d.id }));
}

// ---------- Segnalazioni ospite (Sollecita / Nota) ----------
export async function sendSegnalazione({ tipo, entity, entity_id, entity_label, testo, autore }) {
  const dev = deviceInfo();
  await addDoc(collection(db, "segnalazioni"), {
    tipo, entity, entity_id, entity_label: String(entity_label || "").slice(0, 200),
    testo: String(testo || "").slice(0, 2000), autore: String(autore || "Ospite").slice(0, 80),
    email: session.user.email, stato: "nuova", ts: serverTimestamp(), dispositivo: dev.tipo + " · " + dev.browser,
  });
  audit(tipo === "sollecito" ? "sollecito" : "nota", entity, entity_id, entity_label, testo);
}
export function watchSegnalazioni(cb) {
  return onSnapshot(query(collection(db, "segnalazioni"), orderBy("ts", "desc"), limit(300)),
    (s) => cb(s.docs.map((d) => ({ ...d.data(), id: d.id }))), (e) => console.warn("segnalazioni", e.code));
}
export async function segnalazioniFor(entity_id) {
  const s = await getDocs(query(collection(db, "segnalazioni"), where("entity_id", "==", entity_id)));
  return s.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0));
}
export const setSegnalazione = (id, data) => updateDoc(doc(db, "segnalazioni", id), data);
export const delSegnalazione = (id) => deleteDoc(doc(db, "segnalazioni", id));

// ---------- Allegati (salvati in Firestore, niente Storage = niente piano a pagamento) ----------
export async function listAllegati(parent_id) {
  const s = await getDocs(query(collection(db, "allegati"), where("parent_id", "==", parent_id)));
  return s.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
}
export async function addAllegato(parent_type, parent_id, file) {
  const ref = await addDoc(collection(db, "allegati"), { parent_type, parent_id, ...file, created_at: stamp(), created_by: session.user.email });
  audit("allegato", parent_type, parent_id, file.name);
  return ref.id;
}
export const delAllegato = (id) => deleteDoc(doc(db, "allegati", id));

// ---------- Import massivo ----------
export async function importBatch(col, rows, onProgress) {
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const b = writeBatch(db);
    rows.slice(i, i + 200).forEach((r) => b.set(doc(db, col, String(r.id)), clean(r)));
    await b.commit();
    done += Math.min(200, rows.length - i);
    onProgress && onProgress(done);
  }
  invalidate(col);
}
export async function wipeCollection(col) {
  const s = await getDocs(collection(db, col));
  for (let i = 0; i < s.docs.length; i += 400) {
    const b = writeBatch(db);
    s.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  invalidate(col);
}
