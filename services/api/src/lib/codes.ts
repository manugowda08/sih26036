import { prisma } from "./prisma.js";

export async function nextInstrumentCode() {
  const year = new Date().getFullYear();
  const count = await prisma.instrument.count();
  return `LM-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function nextApplicationNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.application.count();
  return `APP-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function nextCertificateNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.certificate.count();
  return `LM-CERT-${year}-${String(count + 1).padStart(5, "0")}`;
}
