import { PassThrough } from "node:stream";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export type CertificatePdfInput = {
  certificateNumber: string;
  businessName: string;
  ownerName: string;
  instrumentType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  capacity: string;
  locationText: string;
  verifiedAt: Date;
  nextDueAt: Date;
  issuedAt: Date;
  officerName: string;
  authorityName: string;
  result: string;
  digitalHash: string;
  verifyUrl: string;
};

function fmt(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export async function buildCertificatePdf(input: CertificatePdfInput) {
  const qrPng = await QRCode.toBuffer(input.verifyUrl, { type: "png", margin: 1, width: 160, errorCorrectionLevel: "M" });

  const doc = new PDFDocument({ size: "A4", margin: 42 });
  const chunks: Buffer[] = [];
  const sink = new PassThrough();
  sink.on("data", (chunk) => chunks.push(chunk as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    sink.on("end", () => resolve(Buffer.concat(chunks)));
    sink.on("error", reject);
  });
  doc.pipe(sink);

  doc.rect(0, 0, doc.page.width, 10).fill("#FF9933");
  doc.rect(0, 10, doc.page.width, 6).fill("#FFFFFF");
  doc.rect(0, 16, doc.page.width, 10).fill("#138808");

  doc.fillColor("#0B3C6F").fontSize(11).text("LM SMART  ·  LEGAL METROLOGY SMART VERIFICATION PLATFORM", 42, 40, {
    align: "center",
  });
  doc.fontSize(18).text("Certificate of Verification", { align: "center" });
  doc.moveDown(0.3);
  doc.fillColor("#555").fontSize(9).text("SIH 2026 prototype for PS26036  ·  Not an official Government of India certificate", {
    align: "center",
  });

  doc.moveDown(1);
  doc.fillColor("#0B3C6F").fontSize(12).text(`Certificate No.  ${input.certificateNumber}`, { align: "center" });
  doc.moveDown(0.8);

  const rows: Array<[string, string]> = [
    ["Verification result", input.result],
    ["Business / establishment", input.businessName],
    ["Instrument owner", input.ownerName],
    ["Instrument type", input.instrumentType],
    ["Manufacturer / model", `${input.manufacturer}  ${input.model}`],
    ["Serial number", input.serialNumber],
    ["Capacity / range", input.capacity],
    ["Instrument location", input.locationText],
    ["Verification date", fmt(input.verifiedAt)],
    ["Valid until / next due", fmt(input.nextDueAt)],
    ["Issuing authority", input.authorityName],
    ["Authorized officer", input.officerName],
    ["Issued at", fmt(input.issuedAt)],
  ];

  doc.fontSize(10).fillColor("#12263A");
  for (const [label, value] of rows) {
    const y = doc.y;
    doc.fillColor("#5b6b7c").text(label, 50, y, { width: 160, continued: false });
    doc.fillColor("#12263A").text(value || "—", 220, y, { width: 230 });
    doc.moveDown(0.35);
  }

  doc.image(qrPng, 430, 210, { width: 120 });
  doc.fontSize(8).fillColor("#0B3C6F").text("Scan to verify", 430, 338, { width: 120, align: "center" });

  doc.moveDown(4);
  doc.fontSize(8).fillColor("#5b6b7c").text(`Digital hash  ${input.digitalHash}`, 50, 700, { width: 500 });
  doc.text("QR encodes a public verification URL with an HMAC-signed token. No passwords or private IDs are embedded.", 50, 714, {
    width: 500,
  });
  doc.text("Validity shown here is a 12-month prototype period from the verification date.", 50, 728, { width: 500 });

  doc.end();
  return done;
}
