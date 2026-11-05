import { fmtDate, fmtDT, fmtNum, calcEsito } from "./ui.js";
import { listAllegati, audit } from "./store.js";
import { logoServiceDataUrl, aziendaOf, aziendaLabel } from "./azienda.js";
import { ACCESSORI_RIENTRO, PROVE_RIENTRO, LAVORI_RIENTRO, GARANZIA } from "./config.js";
import { faseRientro, koRientro } from "./views/common.js";

let lib = null;
const load = async () => (lib = lib || (await import("../vendor/jspdf.js")));
const RED = [220, 38, 38];

// logo = dataURL del logo MACE SERVICE (solo per documenti Service)
function header(doc, titolo, sotto, logo) {
  const w = doc.internal.pageSize.getWidth();
  if (logo) {
    try { doc.addImage(logo, "PNG", 14, 8.5, 21, 21); } catch (e) { }
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("MACE SERVICE", 38, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110);
    doc.text("Sistema Gestione Qualità — Casandrino (NA)", 38, 23);
  } else {
    doc.setFillColor(...RED); doc.rect(14, 12, 3, 16, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("MACE POWER S.r.l.", 20, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110);
    doc.text("Sistema Gestione Qualità — Casandrino (NA)", 20, 23);
  }
  doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text(titolo, w - 14, 18, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(sotto || "", w - 14, 24, { align: "right" });
  doc.setDrawColor(200); doc.line(14, 31, w - 14, 31);
  return 37;
}
function footer(doc, ref) {
  const n = doc.getNumberOfPages(), w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(130);
    doc.text(`${ref} · generato il ${fmtDT(new Date())}`, 14, h - 8);
    doc.text(`Pag. ${i}/${n}`, w - 14, h - 8, { align: "right" });
  }
}
function kv(doc, y, pairs, { autoTable }, pad = 2) {
  autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: pad < 2 ? 8 : 8.5, cellPadding: pad, valign: "top" },
    columnStyles: { 0: { fontStyle: "bold", fillColor: [244, 244, 245], cellWidth: 38 }, 2: { fontStyle: "bold", fillColor: [244, 244, 245], cellWidth: 38 } },
    body: pairs.reduce((rows, p, i) => { if (i % 2 === 0) rows.push([p[0], p[1] || "—"]); else rows[rows.length - 1].push(p[0], p[1] || "—"); return rows; }, [])
      .map((r) => (r.length === 2 ? [r[0], { content: r[1], colSpan: 3 }] : r)),
  });
  return doc.lastAutoTable.finalY + 5;
}
function block(doc, y, title, text, { autoTable }) {
  autoTable(doc, { startY: y, theme: "grid", styles: { fontSize: 8.5, cellPadding: 2.2 },
    head: [[title]], headStyles: { fillColor: [39, 39, 42], fontSize: 8.5 }, body: [[text || "—"]] });
  return doc.lastAutoTable.finalY + 4;
}
function ensure(doc, y, need) {
  if (y + need > doc.internal.pageSize.getHeight() - 16) { doc.addPage(); return 18; }
  return y;
}
function firma(doc, y, label, f, x = 14) {
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(200); doc.rect(x, y + 2, 58, 24);
  if (f && f.signature_data) { try { doc.addImage(f.signature_data, "PNG", x + 1, y + 3, 56, 22); } catch (e) { } }
  doc.setFontSize(7); doc.setTextColor(100);
  doc.text(f ? `${f.firmatario || ""} ${f.data ? "· " + fmtDT(f.data) : ""}` : "Non firmato", x, y + 30);
  doc.setTextColor(0);
}
async function photos(doc, y, parentId) {
  let att = [];
  try { att = (await listAllegati(parentId)).filter((a) => (a.type || "").startsWith("image/")); } catch (e) { }
  if (!att.length) return y;
  y = ensure(doc, y, 20); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Allegati fotografici", 14, y); y += 4;
  let x = 14;
  for (const a of att) {
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = a.data; });
    if (!img) continue;
    const wMax = 58, h = Math.min(60, (img.height / img.width) * wMax), w = (img.width / img.height) * h;
    if (x + w > doc.internal.pageSize.getWidth() - 14) { x = 14; y += 64; }
    y = ensure(doc, y, h + 4);
    doc.addImage(a.data, "JPEG", x, y, w, h); x += w + 4;
  }
  return y + 66;
}
function save(doc, name) {
  const url = doc.output("bloburl");
  const w = window.open(url, "_blank");
  if (!w) doc.save(name);
}

