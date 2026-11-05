import { html, useState, useEffect, toDate, isoDay, fornKey } from "../ui.js";
import { list, onDataChange } from "../store.js";
import { APP, PROVE_RIENTRO } from "../config.js";

// Carica una o più collezioni e si aggiorna quando cambiano
export function useCollections(cols) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = (force) => Promise.all(cols.map((c) => list(c, { force })))
    .then((r) => setData(Object.fromEntries(cols.map((c, i) => [c, r[i]])))).catch((e) => { console.error(e); setErr(e); setData(Object.fromEntries(cols.map((c) => [c, []]))); });
  useEffect(() => {
    load();
    return onDataChange((c) => { if (!c || cols.includes(c)) load(); });
  }, [cols.join()]);
  return [data, () => load(true), err];
}

// Ordinamento: data documento desc, poi creazione desc
export const byDateDesc = (a, b) => (b.data || "").localeCompare(a.data || "") || (b.created_at || "").localeCompare(a.created_at || "");

// Numero NC: "27/26" → {n:27, yy:26}
export function parseNum(s) {
  const m = String(s || "").match(/^\s*(\d{1,3})\s*\/\s*(\d{2}|\d{4})\s*$/);
  if (!m) return null;
  return { n: parseInt(m[1], 10), yy: parseInt(m[2].slice(-2), 10) };
}
// Prossimo numero libero nel formato usato davvero (NN/AA)
export function suggestNumero(ncs, field = "numero_report") {
  const yy = new Date().getFullYear() % 100;
  const max = ncs.map((x) => parseNum(x[field])).filter((p) => p && p.yy === yy).reduce((m, p) => Math.max(m, p.n), 0);
  return `${String(max + 1).padStart(2, "0")}/${yy}`;
}
export function numeroDuplicato(ncs, numero, selfId, field = "numero_report") {
  const k = String(numero || "").replace(/\s/g, "").toLowerCase();
  return k && ncs.some((x) => x.id !== selfId && String(x[field] || "").replace(/\s/g, "").toLowerCase() === k);
}

// Scadenza NC: data_scadenza esplicita, altrimenti data + SLA
export function scadenzaNC(n) {
  if (n.data_scadenza) return { data: n.data_scadenza, esplicita: true };
  const d = toDate(n.data); if (!d) return null;
  d.setDate(d.getDate() + APP.slaGiorni);
  return { data: isoDay(d), esplicita: false };
}
export function statoScadenza(n) {
  if (n.stato !== "aperta") return null;
  const s = scadenzaNC(n); if (!s) return null;
  const giorni = Math.round((toDate(s.data) - toDate(isoDay())) / 86400000);
  return { ...s, giorni, status: giorni < 0 ? "scaduta" : giorni <= APP.avvisoGiorni ? "in_scadenza" : "in_corso" };
}

// Elenco fornitori unificato (per suggerimenti di scrittura)
export function fornitori(rows, field = "fornitore") {
  const m = new Map();
  rows.forEach((r) => { const v = (r[field] || "").trim(); if (!v || /^\d/.test(v)) return; const k = fornKey(v); m.set(k, [...(m.get(k) || []), v]); });
  return [...m.values()].map((vs) => { const c = {}; vs.forEach((v) => (c[v] = (c[v] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; }).sort((a, b) => a.localeCompare(b));
}

// Grafico a barre semplice (SVG, niente librerie)
export function Bars({ data, color = "var(--primary)" }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return html`<div class="bars">${data.map((d) => html`<div class="bar-row" key=${d.l} title=${`${d.l}: ${d.v}`}>
    <span class="bar-l">${d.l}</span><div class="bar-t"><div class="bar-f" style=${`width:${(d.v / max) * 100}%;background:${d.c || color}`}></div></div><b class="bar-v">${d.v}</b></div>`)}</div>`;
}
export function Columns({ data, height = 150 }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return html`<div class="cols" style=${`height:${height}px`}>${data.map((d) => html`<div class="col" key=${d.l} title=${`${d.l}: ${d.v}`}>
    <span class="col-v">${d.v || ""}</span><div class="col-b" style=${`height:${(d.v / max) * 100}%;${d.c ? "background:" + d.c : ""}`}></div><span class="col-l">${d.l}</span></div>`)}</div>`;
}

// ---------- Rientri trasformatori ----------
const vals = (o) => Object.values(o || {}).map((x) => x && x.v).filter(Boolean);
export const koRientro = (r) => vals(r.prove).filter((v) => v === "ko").length;
export const collaudoFatto = (r) => !!(r.data_verifica || r.verificato_da);
export const faseRientro = (r) => (collaudoFatto(r) ? "collaudato" : vals(r.prove).length ? "in_collaudo" : "da_collaudare");
export const proveFatte = (r) => PROVE_RIENTRO.filter(([k]) => r.prove && r.prove[k] && r.prove[k].v).length;
