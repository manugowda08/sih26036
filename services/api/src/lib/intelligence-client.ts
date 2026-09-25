import { loadEnv } from "@lm-smart/config";

type IntelligenceResult = {
  rawText: string;
  fields: Record<string, unknown>;
  warnings: string[];
  engine?: string;
  source?: string;
  fieldCount?: number;
};

export type IntelligenceCall =
  | { ok: true; data: IntelligenceResult }
  | { ok: false; available: false; error: string; statusCode: number };

export async function extractWithIntelligence(file: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<IntelligenceCall> {
  const env = loadEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.intelligenceTimeoutMs);
  try {
    const body = new FormData();
    body.append(
      "file",
      new Blob([new Uint8Array(file.buffer)], { type: file.mimeType || "application/octet-stream" }),
      file.filename,
    );
    const response = await fetch(`${env.intelligenceUrl}/ocr/extract`, {
      method: "POST",
      body,
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as IntelligenceResult & {
      detail?: string | { msg?: string };
      error?: string;
    };
    if (!response.ok) {
      const detail = typeof payload.detail === "string" ? payload.detail : payload.error || "OCR request failed";
      return { ok: false, available: response.status !== 503, error: detail, statusCode: response.status };
    }
    return {
      ok: true,
      data: {
        rawText: payload.rawText ?? "",
        fields: payload.fields ?? {},
        warnings: payload.warnings ?? [],
        engine: payload.engine,
        source: payload.source,
        fieldCount: payload.fieldCount,
      },
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      available: false,
      error: aborted
        ? "OCR assistance timed out"
        : "OCR assistance is temporarily unavailable. You can continue without it.",
      statusCode: 503,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function intelligenceHealth(): Promise<{ available: boolean; status?: string }> {
  const env = loadEnv();
  try {
    const response = await fetch(`${env.intelligenceUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { available: false };
    const body = (await response.json()) as { status?: string };
    return { available: body.status === "ok", status: body.status };
  } catch {
    return { available: false };
  }
}
