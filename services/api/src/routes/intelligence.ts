import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { extractWithIntelligence, intelligenceHealth } from "../lib/intelligence-client.js";
import { compareOcrToInstrument, type OcrField } from "../lib/ocr-mismatch.js";
import { requireRoles } from "../plugins/rbac.js";

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

function extname(filename: string) {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

function readMultipartValue(field: { value?: string } | Array<{ value?: string }> | undefined) {
  if (!field) return undefined;
  if (Array.isArray(field)) return field[0]?.value;
  return field.value;
}

export async function intelligenceRoutes(app: FastifyInstance) {
  app.get("/api/intelligence/health", { preHandler: requireRoles(app, ["OWNER", "ADMIN", "LMO", "GATC"]) }, async () => {
    return intelligenceHealth();
  });

  app.post("/api/intelligence/ocr", { preHandler: requireRoles(app, ["OWNER", "ADMIN"]) }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "A document file is required" });

    const ext = extname(file.filename);
    if (!ALLOWED_MIME.has(file.mimetype) && !ALLOWED_EXT.has(ext)) {
      return reply.code(400).send({ error: "Upload a PDF, JPG, or PNG document" });
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) {
      return reply.code(400).send({ error: "File must be 5 MB or smaller" });
    }

    const query = request.query as { instrumentId?: string; documentId?: string };
    const fields = file.fields as Record<string, { value?: string } | Array<{ value?: string }> | undefined>;
    const instrumentId = query.instrumentId || readMultipartValue(fields?.instrumentId);
    const documentId = query.documentId || readMultipartValue(fields?.documentId);

    let registered = null;
    if (instrumentId) {
      const instrument = await prisma.instrument.findUnique({
        where: { id: instrumentId },
        include: { type: true },
      });
      if (!instrument) return reply.code(400).send({ error: "Instrument not found" });
      if (!request.user.roles.includes("ADMIN") && instrument.ownerId !== request.user.sub) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      registered = {
        manufacturer: instrument.manufacturer,
        model: instrument.model,
        serialNumber: instrument.serialNumber,
        capacity: instrument.capacity,
        typeName: instrument.type.name,
      };
    }

    const extracted = await extractWithIntelligence({
      buffer,
      filename: file.filename,
      mimeType: file.mimetype,
    });

    if (!extracted.ok) {
      return reply.code(extracted.statusCode === 400 ? 400 : 503).send({
        available: extracted.available,
        error: extracted.error,
      });
    }

    const ocrFields = extracted.data.fields as Record<string, OcrField>;
    const mismatches = compareOcrToInstrument(ocrFields, registered);

    const result = {
      available: true,
      advisory: true,
      rawText: extracted.data.rawText,
      fields: ocrFields,
      warnings: extracted.data.warnings,
      engine: extracted.data.engine,
      source: extracted.data.source,
      mismatches,
      registered,
    };

    if (documentId) {
      const document = await prisma.applicationDocument.findUnique({
        where: { id: documentId },
        include: { application: true },
      });
      if (document) {
        const allowed =
          request.user.roles.includes("ADMIN") || document.application.ownerId === request.user.sub;
        if (allowed) {
          try {
            await prisma.applicationDocument.update({
              where: { id: documentId },
              data: {
                ocrRawText: extracted.data.rawText,
                ocrResult: {
                  fields: ocrFields,
                  warnings: extracted.data.warnings,
                  mismatches,
                  engine: extracted.data.engine,
                },
                ocrAnalyzedAt: new Date(),
              },
            });
          } catch {
            request.log.warn("OCR result was not persisted; Prisma client may need regenerate after API restart");
          }
        }
      }
    }

    return result;
  });
}
