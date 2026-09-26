"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, ErrorText, Field, StatusBadge, inputClass } from "@/components/ui";
import { api, downloadAuthorized, getStoredUser, getToken } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Inspection = {
  id: string;
  result: string | null;
  remarks: string | null;
  locationMismatch: boolean;
  startedAt: string | null;
  submittedAt: string | null;
  location: { latitude: number | null; longitude: number | null; city: string | null } | null;
  application: {
    applicationNumber: string;
    status: string;
    owner: { fullName: string; email: string } | null;
    business: { name: string } | null;
    schedule: { scheduledAt: string } | null;
  } | null;
  instrument: {
    instrumentCode: string;
    serialNumber: string;
    manufacturer: string;
    model: string;
    capacity: string;
    location: { address: string | null; city: string | null; state: string | null } | null;
    type: { name: string; unit: string; defaultPermissibleError: number } | null;
  } | null;
  checklist: {
    identificationVerified: boolean;
    serialNumberMatches: boolean;
    physicalConditionOk: boolean;
    displayFunctioning: boolean;
    zeroIndicationChecked: boolean;
    measurementAccuracyChecked: boolean;
    sealStampOk: boolean;
    documentsChecked: boolean;
  } | null;
  measurements: Array<{
    id: string;
    capacity: number;
    testLoad: number;
    observedValue: number;
    error: number;
    permissibleError: number;
    result: string;
  }>;
    photos: Array<{ id: string; filename: string; kind: string; capturedAt: string }>;
  certificate: { id: string; certificateNumber: string; status: string } | null;
};

const checklistFields = [
  ["identificationVerified", "Identification verified"],
  ["serialNumberMatches", "Serial number matches"],
  ["physicalConditionOk", "Physical condition satisfactory"],
  ["displayFunctioning", "Display functioning"],
  ["zeroIndicationChecked", "Zero indication checked"],
  ["measurementAccuracyChecked", "Measurement accuracy checked"],
  ["sealStampOk", "Seal / stamp in order"],
  ["documentsChecked", "Documents checked"],
] as const;

