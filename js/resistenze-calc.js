// ============================================================
//  RESISTENZE AVVOLGIMENTI FUORI CASSA — calcoli
//  (nessuna dipendenza: si può provare anche da Node)
//
//  Resistenza misurata tra due morsetti (linea-linea), riportata a 75 °C:
//     R75 = R · (K + 75) / (K + T)        K = 235 rame · 225 alluminio
//  Resistenza di fase:   stella R75 / 2   ·   triangolo R75 · 1,5
//  Corrente nominale di linea:  I = S / (√3 · V)
//  Corrente di fase:     stella I         ·   triangolo I / √3
//  Perdite a 75 °C (I²R): per fase Rf · If²   ·   trifase 3 · Rf · If²
//  (stesso risultato per stella e triangolo: 1,5 · R75 · I²)
// ============================================================
export const K_MAT = { rame: 235, alluminio: 225 };
export const UNITA = { ohm: 1, mohm: 1e-3, uohm: 1e-6 };
export const TOLL_DEFAULT = { p_tot: 10, p_avv: 15, r: 5, squilibrio: 2 };

export const n = (s) => {
  if (s === null || s === undefined || s === "") return NaN;
  return parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
};
const ok = (v) => typeof v === "number" && isFinite(v);

export function calcAvvolgimento(w, potenzaKva) {
  const f = UNITA[w.unita] || 1;
  const letture = [w.r1, w.r2, w.r3].map(n).filter((v) => ok(v) && v > 0).map((v) => v * f);
  const T = n(w.temp), k = K_MAT[w.materiale] || K_MAT.rame;
  const out = { letture: letture.length, rMedia: null, squilibrio: null, r75: null, rFase75: null, iLinea: null, iFase: null, pFase: null, pTot: null, iAuto: false };
  if (letture.length) {
    out.rMedia = letture.reduce((a, b) => a + b, 0) / letture.length;
    if (letture.length > 1) out.squilibrio = ((Math.max(...letture) - Math.min(...letture)) / out.rMedia) * 100;
  }
  if (out.rMedia && ok(T) && T > -k) {
    out.r75 = (out.rMedia * (k + 75)) / (k + T);
    out.rFase75 = w.collegamento === "triangolo" ? out.r75 * 1.5 : out.r75 / 2;
  }
  // corrente: se l'utente la scrive vale quella, altrimenti la calcolo da potenza e tensione
  const iMan = n(w.corrente), V = n(w.tensione), S = n(potenzaKva) * 1000;
  if (ok(iMan) && iMan > 0) out.iLinea = iMan;
  else if (ok(V) && V > 0 && ok(S) && S > 0) { out.iLinea = S / (Math.sqrt(3) * V); out.iAuto = true; }
  if (out.iLinea) out.iFase = w.collegamento === "triangolo" ? out.iLinea / Math.sqrt(3) : out.iLinea;
  if (out.rFase75 && out.iFase) { out.pFase = out.rFase75 * out.iFase ** 2; out.pTot = 3 * out.pFase; }
  return out;
}

const dev = (mis, spec) => (ok(mis) && ok(spec) && spec > 0 ? ((mis - spec) / spec) * 100 : null);

// Confronto con i valori di specifica → righe della tabella "Verifica"
export function calcVerifica(r) {
  const P = calcAvvolgimento(r.pri || {}, r.potenza_kva), S = calcAvvolgimento(r.sec || {}, r.potenza_kva);
  const sp = r.spec || {}, t = { ...TOLL_DEFAULT, ...Object.fromEntries(Object.entries(r.toll || {}).filter(([, v]) => ok(n(v))).map(([k, v]) => [k, n(v)])) };
  // le resistenze di specifica sono scritte nella stessa unità delle letture di quell'avvolgimento
  const sR1 = n(sp.r_pri) * (UNITA[(r.pri || {}).unita] || 1), sR2 = n(sp.r_sec) * (UNITA[(r.sec || {}).unita] || 1), sP1 = n(sp.p_pri), sP2 = n(sp.p_sec);
  const sTot = ok(sP1) && ok(sP2) ? sP1 + sP2 : ok(n(sp.p_tot)) ? n(sp.p_tot) : null;
  const mTot = P.pTot !== null && S.pTot !== null ? P.pTot + S.pTot : null;
  const row = (key, label, spec, mis, toll, mode) => {
    const d = dev(mis, spec);
    const esito = d === null ? null : mode === "abs" ? (Math.abs(d) <= toll + 1e-9 ? "ok" : "ko") : (d <= toll + 1e-9 ? "ok" : "ko");
    return { key, label, spec: ok(spec) ? spec : null, mis, dev: d, toll, mode, esito };
  };
  const righe = [
    row("r_pri", "Resistenza primario (AT) a 75 °C", sR1, P.r75, t.r, "abs"),
    row("r_sec", "Resistenza secondario (BT) a 75 °C", sR2, S.r75, t.r, "abs"),
    row("p_pri", "Perdite primario (AT) a 75 °C", sP1, P.pTot, t.p_avv, "max"),
    row("p_sec", "Perdite secondario (BT) a 75 °C", sP2, S.pTot, t.p_avv, "max"),
    row("p_tot", "Perdite totali a 75 °C", sTot, mTot, t.p_tot, "max"),
  ];
  const fatte = righe.filter((x) => x.esito);
  const esito = !fatte.length ? "nd" : fatte.some((x) => x.esito === "ko") ? "non_conforme" : "conforme";
  const sq = [P.squilibrio, S.squilibrio].filter((v) => v !== null);
  return { P, S, righe, toll: t, sTot, mTot, pmax: dev(mTot, sTot), esito, squilibrioMax: sq.length ? Math.max(...sq) : null, squilibrioAlto: sq.some((v) => v > t.squilibrio) };
}

// ---------- Formattazione ----------
const it = (v, d) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
export function fmtOhm(v) {
  if (!ok(v)) return "—";
  if (v >= 1) return it(v, 4) + " Ω";
  if (v >= 1e-3) return it(v * 1e3, 3) + " mΩ";
  return it(v * 1e6, 1) + " µΩ";
}
export const fmtW = (v) => (ok(v) ? it(v, 1) + " W" : "—");
export const fmtA = (v) => (ok(v) ? it(v, 2) + " A" : "—");
export const fmtPct = (v, sign = true) => (ok(v) ? (sign && v > 0 ? "+" : "") + it(v, 2) + " %" : "—");
