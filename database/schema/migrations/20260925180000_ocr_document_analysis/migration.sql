-- AlterTable
ALTER TABLE "application_documents" ADD COLUMN "ocr_raw_text" TEXT;
ALTER TABLE "application_documents" ADD COLUMN "ocr_result" JSONB;
ALTER TABLE "application_documents" ADD COLUMN "ocr_analyzed_at" TIMESTAMP(3);
