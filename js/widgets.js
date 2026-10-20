import { html, useState, useEffect, useRef, Icon, toast, fmtDT, confirmDialog } from "./ui.js";
import { listAllegati, addAllegato, delAllegato, isAdmin } from "./store.js";
import { APP } from "./config.js";

// ================= FIRMA =================
// value = { firmatario, data, signature_data } | null
export function SignaturePad({ label, value, onChange, disabled, firmatario, onFirmatario }) {
  const cv = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef(null);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const w = c.clientWidth || 480;
    c.width = w * ratio; c.height = 150 * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, 150);
    if (value && value.signature_data) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, 150);
      img.src = value.signature_data;
    }
  }, [value && value.signature_data ? value.signature_data.length : 0]);

  const pos = (e) => {
    const r = cv.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return [p.clientX - r.left, p.clientY - r.top];
  };
  const down = (e) => { if (disabled) return; e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e) => {
    if (!drawing.current) return; e.preventDefault();
    const ctx = cv.current.getContext("2d"); const p = pos(e);
    ctx.beginPath(); ctx.moveTo(...last.current); ctx.lineTo(...p); ctx.stroke();
    last.current = p; dirty.current = true;
  };
  const up = () => {
    if (!drawing.current) return; drawing.current = false;
    if (dirty.current) {
      dirty.current = false;
      onChange({ firmatario: firmatario || (value && value.firmatario) || "", data: new Date().toISOString(),
        signature_data: cv.current.toDataURL("image/png") });
    }
  };
  const clear = () => {
    const c = cv.current, ctx = c.getContext("2d");
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.restore();
    onChange(null);
  };
  return html`<div class="sig">
    <div class="sig-h"><label>${label}</label>
      ${value && value.data && html`<span class="muted small">Firmato ${fmtDT(value.data)}${value.firmatario ? " · " + value.firmatario : ""}</span>`}</div>
    ${onFirmatario && html`<input class="inp" placeholder="Nome firmatario" value=${firmatario || ""} disabled=${disabled}
      onInput=${(e) => onFirmatario(e.target.value)} style="margin-bottom:8px" />`}
    <canvas ref=${cv} class=${"sig-canvas" + (disabled ? " off" : "")}
      onMouseDown=${down} onMouseMove=${move} onMouseUp=${up} onMouseLeave=${up}
      onTouchStart=${down} onTouchMove=${move} onTouchEnd=${up}></canvas>
    ${!disabled && html`<div class="sig-f"><span class="muted small">Firma con mouse, dito o penna</span>
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

export function openDataUrl(a) {
  const [meta, b64] = a.data.split(",");
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: a.type || meta.slice(5, -7) }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// parentId null = record nuovo: i file restano "in attesa" e si caricano al primo salvataggio (pending/onPending)
export function Allegati({ parentType, parentId, disabled, pending, onPending, legacy = [] }) {
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
        if (kb(r.data) > APP.maxAllegatoKB) { toast.err(`${f.name}: troppo grande (${kb(r.data)} KB, max ${APP.maxAllegatoKB} KB). Comprimi il PDF e riprova.`); continue; }
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
      await delAllegato(a.id); load();
    } else onPending(pending.filter((_, j) => j !== i));
  };
  const all = [...(rows || []), ...(pending || [])];
  const legacyUrl = (p) => APP.legacyFilesBase ? APP.legacyFilesBase.replace(/\/$/, "") + "/" + p : "";

  return html`<div class="allegati">
    <div class="att-h"><label>Allegati (foto / documenti)</label>
      ${!disabled && html`<label class="btn outline sm">
        <${Icon} n="paperclip" s=${14} /> ${busy ? "Caricamento…" : "Allega file"}
        <input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange=${onFiles} hidden />
      </label>`}</div>
    ${rows === null ? html`<span class="muted small">Caricamento allegati…</span>` :
      all.length === 0 && !legacy.length ? html`<span class="muted small">Nessun allegato.</span>` : null}
    <div class="att-grid">
      ${all.map((a, i) => html`<div class="att" key=${a.id || "p" + i}>
        ${a.type && a.type.startsWith("image/")
          ? html`<img src=${a.data} alt=${a.name} onClick=${() => setPreview(a)} />`
          : html`<div class="att-file" onClick=${() => openDataUrl(a)}><${Icon} n="file" s=${28} /><span>${(a.name.split(".").pop() || "").toUpperCase()}</span></div>`}
        <div class="att-n" title=${a.name}>${a.name}</div>
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
