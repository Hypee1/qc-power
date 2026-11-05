import { html, Icon } from "./ui.js";

// ============================================================
//  MACE POWER / MACE SERVICE
//  I record vecchi (senza campo "azienda") valgono come MACE POWER.
// ============================================================
export const LOGO_SERVICE = "img/mace-service.png";
export const AZIENDE = [
  { v: "power", l: "MACE POWER", full: "MACE POWER S.r.l." },
  { v: "service", l: "MACE SERVICE", full: "MACE SERVICE" },
];
export const aziendaOf = (x) => (x && x.azienda === "service" ? "service" : "power");
export const aziendaLabel = (v) => (v === "service" ? "MACE SERVICE" : "MACE POWER");

// Etichetta compatta per tabelle e schede
export function AziendaTag({ v, sm }) {
  const s = v === "service";
  return html`<span class=${"az " + (s ? "az-service" : "az-power") + (sm ? " sm" : "")} title=${aziendaLabel(v)}>
    ${s ? html`<img src=${LOGO_SERVICE} alt="" />` : html`<${Icon} n="bolt" s=${11} />`}${s ? "SERVICE" : "POWER"}</span>`;
}

// Scelta obbligatoria: due pulsanti grandi
export function AziendaPicker({ value, onChange, disabled }) {
  return html`<div class="az-pick">
    ${AZIENDE.map((a) => html`<button type="button" key=${a.v} disabled=${disabled} class=${"az-opt" + (value === a.v ? " on" : "")} onClick=${() => onChange(a.v)}>
      <span class="az-logo">${a.v === "service" ? html`<img src=${LOGO_SERVICE} alt="Mace Service" />` : html`<span class="az-bolt"><${Icon} n="bolt" s=${26} /></span>`}</span>
      <b>${a.l}</b>${value === a.v && html`<${Icon} n="checkCircle" s=${18} cls="t-green" />`}</button>`)}
  </div>`;
}

// Schede Power / Service (/ Tutte) in cima ai registri
export function AziendaTabs({ value, onChange, counts = {}, all }) {
  const T = [...AZIENDE.map((a) => [a.v, a.l]), ...(all ? [["all", "Tutte"]] : [])];
  return html`<div class="tabs az-tabs">${T.map(([k, l]) => html`<button key=${k} class=${"tab" + (value === k ? " on" : "")} onClick=${() => onChange(k)}>
    ${k === "service" ? html`<img class="az-tab-logo" src=${LOGO_SERVICE} alt="" />` : k === "power" ? html`<${Icon} n="bolt" s=${13} />` : null} ${l}
    ${counts[k] !== undefined && html` <em>${counts[k]}</em>`}</button>`)}</div>`;
}

// Logo Service come dataURL (per i PDF)
let logoCache = null;
export async function logoServiceDataUrl() {
  if (logoCache) return logoCache;
  try {
    const b = await (await fetch(LOGO_SERVICE)).blob();
    logoCache = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(b); });
  } catch (e) { logoCache = null; }
  return logoCache;
}

// Ricorda l'ultima scheda scelta in un registro
export const tabMemo = (key, def = "power") => ({
  get: () => { try { return sessionStorage.getItem(key) || def; } catch (e) { return def; } },
  set: (v) => { try { sessionStorage.setItem(key, v); } catch (e) { } },
});
