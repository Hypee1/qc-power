import { fmtDate, fmtDT, fmtNum, calcEsito } from "./ui.js";
import { listAllegati, audit } from "./store.js";

let lib = null;
const load = async () => (lib = lib || (await import("../vendor/pdf.js")));
const RED = [220, 38, 38];

function header(doc, titolo, sotto, codice) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...RED); doc.rect(14, 12, 3, 16, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("MACE POWER S.r.l.", 20, 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110);
  doc.text("Sistema Gestione Qualità — Casandrino (NA)", 20, 23);
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
function kv(doc, y, pairs, { autoTable }) {
  autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: 8.5, cellPadding: 2, valign: "top" },
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

export async function pdfNC(n) {
  const L = await load(); const doc = new L.jsPDF({ unit: "mm", format: "a4" });
  let y = header(doc, "RAPPORTO DI NON CONFORMITÀ", `N° ${n.numero_report || "—"} · ${(n.stato || "").toUpperCase()}`);
  y = kv(doc, y, [["Numero report", n.numero_report], ["Data", fmtDate(n.data)], ["Documento rif.", n.documento_riferimento],
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
  footer(doc, `NC ${n.numero_report || ""}`);
  audit("pdf_download", "nc", n.id, n.numero_report);
  save(doc, `NC_${(n.numero_report || "").replace(/\W+/g, "-")}.pdf`);
}
