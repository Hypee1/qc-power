import { html, render, useState, useEffect, useRef, useMemo, useCallback } from "../vendor/preact-htm.js";
export { html, render, useState, useEffect, useRef, useMemo, useCallback };

// ---------- Icone (stile lucide, tratto 2) ----------
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  box: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  next: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  note: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  bolt: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
};
export function Icon({ n, s = 16, cls = "" }) {
  return html`<svg class=${"ic " + cls} width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML=${{ __html: P[n] || "" }}></svg>`;
}

// ---------- Badge stato ----------
const BADGE = {
  aperta: ["Aperta", "red"], chiusa: ["Chiusa", "green"], bozza: ["Bozza", "zinc"], completato: ["Completato", "green"],
  conforme: ["Conforme", "green"], non_conforme: ["Non conforme", "red"], con_riserva: ["Con riserva", "amber"],
  PASS: ["PASS", "green"], FAIL: ["FAIL", "red"], scaduta: ["Scaduta", "red"], in_scadenza: ["In scadenza", "amber"],
  in_corso: ["In corso", "blue"], ddt: ["DDT", "blue"], certificato: ["Certificato", "violet"],
  nuova: ["Nuova", "red"], letta: ["Letta", "amber"], risolta: ["Risolta", "green"],
  sollecito: ["Sollecito", "red"], nota: ["Nota", "blue"], admin: ["Admin", "red"], ospite: ["Ospite", "blue"],
};
export function Badge({ v, label }) {
  if (!v) return html`<span class="muted">—</span>`;
  const [l, c] = BADGE[v] || [v, "zinc"];
  return html`<span class=${"badge b-" + c}>${label || l}</span>`;
}

// ---------- Toast ----------
let pushToast = () => {};
export const toast = {
  ok: (m) => pushToast(m, "ok"), err: (m) => pushToast(m, "err"), info: (m) => pushToast(m, "info"),
};
export function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    pushToast = (m, t) => {
      const id = Math.random();
      setList((l) => [...l, { id, m, t }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t === "err" ? 5000 : 2600);
    };
  }, []);
  return html`<div class="toasts">${list.map((x) => html`<div key=${x.id} class=${"toast t-" + x.t}>
    <${Icon} n=${x.t === "err" ? "xCircle" : x.t === "ok" ? "checkCircle" : "bell"} />${x.m}</div>`)}</div>`;
}

// ---------- Modali ----------
export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open]);
  if (!open) return null;
  return html`<div class="modal-bg" onClick=${(e) => e.target === e.currentTarget && onClose && onClose()}>
    <div class=${"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true">
      <div class="modal-h"><h3>${title}</h3><button class="btn ghost icon" onClick=${onClose} aria-label="Chiudi"><${Icon} n="x" /></button></div>
      <div class="modal-b">${children}</div>
      ${footer && html`<div class="modal-f">${footer}</div>`}
    </div></div>`;
}
let askConfirm = null;
export function confirmDialog(title, text, okLabel = "Elimina") {
  return new Promise((res) => askConfirm && askConfirm({ title, text, okLabel, res }));
}
export function ConfirmHost() {
  const [st, setSt] = useState(null);
  useEffect(() => { askConfirm = setSt; }, []);
  if (!st) return null;
  const close = (v) => { st.res(v); setSt(null); };
  return html`<${Modal} open title=${st.title} onClose=${() => close(false)}
    footer=${html`<button class="btn outline" onClick=${() => close(false)}>Annulla</button>
      <button class="btn danger" onClick=${() => close(true)}>${st.okLabel}</button>`}>
    <p class="muted">${st.text}</p></${Modal}>`;
}

// ---------- Layout ----------
export function PageHeader({ title, subtitle, children }) {
  return html`<div class="page-h"><div><h1>${title}</h1>${subtitle && html`<p class="sub">${subtitle}</p>`}</div>
    <div class="page-actions">${children}</div></div>`;
}
export const Card = ({ children, cls = "", title, right }) =>
  html`<section class=${"card " + cls}>${title && html`<div class="card-h"><h3>${title}</h3>${right}</div>`}${children}</section>`;
export const Field = ({ label, children, full, hint }) =>
  html`<div class=${"field" + (full ? " full" : "")}><label>${label}</label>${children}${hint && html`<small class="hint">${hint}</small>`}</div>`;
export const Spinner = () => html`<div class="spin-wrap"><span class="spin"></span></div>`;
export const Empty = ({ text = "Nessun dato.", icon = "archive" }) =>
  html`<div class="empty"><${Icon} n=${icon} s=${28} /><span>${text}</span></div>`;

export function Select({ value, onChange, options, placeholder = "Seleziona…", disabled, id }) {
  return html`<select id=${id} class="inp" value=${value || ""} disabled=${disabled} onChange=${(e) => onChange(e.target.value)}>
    <option value="">${placeholder}</option>
    ${options.map((o) => typeof o === "string" ? html`<option value=${o} selected=${value === o}>${o}</option>` : html`<option value=${o.v} selected=${value === o.v}>${o.l}</option>`)}
  </select>`;
}

// ---------- Formattazione ----------
export const pad = (n) => String(n).padStart(2, "0");
export function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (typeof v === "object" && "seconds" in v) return new Date(v.seconds * 1000);
  const d = new Date(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T00:00:00" : v);
  return isNaN(d) ? null : d;
}
export function fmtDate(v) {
  const d = toDate(v); if (!d) return v ? String(v) : "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function fmtDT(v) {
  const d = toDate(v); if (!d) return "—";
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtTime(v) {
  const d = toDate(v); if (!d) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function ago(v) {
  const d = toDate(v); if (!d) return "—";
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return "adesso";
  if (s < 3600) return Math.floor(s / 60) + " min fa";
  if (s < 86400) return Math.floor(s / 3600) + " h fa";
  return Math.floor(s / 86400) + " gg fa";
}
export const num = (s) => {
  if (s === null || s === undefined || s === "") return NaN;
  return parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
};
// Esito automatico di una quota: |misurato - teorico| ≤ tolleranza. Senza tolleranza → n.d. (non FAIL)
export function calcEsito(q) {
  const t = num(q.valore_teorico), m = num(q.valore_misurato), tol = num(q.tolleranza);
  if (isNaN(t) || isNaN(m) || isNaN(tol)) return q.esito_manuale || "";
  return Math.abs(m - t) <= Math.abs(tol) + 1e-9 ? "PASS" : "FAIL";
}
export function fmtNum(s) {
  const n = num(s); if (isNaN(n)) return s || "";
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Unifica le varianti dello stesso fornitore ("FORTY METAL" / "Forty Metal")
export const fornKey = (s) => norm(s).replace(/[^a-z0-9]/g, "").replace(/(srl|spa|sas|snc|ltd|co)$/g, "");
export const shortId = (id) => String(id || "").slice(-6);
export function download(name, content, type = "text/plain") {
  const b = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
export function csv(rows) {
  return "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
}
export const go = (path) => { location.hash = "#" + path; };
