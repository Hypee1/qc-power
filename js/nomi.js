import { html, useState, useEffect, useRef, Icon, fornKey, norm } from "./ui.js";
import { list, create, onDataChange } from "./store.js";

// ============================================================
//  ANAGRAFICA FORNITORI / CLIENTI / CONTROPARTI
//  Ogni nome ha una "chiave" (fornKey): minuscole, senza spazi/punti/accenti
//  e senza "srl/spa…". Quindi "Tecnosteel", "TECNOSTEEL" e "Tecno Steel S.r.l."
//  sono lo STESSO soggetto: nei suggerimenti compare una volta sola e,
//  se lo scrivi in un altro modo, viene uniformato al nome ufficiale.
// ============================================================

// Dove vengono usati i nomi (collezione, campo, tipo)
export const FONTI = [
  ["controlli", "fornitore", "fornitore"],
  ["nc", "controparte", "controparte"],
  ["audit_clienti", "cliente", "cliente"],
  ["audit_clienti", "cliente_finale", "cliente"],
  ["richieste", "fornitore", "fornitore"],
];
export const TIPI_SOGGETTO = [{ v: "fornitore", l: "Fornitore" }, { v: "cliente", l: "Cliente" }, { v: "controparte", l: "Fornitore / Cliente" }];

// Grafia "migliore" tra le varianti: la più usata; a parità, quella scritta normalmente
// (iniziale maiuscola, non TUTTO MAIUSCOLO né tutto minuscolo) e la più corta (senza S.r.l.)
export function bestName(varianti) {
  const bella = (v) => (/^[A-ZÀ-Ý0-9]/.test(v) && v !== v.toUpperCase() ? 0 : v === v.toUpperCase() ? 1 : 2);
  return Object.entries(varianti).sort((a, b) => b[1] - a[1] || bella(a[0]) - bella(b[0]) || a[0].length - b[0].length)[0][0];
}
export function tipiLabel(tipi) {
  const t = [...tipi];
  const show = t.length > 1 ? t.filter((x) => x !== "controparte") : t;
  return show.map((x) => (TIPI_SOGGETTO.find((y) => y.v === x) || {}).l || x).join(" · ");
}

// Indice: chiave → { nome ufficiale, tipi, usi, id anagrafica }
export async function indiceNomi() {
  const [sog, ...src] = await Promise.all([list("soggetti").catch(() => []), ...FONTI.map(([c]) => list(c).catch(() => []))]);
  const m = new Map();
  const add = (nome, tipo, n = 1) => {
    const v = String(nome || "").trim(); if (!v || /^\d/.test(v)) return;
    const k = fornKey(v); if (!k) return;
    const e = m.get(k) || { key: k, nome: "", varianti: {}, tipi: new Set(), usi: 0, id: null };
    e.varianti[v] = (e.varianti[v] || 0) + n; e.tipi.add(tipo); e.usi += n; m.set(k, e);
  };
  FONTI.forEach(([, f, tipo], i) => src[i].forEach((r) => add(r[f], tipo)));
  sog.forEach((s) => {
    const k = fornKey(s.nome); if (!k) return;
    const e = m.get(k) || { key: k, varianti: {}, tipi: new Set(), usi: 0 };
    e.id = s.id; e.nome = s.nome; e.tipo = s.tipo; if (s.tipo) e.tipi.add(s.tipo); e.note = s.note || ""; m.set(k, e);
  });
  // Senza anagrafica, il nome ufficiale è la grafia più usata
  m.forEach((e) => { if (!e.nome) e.nome = bestName(e.varianti); });
  return m;
}

// Restituisce il nome ufficiale se il soggetto esiste già (altrimenti il testo ripulito)
export function canonico(idx, v) {
  const t = String(v || "").trim().replace(/\s+/g, " ");
  const e = t && idx.get(fornKey(t));
  return e ? e.nome : t;
}

