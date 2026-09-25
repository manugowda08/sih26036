"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { compareOcrToInstrument, type FieldMismatch, type OcrField, type RegisteredInstrument } from "@/lib/ocr-mismatch";
import { ErrorText } from "@/components/ui";

export type OcrAnalysis = {
  available: boolean;
  advisory?: boolean;
  rawText?: string;
  fields: Record<string, OcrField>;
  warnings: string[];
  mismatches: FieldMismatch[];
  error?: string;
};

const LABELS: Array<{ key: string; label: string }> = [
  { key: "businessName", label: "Business" },
  { key: "instrumentType", label: "Instrument type" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "model", label: "Model" },
  { key: "serialNumber", label: "Serial number" },
  { key: "maxCapacity", label: "Maximum capacity" },
  { key: "minCapacity", label: "Minimum capacity" },
  { key: "certificateNumber", label: "Certificate number" },
  { key: "verificationDate", label: "Verification date" },
  { key: "expiryDate", label: "Expiry / valid until" },
];

function displayValue(field?: OcrField) {
  if (!field || field.status === "not_found" || field.value == null || field.value === "") {
    return "not found";
  }
  if (typeof field.value === "number") {
    return field.raw || `${field.value}${field.unit ? ` ${field.unit}` : ""}`;
  }
  return String(field.value);
}

export function OcrAssist({
  file,
  instrumentId,
  registered,
  onAccept,
}: {
  file: File | null;
  instrumentId?: string;
  registered?: RegisteredInstrument | null;
  onAccept?: (key: string, value: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<OcrAnalysis | null>(null);
  const [ignored, setIgnored] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});

  const fields = analysis?.fields ?? {};
  const mismatches = useMemo(() => {
    if (!analysis) return [];
    const merged: Record<string, OcrField> = { ...fields };
    for (const [key, value] of Object.entries(edits)) {
      merged[key] = { ...(merged[key] ?? {}), value, status: value ? "found" : "not_found", raw: value };
    }
    return compareOcrToInstrument(merged, registered);
  }, [analysis, edits, fields, registered]);

  async function analyze() {
    if (!file) {
      setError("Choose a PDF or image first");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.append("file", file);
      if (instrumentId) payload.append("instrumentId", instrumentId);
      const query = instrumentId ? `?instrumentId=${encodeURIComponent(instrumentId)}` : "";
      const result = await api<OcrAnalysis>(`/api/intelligence/ocr${query}`, { method: "POST", formData: payload });
      setAnalysis(result);
      setIgnored({});
      setEdits({});
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : "OCR assistance is unavailable");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-navy">Document assist (OCR)</p>
      <p className="mt-1 text-xs text-slate-600">
        Optional. Suggestions are not official Legal Metrology data. Verify every value before using it.
      </p>
      <button
        type="button"
        disabled={pending || !file}
        onClick={analyze}
        className="mt-3 rounded border border-navy px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
      >
        {pending ? "Extracting..." : "Analyze document"}
      </button>
      <ErrorText message={error} />
      {analysis ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested details</p>
          {analysis.warnings?.length ? (
            <ul className="list-disc pl-5 text-xs text-amber-800">
              {analysis.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {mismatches.length ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">Review signals (not fraud)</p>
              <ul className="mt-1 list-disc pl-5">
                {mismatches.map((item) => (
                  <li key={item.field}>
                    {item.message}: registered <strong>{item.registered}</strong>, document{" "}
                    <strong>{item.extracted}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : registered ? (
            <p className="text-xs text-emerald-800">No mismatches against the selected instrument for the extracted fields.</p>
          ) : null}
          <div className="grid gap-2">
            {LABELS.map(({ key, label }) => {
              if (ignored[key]) return null;
              const field = fields[key];
              const edited = edits[key];
              const shown = edited ?? displayValue(field);
              return (
                <div key={key} className="rounded border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{label}</p>
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">AI/OCR suggested value</span>
                  </div>
                  <input
                    className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    value={shown === "not found" && edited == null ? "" : shown === "not found" ? "" : shown}
                    placeholder="not found"
                    onChange={(event) => setEdits((current) => ({ ...current, [key]: event.target.value }))}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {field?.status === "found"
                      ? `Heuristic confidence ${Math.round((field.confidence ?? 0) * 100)}%`
                      : "not found — nothing was invented"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {onAccept ? (
                      <button
                        type="button"
                        className="rounded bg-navy px-2 py-1 text-white"
                        disabled={shown === "not found" || !shown}
                        onClick={() => shown && shown !== "not found" && onAccept(key, shown)}
                      >
                        Accept
                      </button>
                    ) : null}
                    <button type="button" className="rounded border px-2 py-1" onClick={() => setIgnored((c) => ({ ...c, [key]: true }))}>
                      Ignore
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
