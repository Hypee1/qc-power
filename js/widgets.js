import { html, useState, useEffect, useRef, Icon, toast, fmtDT, confirmDialog } from "./ui.js";
import { listAllegati, addAllegato, delAllegato, allegatoData, isAdmin } from "./store.js";
import { APP } from "./config.js";

// ================= FIRMA =================
// value = { firmatario, data, signature_data } | null
// La firma viene salvata RITAGLIATA (solo il tratto, sfondo trasparente) così non si deforma
// né sullo schermo né nel PDF: viene sempre disegnata mantenendo le proporzioni.
const SIG_H = 170;

// Ritaglia un'immagine di firma al solo tratto (funziona anche con le vecchie firme a sfondo bianco)
export async function trimSignature(dataUrl, pad = 6) {
  const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = dataUrl; });
  if (!img || !img.width) return null;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    if (data[i + 3] > 20 && (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const o = document.createElement("canvas"); o.width = w; o.height = h;
  const octx = o.getContext("2d");
  // Copia solo i pixel di inchiostro: lo sfondo bianco delle vecchie firme diventa trasparente
  const src = ctx.getImageData(x0, y0, w, h), d = src.data;
  for (let i = 0; i < d.length; i += 4) { const lum = (d[i] + d[i + 1] + d[i + 2]) / 3; if (d[i + 3] > 0 && lum > 215) d[i + 3] = 0; }
  octx.putImageData(src, 0, 0);
  return { data: o.toDataURL("image/png"), w, h };
}

// Disegna un'immagine "contenuta" in un riquadro, centrata, senza deformarla
function drawContain(ctx, img, W, H, padd = 8) {
  const k = Math.min((W - padd * 2) / img.width, (H - padd * 2) / img.height, 2.5);
  const w = img.width * k, h = img.height * k;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

export function SignaturePad({ label, value, onChange, disabled, firmatario, onFirmatario }) {
  const cv = useRef(null);
  const st = useRef({ drawing: false, dirty: false, pts: [], w: 0 });
  const sig = value && value.signature_data;

  // Prepara il canvas alla larghezza reale (anche quando la finestra cambia) e ridisegna la firma salvata
  const setup = () => {
    const c = cv.current; if (!c) return;
    const w = c.clientWidth; if (!w) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    st.current.w = w;
    c.width = Math.round(w * ratio); c.height = Math.round(SIG_H * ratio);
    const ctx = c.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, SIG_H);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0b1f4d"; ctx.fillStyle = "#0b1f4d";
    if (sig) { const img = new Image(); img.onload = () => drawContain(ctx, img, w, SIG_H); img.src = sig; }
  };
  st.current.setup = setup;
  useEffect(() => {
    const c = cv.current; if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (cv.current && Math.abs(cv.current.clientWidth - st.current.w) > 2 && !st.current.drawing) st.current.setup(); });
    ro.observe(c); return () => ro.disconnect();
  }, []);
  // Ridisegna quando arriva una firma "da fuori" (caricamento, cancellazione), non dopo ogni tratto
  useEffect(() => { if (!sig || sig !== st.current.own) setup(); }, [sig]);

  const pos = (e) => { const r = cv.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure > 0 && e.pointerType === "pen" ? e.pressure : 0.5 }; };
  const width = (p) => 1.6 + p * 2.2;
  const down = (e) => {
    if (disabled) return; e.preventDefault();
    try { cv.current.setPointerCapture(e.pointerId); } catch (x) { }
    const s = st.current; s.drawing = true; const p = pos(e); s.pts = [p];
    const ctx = cv.current.getContext("2d"); ctx.beginPath(); ctx.arc(p.x, p.y, width(p.p) / 2, 0, Math.PI * 2); ctx.fill(); s.dirty = true;
  };
  const move = (e) => {
    const s = st.current; if (!s.drawing) return; e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const ctx = cv.current.getContext("2d");
    for (const ev of evs.length ? evs : [e]) {
      const p = pos(ev); const pts = s.pts; pts.push(p);
      if (pts.length < 3) continue;
      // curva morbida: dal punto medio precedente al punto medio attuale
      const a = pts[pts.length - 3], b = pts[pts.length - 2], c = pts[pts.length - 1];
      ctx.lineWidth = width(b.p);
      ctx.beginPath(); ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2); ctx.stroke();
    }
    s.dirty = true;
  };
  const up = async () => {
    const s = st.current; if (!s.drawing) return; s.drawing = false;
    if (s.pts.length === 2) { const ctx = cv.current.getContext("2d"); const [a, b] = s.pts; ctx.lineWidth = width(a.p); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    s.pts = [];
    if (!s.dirty) return; s.dirty = false;
    const t = await trimSignature(cv.current.toDataURL("image/png"), 10);
    if (!t) return;
    st.current.own = t.data;
    onChange({ firmatario: firmatario || (value && value.firmatario) || "", data: new Date().toISOString(), signature_data: t.data, w: t.w, h: t.h });
  };
  const clear = () => {
    const c = cv.current; c.getContext("2d").clearRect(0, 0, c.width, c.height);
    onChange(null);
  };
  return html`<div class="sig">
    <div class="sig-h"><label>${label}</label>
      ${value && value.data && html`<span class="muted small">Firmato ${fmtDT(value.data)}${value.firmatario ? " · " + value.firmatario : ""}</span>`}</div>
    ${onFirmatario && html`<input class="inp" placeholder="Nome firmatario" value=${firmatario || ""} disabled=${disabled}
      onInput=${(e) => onFirmatario(e.target.value)} style="margin-bottom:8px" />`}
    <div class="sig-box">
      <canvas ref=${cv} class=${"sig-canvas" + (disabled ? " off" : "")} style=${`height:${SIG_H}px`}
        onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onLostPointerCapture=${up}></canvas>
      ${!disabled && !sig && html`<span class="sig-ph">Firma qui</span>`}
      <i class="sig-line"></i>
    </div>
    ${!disabled && html`<div class="sig-f"><span class="muted small">Firma con mouse, dito o penna · la firma viene ritagliata e non si deforma nel PDF</span>
      <button type="button" class="btn ghost sm" onClick=${clear}><${Icon} n="trash" s=${14} /> Cancella firma</button></div>`}
  </div>`;
}

