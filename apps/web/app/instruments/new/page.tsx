"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, ErrorText, Field, inputClass } from "@/components/ui";
import { OcrAssist } from "@/components/OcrAssist";
import { api, getToken } from "@/lib/api";

type TypeOption = { id: string; name: string; code: string; category: string };
type Business = { id: string; name: string };

export default function NewInstrumentPage() {
  const router = useRouter();
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [newBusiness, setNewBusiness] = useState(false);
  const [assistFile, setAssistFile] = useState<File | null>(null);
  const [values, setValues] = useState({
    typeId: "",
    businessName: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    capacity: "",
    previousCertificateNumber: "",
    lastVerifiedAt: "",
    nextDueAt: "",
  });

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    Promise.all([
      api<TypeOption[]>("/api/instrument-types"),
      api<Business[]>("/api/businesses"),
    ])
      .then(([typeRows, businessRows]) => {
        setTypes(typeRows);
        setBusinesses(businessRows);
        setNewBusiness(businessRows.length === 0);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load form"));
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const location = {
      address: String(form.get("address")),
      city: String(form.get("city")),
      district: String(form.get("district") || ""),
      state: String(form.get("state")),
    };
    const body: Record<string, unknown> = {
      typeId: String(form.get("typeId") || values.typeId),
      manufacturer: String(form.get("manufacturer") || values.manufacturer),
      model: String(form.get("model") || values.model),
      serialNumber: String(form.get("serialNumber") || values.serialNumber),
      capacity: String(form.get("capacity") || values.capacity),
      accuracyClass: String(form.get("accuracyClass") || ""),
      purpose: String(form.get("purpose") || ""),
      location,
      previousCertificateNumber: String(form.get("previousCertificateNumber") || values.previousCertificateNumber),
      lastVerifiedAt: String(form.get("lastVerifiedAt") || values.lastVerifiedAt),
      nextDueAt: String(form.get("nextDueAt") || values.nextDueAt),
    };
    if (newBusiness) {
      body.business = {
        name: String(form.get("businessName") || values.businessName),
        gstin: String(form.get("gstin") || ""),
        location,
      };
    } else {
      body.businessId = String(form.get("businessId"));
    }

    try {
      const created = await api<{ id: string }>("/api/instruments", { method: "POST", body });
      router.push(`/instruments/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register instrument");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <h2 className="mb-4 text-2xl font-semibold text-navy">Register instrument</h2>
      <p className="mb-6 max-w-2xl text-sm text-slate-600">
        Record the weighing or measuring instrument used in trade. Existing paper certificate details
        are optional and used for due-date tracking.
      </p>
      <form onSubmit={onSubmit} className="grid gap-6 rounded border border-slate-200 bg-white p-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <ErrorText message={error} />
          <div className="mb-4">
            <Field label="Optional document to suggest fields (PDF/JPG/PNG)">
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                className="text-sm"
                onChange={(event) => setAssistFile(event.target.files?.[0] ?? null)}
              />
            </Field>
            <div className="mt-3">
              <OcrAssist
                file={assistFile}
                onAccept={(key, value) => {
                  const current = values as Record<string, string>;
                  const map: Record<string, string> = {
                    manufacturer: "manufacturer",
                    model: "model",
                    serialNumber: "serialNumber",
                    maxCapacity: "capacity",
                    businessName: "businessName",
                    certificateNumber: "previousCertificateNumber",
                    verificationDate: "lastVerifiedAt",
                    expiryDate: "nextDueAt",
                  };
                  if (key === "instrumentType") {
                    const match = types.find(
                      (type) =>
                        type.name.toLowerCase().includes(value.toLowerCase()) ||
                        value.toLowerCase().includes(type.name.toLowerCase()) ||
                        type.code.toLowerCase() === value.toLowerCase(),
                    );
                    if (match) {
                      if (values.typeId && values.typeId !== match.id && !window.confirm("Replace the selected instrument type with the OCR suggestion?")) {
                        return;
                      }
                      setValues((prev) => ({ ...prev, typeId: match.id }));
                    }
                    return;
                  }
                  const target = map[key];
                  if (!target) return;
                  if (current[target] && current[target] !== value && !window.confirm(`Replace existing ${target} with the OCR suggestion?`)) {
                    return;
                  }
                  setValues((prev) => ({ ...prev, [target]: value }));
                }}
              />
            </div>
          </div>
        </div>
        <Field label="Instrument type">
          <select name="typeId" required className={inputClass()} value={values.typeId} onChange={(event) => setValues((prev) => ({ ...prev, typeId: event.target.value }))}>
            <option value="">Select type</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} ({type.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Business / establishment">
          {newBusiness || businesses.length === 0 ? (
            <input name="businessName" required placeholder="Business name" className={inputClass()} value={values.businessName} onChange={(event) => setValues((prev) => ({ ...prev, businessName: event.target.value }))} />
          ) : (
            <select name="businessId" required className={inputClass()}>
              {businesses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          {businesses.length > 0 ? (
            <button type="button" className="mt-1 text-xs text-navy underline" onClick={() => setNewBusiness((v) => !v)}>
              {newBusiness ? "Use existing business" : "Add a new business"}
            </button>
          ) : null}
        </Field>
        {newBusiness ? (
          <Field label="GSTIN (optional)">
            <input name="gstin" className={inputClass()} />
          </Field>
        ) : <div />}
        <Field label="Manufacturer">
          <input name="manufacturer" required className={inputClass()} value={values.manufacturer} onChange={(event) => setValues((prev) => ({ ...prev, manufacturer: event.target.value }))} />
        </Field>
        <Field label="Model">
          <input name="model" required className={inputClass()} value={values.model} onChange={(event) => setValues((prev) => ({ ...prev, model: event.target.value }))} />
        </Field>
        <Field label="Serial number">
          <input name="serialNumber" required className={inputClass()} value={values.serialNumber} onChange={(event) => setValues((prev) => ({ ...prev, serialNumber: event.target.value }))} />
        </Field>
        <Field label="Capacity / range">
          <input name="capacity" required placeholder="e.g. 30 kg" className={inputClass()} value={values.capacity} onChange={(event) => setValues((prev) => ({ ...prev, capacity: event.target.value }))} />
        </Field>
        <Field label="Accuracy class (optional)">
          <input name="accuracyClass" className={inputClass()} />
        </Field>
        <Field label="Purpose / use">
          <input name="purpose" placeholder="Retail counter, weighbridge, fuel dispenser..." className={inputClass()} />
        </Field>
        <Field label="Address">
          <input name="address" required className={inputClass()} />
        </Field>
        <Field label="City">
          <input name="city" required defaultValue="Bengaluru" className={inputClass()} />
        </Field>
        <Field label="District">
          <input name="district" defaultValue="Bengaluru Urban" className={inputClass()} />
        </Field>
        <Field label="State">
          <input name="state" required defaultValue="Karnataka" className={inputClass()} />
        </Field>
        <div className="md:col-span-2 border-t pt-4">
          <h3 className="mb-3 font-semibold text-navy">Existing certificate (if any)</h3>
        </div>
        <Field label="Previous certificate number">
          <input name="previousCertificateNumber" className={inputClass()} value={values.previousCertificateNumber} onChange={(event) => setValues((prev) => ({ ...prev, previousCertificateNumber: event.target.value }))} />
        </Field>
        <Field label="Last verification date">
          <input name="lastVerifiedAt" type="date" className={inputClass()} value={values.lastVerifiedAt} onChange={(event) => setValues((prev) => ({ ...prev, lastVerifiedAt: event.target.value }))} />
        </Field>
        <Field label="Valid until / next due date">
          <input name="nextDueAt" type="date" className={inputClass()} value={values.nextDueAt} onChange={(event) => setValues((prev) => ({ ...prev, nextDueAt: event.target.value }))} />
        </Field>
        <div className="md:col-span-2">
          <button disabled={pending} className="rounded bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? "Saving..." : "Save instrument"}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
