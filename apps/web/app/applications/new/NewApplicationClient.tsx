"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, ErrorText, Field, inputClass } from "@/components/ui";
import { api, getToken } from "@/lib/api";

type Instrument = { id: string; instrumentCode: string; serialNumber: string; lastVerifiedAt: string | null };

export default function NewApplicationClient() {
  const router = useRouter();
  const search = useSearchParams();
  const preselected = search.get("instrumentId") ?? "";
  const preselectedKind = search.get("kind") === "REVERIFICATION" ? "REVERIFICATION" : "VERIFICATION";
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrumentId, setInstrumentId] = useState(preselected);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api<Instrument[]>("/api/instruments")
      .then(setInstruments)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load instruments"));
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const created = await api<{ id: string }>("/api/applications", {
        method: "POST",
        body: {
          instrumentId: String(data.get("instrumentId")),
          kind: String(data.get("kind")),
          notes: String(data.get("notes") || ""),
        },
      });

      const file = (form.elements.namedItem("document") as HTMLInputElement).files?.[0];
      if (file) {
        const upload = new FormData();
        upload.append("file", file);
        await api(`/api/applications/${created.id}/documents`, { method: "POST", formData: upload });
      }

      await api(`/api/applications/${created.id}/submit`, { method: "POST" });
      router.push(`/applications/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit application");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <h2 className="mb-2 text-2xl font-semibold text-navy">Apply for verification</h2>
      <p className="mb-6 max-w-2xl text-sm text-slate-600">
        Select a registered instrument, attach supporting documents, and submit the application for
        departmental processing.
      </p>
      <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded border border-slate-200 bg-white p-6">
        <ErrorText message={error} />
        <Field label="Registered instrument">
          <select
            name="instrumentId"
            required
            value={instrumentId}
            onChange={(event) => setInstrumentId(event.target.value)}
            className={inputClass()}
          >
            <option value="">Select instrument</option>
            {instruments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.instrumentCode} · SN {item.serialNumber}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Application type">
          <select name="kind" required defaultValue={preselectedKind} className={inputClass()}>
            <option value="VERIFICATION">Verification</option>
            <option value="REVERIFICATION">Reverification</option>
          </select>
        </Field>
        <Field label="Required document (PDF/JPG/PNG)">
          <input name="document" type="file" required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="text-sm" />
        </Field>
        <Field label="Remarks (optional)">
          <textarea name="notes" rows={3} className={inputClass()} />
        </Field>
        <button disabled={pending} className="rounded bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Submitting..." : "Submit application"}
        </button>
      </form>
    </AppShell>
  );
}