export async function pdfControllo(c) {
  const L = await load(); const doc = new L.jsPDF({ unit: "mm", format: "a4" });
  let y = header(doc, "CONTROLLO DI ACCETTAZIONE", `${c.percorso === "carpenteria" ? "Carpenteria" : "Produzione"} · ${c.tipo || ""}`);
  y = kv(doc, y, [["Fornitore", c.fornitore], ["Data", fmtDate(c.data)], ["DDT", c.ddt], ["Compilatore", c.compilatore],
    ["Codice commessa", c.codice_commessa], ["Codice progetto", c.codice_progetto],
    [c.percorso === "produzione" ? "Materiale (Al/Cu)" : "Sottotipo (AT/BT)", c.sottotipo],
    ["Test aderenza vernice", c.test_aderenza_vernice], ["Dettaglio materiale", c.dati_legacy && c.dati_legacy.dettaglio_materiale],
    ["Stato", c.stato]], L);
  const q = (c.controlli_dimensionali || []).filter((x) => x.descrizione || x.valore_misurato);
  L.autoTable(doc, { startY: y, theme: "striped", styles: { fontSize: 8.5 }, headStyles: { fillColor: RED },
    head: [["Descrizione quota", "Teorico", "Toll. ±", "Misurato", "U.M.", "Esito"]],
    body: q.length ? q.map((x) => [x.descrizione, fmtNum(x.valore_teorico), fmtNum(x.tolleranza), fmtNum(x.valore_misurato), x.unita || "mm", calcEsito(x) || "n.d."]) : [["Nessuna quota registrata", "", "", "", "", ""]],
    didParseCell: (d) => { if (d.section === "body" && d.column.index === 5) d.cell.styles.textColor = d.cell.raw === "FAIL" ? RED : d.cell.raw === "PASS" ? [22, 163, 74] : [100, 100, 100]; } });
  y = doc.lastAutoTable.finalY + 5;
  const v = c.dati_legacy && c.dati_legacy.vernice;
  if (v) y = kv(doc, y, Object.entries(v).map(([k, val]) => ["Vernice " + k.replace(/_/g, " "), val]), L);
  y = kv(doc, y, [["CONFORMITÀ GENERALE", (c.conformita_generale || "—").replace("_", " ").toUpperCase()]], L);
  y = block(doc, y, "Note", c.note, L);
  y = ensure(doc, y, 36); firma(doc, y, "Firma compilatore", c.firma); y += 36;
  await photos(doc, y, c.id);
  footer(doc, `Controllo ${c.id || ""}`);
  audit("pdf_download", "controlli", c.id, `${c.tipo} ${c.fornitore}`);
  save(doc, `Controllo_${(c.fornitore || "").replace(/\W+/g, "_")}_${c.data || ""}.pdf`);
}

const logoFor = async (x) => (aziendaOf(x) === "service" ? await logoServiceDataUrl() : null);

export async function pdfNC(n) {
  const L = await load(); const doc = new L.jsPDF({ unit: "mm", format: "a4" });
  let y = header(doc, "RAPPORTO DI NON CONFORMITÀ", `N° ${n.numero_report || "—"} · ${(n.stato || "").toUpperCase()}`, await logoFor(n));
  y = kv(doc, y, [["Azienda", aziendaLabel(aziendaOf(n))], ["Numero report", n.numero_report], ["Data", fmtDate(n.data)], ["Documento rif.", n.documento_riferimento],
    ["Origine NC", n.origine_nc], ["Controparte", n.controparte], ["Classificazione", n.classificazione],
    ["Quantità", (n.quantita || "") + (n.quantita_definitiva ? " (definitiva)" : "")], ["Responsabile", n.responsabile_rilevazione]], L);
  y = block(doc, y, "Materiale", n.materiale_descrizione, L);
  y = block(doc, y, "Descrizione della non conformità", n.descrizione_nc, L);
  y = kv(doc, y, [["Tipo trattamento", n.trattamento_tipo], ["Data completamento", fmtDate(n.data_completamento)]], L);
  y = block(doc, y, "Causa", n.causa, L);
  y = block(doc, y, "Trattamento", n.trattamento, L);
  y = block(doc, y, "Azione correttiva", n.azione_correttiva, L);
  y = kv(doc, y, [["Data azione", fmtDate(n.data_azione)], ["Verifica efficacia", fmtDate(n.data_verifica_efficacia)]], L);
  y = block(doc, y, "Efficacia", n.efficacia, L);
  y = kv(doc, y, [["Stato", (n.stato || "").toUpperCase()], ["Data chiusura", fmtDate(n.data_chiusura)]], L);
  if ((n.storico || []).length) {
    L.autoTable(doc, { startY: y, theme: "striped", styles: { fontSize: 8 }, headStyles: { fillColor: [39, 39, 42] },
      head: [["Data", "Aggiornamento", "Stato", "Autore"]], body: n.storico.map((s) => [fmtDate(s.data), s.note || "—", s.stato || "", s.autore || ""]) });
    y = doc.lastAutoTable.finalY + 5;
  }
  y = ensure(doc, y, 36);
  firma(doc, y, "Firma rilevazione", n.firma_rilevazione, 14);
  firma(doc, y, "Firma trattamento", n.firma_trattamento, 76);
  firma(doc, y, "Firma efficacia", n.firma_efficacia, 138);
  y += 38;
  await photos(doc, y, n.id);
  footer(doc, `NC ${aziendaOf(n) === "service" ? "Mace Service " : ""}${n.numero_report || ""}`);
  audit("pdf_download", "nc", n.id, n.numero_report);
  save(doc, `NC_${aziendaOf(n) === "service" ? "Service_" : ""}${(n.numero_report || "").replace(/\W+/g, "-")}.pdf`);
}