// Da chiamare al salvataggio: se il nome è nuovo lo aggiunge all'anagrafica
export async function registraNomi(pairs) {
  let idx;
  for (const [nome, tipo] of pairs) {
    const v = String(nome || "").trim(); if (!v) continue;
    idx = idx || (await indiceNomi());
    const e = idx.get(fornKey(v));
    if (e && e.id) continue;
    try {
      const r = await create("soggetti", { nome: e ? e.nome : v, tipo }, e ? e.nome : v);
      idx.set(fornKey(v), { key: fornKey(v), nome: r.nome, varianti: {}, tipi: new Set([tipo]), usi: 0, id: r.id });
    } catch (x) { /* non bloccare il salvataggio */ }
  }
}

export function useIndiceNomi() {
  const [idx, setIdx] = useState(new Map());
  useEffect(() => {
    const load = () => indiceNomi().then(setIdx).catch(() => {});
    load();
    return onDataChange((c) => { if (!c || c === "soggetti" || FONTI.some(([x]) => x === c)) load(); });
  }, []);
  return idx;
}

// Campo con suggerimenti: scrivi 2 lettere → elenco dei soggetti già usati (con quante volte).
// Uscendo dal campo, una grafia diversa dello stesso soggetto viene sostituita col nome ufficiale.
export function NomeInput({ value, onChange, tipo, disabled, placeholder = "Scrivi o scegli…", id }) {
  const idx = useIndiceNomi();
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [msg, setMsg] = useState("");
  const box = useRef(null);
  const v = value || "";
  const nq = norm(v), kq = fornKey(v);
  const all = [...idx.values()];
  const sugg = all
    .filter((e) => !nq || norm(e.nome).includes(nq) || e.key.includes(kq) || Object.keys(e.varianti).some((x) => norm(x).includes(nq)))
    .sort((a, b) => (tipo && a.tipi.has(tipo) ? 0 : 1) - (tipo && b.tipi.has(tipo) ? 0 : 1) || (norm(a.nome).startsWith(nq) ? 0 : 1) - (norm(b.nome).startsWith(nq) ? 0 : 1) || b.usi - a.usi || a.nome.localeCompare(b.nome))
    .slice(0, 8);
  const esiste = kq && idx.get(kq);

  const pick = (nome) => { onChange(nome); setOpen(false); setMsg(""); };
  const blur = () => setTimeout(() => {
    if (box.current && box.current.contains(document.activeElement)) return;
    setOpen(false);
    const c = canonico(idx, v);
    if (c && c !== v) { onChange(c); setMsg(`Uniformato a «${c}» (stesso soggetto)`); }
    else if (v.trim() && v !== v.trim().replace(/\s+/g, " ")) onChange(v.trim().replace(/\s+/g, " "));
  }, 120);
  const key = (e) => {
    if (!open && (e.key === "ArrowDown")) { setOpen(true); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((hi + 1) % Math.max(1, sugg.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((hi - 1 + sugg.length) % Math.max(1, sugg.length)); }
    else if (e.key === "Enter" && sugg[hi]) { e.preventDefault(); pick(sugg[hi].nome); }
    else if (e.key === "Escape") setOpen(false);
  };
  return html`<div class="ac" ref=${box}>
    <input id=${id} class="inp" autocomplete="off" placeholder=${placeholder} value=${v} disabled=${disabled}
      onFocus=${() => { setOpen(true); setHi(0); }} onBlur=${blur} onKeyDown=${key}
      onInput=${(e) => { onChange(e.target.value); setOpen(true); setHi(0); setMsg(""); }} />
    ${open && !disabled && sugg.length > 0 && html`<div class="ac-list">
      ${sugg.map((e, i) => html`<button type="button" tabIndex="-1" key=${e.key} class=${"ac-it" + (i === hi ? " on" : "")} onMouseDown=${(ev) => ev.preventDefault()} onClick=${() => pick(e.nome)}>
        <span>${e.nome}</span><small>${tipiLabel(e.tipi)}${e.usi ? ` · ${e.usi} registrazioni` : " · in anagrafica"}</small></button>`)}
    </div>`}
    ${!disabled && (msg ? html`<small class="hint ok"><${Icon} n="check" s=${12} /> ${msg}</small>`
      : v.trim() && !esiste && !open ? html`<small class="hint">Nuovo nominativo: verrà aggiunto all'anagrafica al salvataggio</small>`
      : esiste && esiste.nome !== v && !open ? html`<small class="hint">Esiste già come «${esiste.nome}»</small>` : null)}
  </div>`;
}