export default function InspectionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = Boolean(item?.submittedAt);
  const canIssue = (getStoredUser()?.roles ?? []).some((role) => ["ADMIN", "LMO", "GATC"].includes(role));

  function load() {
    return api<Inspection>(`/api/inspections/${params.id}`).then(setItem);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    load().catch((err) => setError(err instanceof Error ? err.message : "Not found"));
  }, [params.id, router]);

  async function saveChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const checklist: Record<string, boolean> = {};
    for (const [key] of checklistFields) checklist[key] = form.get(key) === "on";
    try {
      const updated = await api<Inspection>(`/api/inspections/${item.id}`, {
        method: "PUT",
        body: {
          remarks: String(form.get("remarks") || ""),
          locationMismatch: form.get("locationMismatch") === "on",
          latitude: form.get("latitude") ? Number(form.get("latitude")) : undefined,
          longitude: form.get("longitude") ? Number(form.get("longitude")) : undefined,
          checklist,
        },
      });
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  async function addMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const testLoad = Number(form.get("testLoad"));
    const observedValue = Number(form.get("observedValue"));
    try {
      const updated = await api<Inspection>(`/api/inspections/${item.id}/measurements`, {
        method: "POST",
        body: {
          capacity: Number(form.get("capacity")),
          testLoad,
          observedValue,
          permissibleError: Number(form.get("permissibleError")),
        },
      });
      setItem(updated);
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save measurement");
    } finally {
      setPending(false);
    }
  }

  async function addPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    setPending(true);
    setError(null);
    const form = event.currentTarget;
    const file = (form.elements.namedItem("photo") as HTMLInputElement).files?.[0];
    if (!file) return;
    const payload = new FormData();
    payload.append("file", file);
    payload.append("kind", String((form.elements.namedItem("kind") as HTMLSelectElement).value));
    try {
      const updated = await api<Inspection>(`/api/inspections/${item.id}/photos`, {
        method: "POST",
        formData: payload,
      });
      setItem(updated);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload photo");
    } finally {
      setPending(false);
    }
  }

  async function complete(result: "PASS" | "FAIL" | "REQUIRES_REVIEW") {
    if (!item) return;
    setPending(true);
    setError(null);
    try {
      const updated = await api<Inspection>(`/api/inspections/${item.id}/complete`, {
        method: "POST",
        body: { result, remarks: item.remarks },
      });
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete inspection");
    } finally {
      setPending(false);
    }
  }

  async function generateCertificate() {
    if (!item) return;
    setPending(true);
    setError(null);
    try {
      const cert = await api<{ id: string }>(`/api/certificates`, {
        method: "POST",
        body: { inspectionId: item.id },
      });
      await load();
      router.push(`/certificates/${cert.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate certificate");
    } finally {
      setPending(false);
    }
  }

  const demoTolerance = item?.instrument?.type?.defaultPermissibleError ?? 0.5;

  return (
    <AppShell>
      <ErrorText message={error} />
      {item ? (
        <div className="space-y-5">
          <div className="rounded border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-widest text-slate-500">Field inspection</p>
            <h2 className="text-2xl font-semibold text-navy">{item.instrument?.instrumentCode}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={item.application?.status ?? "ASSIGNED"} />
              {item.result ? <StatusBadge status={item.result} /> : null}
            </div>
            <p className="mt-3 text-sm">Application {item.application?.applicationNumber}</p>
            <p className="text-sm">Owner {item.application?.owner?.fullName} · {item.application?.business?.name}</p>
            <p className="text-sm">Scheduled {formatDateTime(item.application?.schedule?.scheduledAt)}</p>
            <p className="text-sm">Started {formatDateTime(item.startedAt)}</p>
          </div>

          <div className="rounded border border-slate-200 bg-white p-5 text-sm">
            <h3 className="font-semibold">Instrument</h3>
            <p>{item.instrument?.manufacturer} {item.instrument?.model} · SN {item.instrument?.serialNumber}</p>
            <p>Capacity / range: {item.instrument?.capacity}</p>
            <p>Type: {item.instrument?.type?.name} ({item.instrument?.type?.unit})</p>
            <p>
              Location: {item.instrument?.location?.address}, {item.instrument?.location?.city}, {item.instrument?.location?.state}
            </p>
          </div>

          <form onSubmit={saveChecklist} className="rounded border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-navy">Checklist, GPS and remarks</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {checklistFields.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input name={key} type="checkbox" defaultChecked={Boolean(item.checklist?.[key])} disabled={locked} />
                  {label}
                </label>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input name="locationMismatch" type="checkbox" defaultChecked={item.locationMismatch} disabled={locked} />
              Location mismatch observed
            </label>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label="GPS latitude">
                <input name="latitude" type="number" step="0.0001" defaultValue={item.location?.latitude ?? 12.9716} className={inputClass()} disabled={locked} />
              </Field>
              <Field label="GPS longitude">
                <input name="longitude" type="number" step="0.0001" defaultValue={item.location?.longitude ?? 77.5946} className={inputClass()} disabled={locked} />
              </Field>
            </div>
            <Field label="Remarks">
              <textarea name="remarks" rows={3} defaultValue={item.remarks ?? ""} className={inputClass()} disabled={locked} />
            </Field>
            {!locked ? (
              <button disabled={pending} className="mt-3 rounded bg-navy px-4 py-2 text-sm font-semibold text-white">
                Save inspection notes
              </button>
            ) : null}
          </form>

          <form onSubmit={addMeasurement} className="rounded border border-slate-200 bg-white p-5">
            <h3 className="font-semibold text-navy">Test measurement</h3>
            <p className="mb-3 text-xs text-slate-500">
              Error = observed value − test load. Permissible error is a prototype/demo configuration from the
              instrument type seed, not an official legal tolerance.
            </p>
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Capacity">
                <input name="capacity" type="number" step="0.0001" required defaultValue={30} className={inputClass()} disabled={locked} />
              </Field>
              <Field label="Test load">
                <input name="testLoad" type="number" step="0.0001" required className={inputClass()} disabled={locked} />
              </Field>
              <Field label="Observed value">
                <input name="observedValue" type="number" step="0.0001" required className={inputClass()} disabled={locked} />
              </Field>
              <Field label="Permissible error (demo)">
                <input name="permissibleError" type="number" step="0.0001" required defaultValue={demoTolerance} className={inputClass()} disabled={locked} />
              </Field>
            </div>
            {!locked ? (
              <button disabled={pending} className="mt-3 rounded bg-navy px-4 py-2 text-sm font-semibold text-white">
                Add measurement
              </button>
            ) : null}
            <table className="mt-4 w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Test load</th>
                  <th>Observed</th>
                  <th>Error</th>
                  <th>Demo limit</th>
                  <th>Row result</th>
                </tr>
              </thead>
              <tbody>
                {item.measurements.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-2">{row.testLoad}</td>
                    <td>{row.observedValue}</td>
                    <td>{row.error}</td>
                    <td>{row.permissibleError}</td>
                    <td><StatusBadge status={row.result} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </form>

          <form onSubmit={addPhoto} className="rounded border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-navy">Inspection photos</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Photo kind">
                <select name="kind" className={inputClass()} disabled={locked}>
                  <option value="INSTRUMENT_FRONT">Instrument front</option>
                  <option value="SERIAL_NUMBER">Serial number</option>
                  <option value="SEAL_STAMP">Seal / stamp</option>
                  <option value="LOCATION_CONTEXT">Location context</option>
                  <option value="MEASUREMENT_DISPLAY">Measurement display</option>
                </select>
              </Field>
              <Field label="Photo (JPG/PNG)">
                <input name="photo" type="file" accept="image/*" required disabled={locked} className="text-sm" />
              </Field>
            </div>
            {!locked ? (
              <button disabled={pending} className="mt-3 rounded bg-navy px-4 py-2 text-sm font-semibold text-white">
                Upload photo
              </button>
            ) : null}
            <ul className="mt-3 list-disc pl-5 text-sm">
              {item.photos.map((photo) => (
                <li key={photo.id}>{photo.filename} · {photo.kind} · {formatDateTime(photo.capturedAt)}</li>
              ))}
            </ul>
          </form>

          {!locked ? (
            <div className="flex flex-wrap gap-3">
              <button disabled={pending} onClick={() => complete("PASS")} className="rounded bg-indiaGreen px-4 py-2 text-sm font-semibold text-white">
                Submit PASS
              </button>
              <button disabled={pending} onClick={() => complete("FAIL")} className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white">
                Submit FAIL
              </button>
              <button disabled={pending} onClick={() => complete("REQUIRES_REVIEW")} className="rounded border border-navy px-4 py-2 text-sm font-semibold text-navy">
                Submit for review
              </button>
            </div>
          ) : (
            <>
              <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Inspection submitted{item.result ? ` (${item.result})` : ""}.
              </p>

              {item.result === "PASS" && canIssue ? (
                <div className="flex flex-wrap gap-3">
                  {item.certificate ? (
                    <>
                      <Link
                        href={`/certificates/${item.certificate.id}`}
                        className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white"
                      >
                        Open certificate {item.certificate.certificateNumber}
                      </Link>

                      <button
                        disabled={pending}
                        onClick={() =>
                          downloadAuthorized(
                            `/api/certificates/${item.certificate!.id}/pdf`,
                            `${item.certificate!.certificateNumber}.pdf`,
                          )
                        }
                        className="rounded border border-navy px-4 py-2 text-sm font-semibold text-navy"
                      >
                        Download PDF
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={pending}
                      onClick={generateCertificate}
                      className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white"
                    >
                      Generate verification certificate
                    </button>
                  )}
                </div>
              ) : null}
            </>
          )}     </div>
      ) : null}
    </AppShell>
  );
}