// ================= RIENTRI TRASFORMATORI =================
const DARK = [39, 39, 42];
const GREEN = [22, 163, 74], AMBER = [217, 119, 6];
const gLabel = (v) => (GARANZIA.find((g) => g.v === v) || {}).l || "—";
const faseLabel = (f) => ({ collaudato: "Collaudato", in_collaudo: "Collaudo in corso", da_collaudare: "Da collaudare" })[f] || f;
function bar(doc, y, text, right) {
  const w = doc.internal.pageSize.getWidth();
  y = ensure(doc, y, 14);
  doc.setFillColor(...DARK); doc.rect(14, y, w - 28, 8, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text(text, 17, y + 5.5);
  if (right) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(right, w - 17, y + 5.5, { align: "right" }); }
  doc.setTextColor(0);
  return y + 11;
}
function checkTbl(doc, y, L, head, voci, group, altro, [a, b], compact) {
  L.autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: compact ? 7.6 : 8.5, cellPadding: compact ? 0.9 : 1.8 }, headStyles: { fillColor: DARK, fontSize: 8.5, halign: "left" },
    columnStyles: { 1: { halign: "center", cellWidth: 14, fontStyle: "bold" }, 2: { halign: "center", cellWidth: 14, fontStyle: "bold" }, 0: { cellWidth: 72 } },
    head: [[head, a.toUpperCase(), b.toUpperCase(), "Note"]],
    body: voci.map(([k, l]) => { const v = (group || {})[k] || {}; return [k === "altro" ? "Altro" + (altro ? ": " + altro : ":") : l, v.v === a ? "X" : "", v.v === b ? "X" : "", v.note || ""]; }),
    didParseCell: (d) => { if (d.section === "body" && d.column.index === 2 && d.cell.raw === "X" && b === "ko") d.cell.styles.textColor = RED;
      if (d.section === "body" && d.column.index === 1 && d.cell.raw === "X" && a === "ok") d.cell.styles.textColor = GREEN; },
  });
  return doc.lastAutoTable.finalY + 5;
}

// "Eseguita da / data" a sinistra, riquadro firma a destra (stessa altezza)
function accFirma(doc, y, L, l1, v1, l2, v2, lf, f) {
  y = ensure(doc, y, 36);
  L.autoTable(doc, { startY: y + 3, theme: "grid", tableWidth: 116, margin: { left: 14 }, styles: { fontSize: 8.5, cellPadding: 2.4 },
    columnStyles: { 0: { fontStyle: "bold", fillColor: [244, 244, 245], cellWidth: 46 } }, body: [[l1, v1 || "—"], [l2, fmtDate(v2)]] });
  firma(doc, y, lf, f, 138);
  return Math.max(doc.lastAutoTable.finalY, y + 32) + 6;
}