// ================= ALLEGATI =================
async function readFile(file) {
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  if (!file.type.startsWith("image/") || file.type === "image/gif") return { name: file.name, type: file.type, data: dataUrl };
  // Comprime le foto (max 1600px, JPEG 80%) per stare nei limiti di Firestore
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  let q = 0.8, out = c.toDataURL("image/jpeg", q);
  while (out.length * 0.75 > APP.maxAllegatoKB * 1024 && q > 0.35) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
  return { name: file.name.replace(/\.\w+$/, "") + ".jpg", type: "image/jpeg", data: out };
}
const kb = (dataUrl) => Math.round((dataUrl.length * 0.75) / 1024);

export async function openDataUrl(a) {
  const w = window.open("", "_blank");
  let data = a.data;
  try { data = await allegatoData(a); } catch (e) { toast.err("Apertura non riuscita"); w && w.close(); return; }
  const [meta, b64] = data.split(",");
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: a.type || meta.slice(5, -7) }));
  if (w) w.location.href = url; else window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// parentId null = record nuovo: i file restano "in attesa" e si caricano al primo salvataggio (pending/onPending)
export function Allegati({ parentType, parentId, disabled, pending, onPending, legacy = [], label = "Allegati (foto / documenti)", accept = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt", btn = "Allega file" }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const load = () => parentId ? listAllegati(parentId).then(setRows).catch(() => setRows([])) : setRows([]);
  useEffect(() => { load(); }, [parentId]);

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        const r = await readFile(f);
        const isImg = r.type.startsWith("image/");
        const max = isImg ? APP.maxAllegatoKB : APP.maxFileMB * 1024;
        if (kb(r.data) > max) { toast.err(`${f.name}: troppo grande (${kb(r.data)} KB, max ${isImg ? max + " KB" : APP.maxFileMB + " MB"}). Comprimi il file e riprova.`); continue; }
        if (parentId) await addAllegato(parentType, parentId, { ...r, size_kb: kb(r.data) });
        else onPending && onPending([...(pending || []), { ...r, size_kb: kb(r.data) }]);
      }
      if (parentId) { await load(); toast.ok("Allegato caricato"); }
    } catch (err) { toast.err("Caricamento non riuscito: " + (err.code || err.message)); }
    setBusy(false);
  };
  const del = async (a, i) => {
    if (a.id) {
      if (!(await confirmDialog("Eliminare l'allegato?", a.name))) return;
      await delAllegato(a.id, a.parts); load();
    } else onPending(pending.filter((_, j) => j !== i));
  };
  const all = [...(rows || []), ...(pending || [])];
  const legacyUrl = (p) => APP.legacyFilesBase ? APP.legacyFilesBase.replace(/\/$/, "") + "/" + p : "";

  return html`<div class="allegati">
    <div class="att-h"><label>${label}</label>
      ${!disabled && html`<label class="btn outline sm">
        <${Icon} n="paperclip" s=${14} /> ${busy ? "Caricamento…" : btn}
        <input type="file" multiple accept=${accept} onChange=${onFiles} hidden />
      </label>`}</div>
    ${rows === null ? html`<span class="muted small">Caricamento allegati…</span>` :
      all.length === 0 && !legacy.length ? html`<span class="muted small">Nessun allegato.</span>` : null}
    <div class="att-grid">
      ${all.map((a, i) => html`<div class="att" key=${a.id || "p" + i}>
        ${a.type && a.type.startsWith("image/")
          ? html`<img src=${a.data} alt=${a.name} onClick=${() => setPreview(a)} />`
          : html`<div class="att-file" onClick=${() => openDataUrl(a)}><${Icon} n="file" s=${28} /><span>${(a.name.split(".").pop() || "").toUpperCase()}</span></div>`}
        <div class="att-n" title=${a.name}>${a.name}${a.size_kb ? html` <span class="muted">· ${a.size_kb > 1024 ? (a.size_kb / 1024).toFixed(1) + " MB" : a.size_kb + " KB"}</span>` : ""}</div>
        <div class="att-a">
          <button type="button" class="btn ghost icon sm" title="Apri" onClick=${() => openDataUrl(a)}><${Icon} n="eye" s=${14} /></button>
          ${!a.id && html`<span class="badge b-amber">da salvare</span>`}
          ${!disabled && html`<button type="button" class="btn ghost icon sm" title="Rimuovi" onClick=${() => del(a, i - (rows || []).length)}><${Icon} n="trash" s=${14} /></button>`}
        </div></div>`)}
    </div>
    ${legacy.length > 0 && html`<details class="legacy-att"><summary>${legacy.length} allegati del vecchio gestionale (solo riferimento)</summary>
      <ul>${legacy.map((l) => html`<li>${legacyUrl(l.percorso) ? html`<a href=${legacyUrl(l.percorso)} target="_blank" rel="noopener">${l.nome}</a>` : l.nome}
        <span class="muted small"> · ${l.data || ""}</span></li>`)}</ul></details>`}
    ${preview && html`<div class="lightbox" onClick=${() => setPreview(null)}><img src=${preview.data} alt=${preview.name} /></div>`}
  </div>`;
}

export async function flushPending(parentType, parentId, pending) {
  for (const p of pending || []) await addAllegato(parentType, parentId, p);
}