export async function pdfRientro(r) {
  const L = await load(); const doc = new L.jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const fase = faseRientro(r), ko = koRientro(r);
  let y = header(doc, "SCHEDA DI PRESA IN CARICO", `Rientro N° ${r.numero || "—"} · Mod. MAC PA4190/1`, await logoFor(r));
  // riquadro di sintesi
  L.autoTable(doc, { startY: y, theme: "grid", styles: { fontSize: 9, cellPadding: 2.4, halign: "center", fontStyle: "bold" },
    head: [["Azienda", "Garanzia", "Collaudo", "Prove KO", "Stato"]], headStyles: { fillColor: [244, 244, 245], textColor: 60, fontSize: 7.5, halign: "center" },
    body: [[aziendaLabel(aziendaOf(r)), gLabel(r.garanzia).toUpperCase(), faseLabel(fase).toUpperCase(), String(ko), (r.stato || "aperto").toUpperCase()]],
    didParseCell: (d) => { if (d.section !== "body") return;
      if (d.column.index === 1) d.cell.styles.textColor = r.garanzia === "si" ? GREEN : r.garanzia === "da_valutare" ? AMBER : [90, 90, 90];
      if (d.column.index === 2) d.cell.styles.textColor = fase === "collaudato" ? GREEN : AMBER;
      if (d.column.index === 3 && ko) d.cell.styles.textColor = RED; } });
  y = doc.lastAutoTable.finalY + 5;

  y = bar(doc, y, "PARTE 1 — ACCETTAZIONE TRASFORMATORE", "compilazione obbligatoria alla presa in carico");
  y = kv(doc, y, [["Numero DDT", r.numero_ddt], ["Data", fmtDate(r.data)], ["Mittente", r.mittente], ["Garanzia", gLabel(r.garanzia)],
    ["Referente", r.referente], ["Recapiti", r.recapiti], ["Causa del rientro", r.causale]], L, 1.3);
  y = bar(doc, y, "DATI DI TARGA TRASFORMATORE");
  y = kv(doc, y, [["Trasformatore in", (r.isolamento || "").toUpperCase()], ["Numero di fasi", r.fasi], ["Costruttore", r.costruttore], ["Matricola", r.matricola],
    ["Potenza nominale", r.potenza ? r.potenza + " kVA" : ""], ["Anno", r.anno], ["Rapporto di trasf.", r.rapporto], ["Gruppo", r.gruppo],
    ["Peso totale", r.peso_totale ? r.peso_totale + " kg" : ""], ["Peso olio", r.peso_olio ? r.peso_olio + " kg" : ""]], L, 1.3);
  y = checkTbl(doc, ensure(doc, y, 60), L, "Dotazione riscontrata in accettazione", ACCESSORI_RIENTRO, r.accessori, r.accessori_altro, ["si", "no"], true);
  y = accFirma(doc, y, L, "Accettazione eseguita da", r.accettato_da, "Data accettazione", r.data_accettazione, "Firma accettazione", r.firma_accettazione);

  doc.addPage(); y = header(doc, "SCHEDA DI PRESA IN CARICO", `Rientro N° ${r.numero || "—"} · Mod. MAC PA4190/1`, await logoFor(r));
  y = bar(doc, y, "PARTE 2 — COLLAUDO ELETTRICO IN ACCETTAZIONE E ISPEZIONE PARTE ATTIVA", faseLabel(fase));
  y = checkTbl(doc, y, L, "Prove elettriche eseguite in accettazione", PROVE_RIENTRO, r.prove, r.prove_altro, ["ok", "ko"]);
  y = block(doc, y, "Osservazioni", r.osservazioni_prove, L);
  y = kv(doc, y, [["Verifica dati di targa", r.targa_verifica === "conformi" ? "Confermati" : r.targa_verifica === "difformi" ? "DIFFORMI" : ""], ["Note", r.targa_note]], L);
  y = block(doc, ensure(doc, y, 20), "Osservazioni e valutazioni parte attiva — riscontro all'apertura", r.riscontro_apertura, L);
  const lav = LAVORI_RIENTRO.map(([k, l]) => `[${(r.lavori || {})[k] ? "X" : "  "}] ${l}`).join("      ");
  L.autoTable(doc, { startY: ensure(doc, y, 24), theme: "grid", styles: { fontSize: 8.5, cellPadding: 2.2 }, head: [["Lavori da preventivare e osservazioni"]],
    headStyles: { fillColor: DARK, fontSize: 8.5 }, body: [[{ content: lav, styles: { fontStyle: "bold" } }], ["Attività da prevedere: " + (r.attivita_prevedere || "—")]] });
  y = doc.lastAutoTable.finalY + 5;
  y = accFirma(doc, y, L, "Verifica eseguita da", r.verificato_da, "Data verifica", r.data_verifica, "Firma verifica", r.firma_verifica);
  if ((r.storico || []).length) {
    L.autoTable(doc, { startY: ensure(doc, y, 20), theme: "striped", styles: { fontSize: 8 }, headStyles: { fillColor: DARK },
      head: [["Data", "Aggiornamento", "Stato", "Autore"]], body: r.storico.map((s) => [fmtDate(s.data), s.note || "—", s.stato || "", s.autore || ""]) });
    y = doc.lastAutoTable.finalY + 5;
  }
  await photos(doc, y, r.id);
  footer(doc, `Rientro ${aziendaOf(r) === "service" ? "Mace Service " : ""}${r.numero || ""} · Matr. ${r.matricola || "—"}`);
  audit("pdf_download", "rientri", r.id, "Rientro " + r.numero);
  save(doc, `Rientro_${(r.numero || "").replace(/\W+/g, "-")}_${(r.matricola || "").replace(/\W+/g, "")}.pdf`);
}

export async function pdfRegistroRientri(rows, filtri, az) {
  const L = await load(); const doc = new L.jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  let y = header(doc, "REGISTRO RIENTRI TRASFORMATORI", `${rows.length} rientri · ${filtri || ""}`, az === "service" ? await logoServiceDataUrl() : null);
  const all = az === "all";
  L.autoTable(doc, { startY: y, theme: "striped", styles: { fontSize: 7.8, cellPadding: 1.6, valign: "top" }, headStyles: { fillColor: RED, fontSize: 7.8 },
    head: [["N°", ...(all ? ["Az."] : []), "Data", "DDT", "Mittente", "Causa", "Matricola", "kVA", "Olio/Res.", "Costruttore", "Garanzia", "Collaudo", "KO", "Lavori", "Stato"]],
    body: rows.map((x) => { const f = faseRientro(x);
      return [x.numero || "", ...(all ? [aziendaOf(x) === "service" ? "SERV." : "POWER"] : []), fmtDate(x.data), x.numero_ddt || "", x.mittente || "", x.causale || "", x.matricola || "",
        x.potenza || "", x.isolamento || "", x.costruttore || "", gLabel(x.garanzia), faseLabel(f), String(koRientro(x) || ""),
        LAVORI_RIENTRO.filter(([k]) => (x.lavori || {})[k]).map(([, l]) => l).join(", "), (x.stato || "aperto")]; }),
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 14 }, [all ? 5 : 4]: { cellWidth: 42 } },
    didParseCell: (d) => { if (d.section !== "body") return; const h = d.table.head[0].cells[d.column.index].raw;
      if (h === "Garanzia") d.cell.styles.textColor = d.cell.raw.startsWith("Sì") ? GREEN : d.cell.raw === "Da valutare" ? AMBER : [90, 90, 90];
      if (h === "Collaudo") d.cell.styles.textColor = d.cell.raw === "Collaudato" ? GREEN : AMBER;
      if (h === "KO" && d.cell.raw) { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = "bold"; } } });
  footer(doc, "Registro rientri trasformatori");
  audit("pdf_download", "rientri", "", "registro rientri PDF");
  save(doc, `Registro_Rientri_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ================= ASSEGNAZIONE STRUMENTI =================
export async function pdfRegistroAssegnazioni(rows, filtri) {
  const L = await load(); const doc = new L.jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const giorni = (a) => { const s = new Date(a.data_assegnazione + "T00:00:00"), e = a.data_restituzione ? new Date(a.data_restituzione + "T00:00:00") : today; return isNaN(s) ? "" : String(Math.max(0, Math.round((e - s) / 86400000))); };
  let y = header(doc, "REGISTRO ASSEGNAZIONE STRUMENTI", `${rows.length} righe · ${filtri || ""}`);
  L.autoTable(doc, { startY: y, theme: "striped", styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: RED, fontSize: 8 },
    head: [["Operatore", "Area", "Azienda", "Strumento / materiale", "Q.tà", "Codice", "Assegnato il", "Restituito il", "Giorni", "Note"]],
    body: rows.map((a) => [a.operatore_nome || "", a.operatore_area || "", aziendaOf(a) === "service" ? "MACE SERVICE" : "MACE POWER", a.strumento || "", a.quantita || "1", a.codice || "",
      fmtDate(a.data_assegnazione), a.data_restituzione ? fmtDate(a.data_restituzione) : "IN USO", giorni(a), [a.note, a.note_restituzione].filter(Boolean).join(" · ")]),
    columnStyles: { 0: { fontStyle: "bold" }, 8: { halign: "right", fontStyle: "bold" } },
    didParseCell: (d) => { if (d.section === "body" && d.column.index === 7 && d.cell.raw === "IN USO") { d.cell.styles.textColor = AMBER; d.cell.styles.fontStyle = "bold"; } } });
  footer(doc, "Registro assegnazione strumenti");
  audit("pdf_download", "assegnazioni", "", "registro assegnazioni PDF");
  save(doc, `Registro_Strumenti_${new Date().toISOString().slice(0, 10)}.pdf`);
}
