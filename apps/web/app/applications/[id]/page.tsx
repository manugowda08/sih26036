"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, ErrorText, Field, StatusBadge, inputClass } from "@/components/ui";
import { api, getStoredUser, getToken } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";

type Officer = { userId: string; role: string; code: string; fullName: string; email: string };
type Detail = {
  id: string;
  applicationNumber: string;
  kind: string;
  status: string;
  notes: string | null;
  submittedAt: string | null;
  createdAt: string;
  inspectionId: string | null;
  owner: { fullName: string; email: string; phone: string | null } | null;
  instrument: {
    id: string;
    instrumentCode: string;
    serialNumber: string;
    manufacturer: string;
    model: string;
    location: { address: string | null; city: string | null; state: string | null } | null;
  } | null;
  business: { name: string } | null;
  schedule: {
    scheduledAt: string;
    assignmentReason: string | null;
    assignedOfficer: { id: string; fullName: string; email: string } | null;
  } | null;
  documents: Array<{ id: string; filename: string; sizeBytes: number }>;
};

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roles = getStoredUser()?.roles ?? [];
  const isAdmin = roles.includes("ADMIN");
  const isOfficer = roles.includes("LMO") || roles.includes("GATC");
  const isOwner = roles.includes("OWNER");
  const [item, setItem] = useState<Detail | null>(null);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function load() {
    return api<Detail>(`/api/applications/${params.id}`).then(setItem);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    load().catch((err) => setError(err instanceof Error ? err.message : "Not found"));
    if (isAdmin) {
      api<Officer[]>("/api/officers").then(setOfficers).catch(() => undefined);
    }
  }, [params.id, router, isAdmin]);

  async function startReview() {
    setPending(true);
    setError(null);
    try {
      const updated = await api<Detail>(`/api/applications/${params.id}/review`, { method: "POST", body: {} });
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start review");
    } finally {
      setPending(false);
    }
  }

  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const updated = await api<Detail>("/api/scheduling", {
        method: "POST",
        body: {
          applicationId: params.id,
          scheduledAt: String(form.get("scheduledAt")),
          assignedOfficerId: String(form.get("assignedOfficerId")),
          assignmentReason: String(form.get("assignmentReason") || ""),
        },
      });
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <ErrorText message={error} />
      {item ? (
        <div className="space-y-4">
          <div className="rounded border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-widest text-slate-500">Application tracking</p>
            <h2 className="text-2xl font-semibold text-navy">{item.applicationNumber}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusBadge status={item.status} />
              <span className="text-sm text-slate-600">{item.kind}</span>
            </div>
            <p className="mt-3 text-sm">Created {formatDate(item.createdAt)}</p>
            <p className="text-sm">Submitted {formatDate(item.submittedAt)}</p>
            {item.owner ? <p className="text-sm">Owner: {item.owner.fullName} ({item.owner.email})</p> : null}
            {item.schedule ? (
              <div className="mt-3 rounded bg-sky-50 px-3 py-2 text-sm">
                Scheduled {formatDateTime(item.schedule.scheduledAt)}
                {item.schedule.assignedOfficer ? ` · Officer ${item.schedule.assignedOfficer.fullName}` : ""}
                {item.schedule.assignmentReason ? <p className="text-xs text-slate-600">{item.schedule.assignmentReason}</p> : null}
              </div>
            ) : null}
          </div>

          {item.instrument ? (
            <div className="rounded border border-slate-200 bg-white p-5 text-sm">
              <h3 className="font-semibold">Instrument / establishment</h3>
              <p>{item.instrument.instrumentCode} · SN {item.instrument.serialNumber}</p>
              <p>{item.instrument.manufacturer} {item.instrument.model}</p>
              <p>{item.business?.name}</p>
              <p>{item.instrument.location?.address}, {item.instrument.location?.city}, {item.instrument.location?.state}</p>
            </div>
          ) : null}

          <div className="rounded border border-slate-200 bg-white p-5 text-sm">
            <h3 className="font-semibold">Documents</h3>
            <ul className="mt-2 list-disc pl-5">
              {item.documents.map((doc) => (
                <li key={doc.id}>{doc.filename} ({Math.round(doc.sizeBytes / 1024)} KB)</li>
              ))}
            </ul>
            {item.notes ? <p className="mt-3">Remarks: {item.notes}</p> : null}
          </div>

          {isAdmin && (item.status === "SUBMITTED" || item.status === "UNDER_REVIEW" || item.status === "SCHEDULED" || item.status === "ASSIGNED") ? (
            <div className="rounded border border-slate-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-navy">Schedule and assign officer</h3>
              {item.status === "SUBMITTED" ? (
                <button disabled={pending} onClick={startReview} className="mb-4 rounded border border-navy px-4 py-2 text-sm text-navy">
                  Take up for review
                </button>
              ) : null}
              <form onSubmit={schedule} className="grid gap-4 md:grid-cols-2">
                <Field label="Inspection date and time">
                  <input name="scheduledAt" type="datetime-local" required className={inputClass()} />
                </Field>
                <Field label="Assign LMO / GATC">
                  <select name="assignedOfficerId" required className={inputClass()}>
                    <option value="">Select officer</option>
                    {officers.map((officer) => (
                      <option key={officer.userId} value={officer.userId}>
                        {officer.fullName} ({officer.role} {officer.code})
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Assignment note">
                    <input name="assignmentReason" defaultValue="Assigned by administrator for field verification" className={inputClass()} />
                  </Field>
                </div>
                <button disabled={pending} className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white">
                  {pending ? "Saving..." : "Save schedule and assignment"}
                </button>
              </form>
            </div>
          ) : null}

          {isOwner && item.status === "DRAFT" ? (
            <form
              className="rounded border border-slate-200 p-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setPending(true);
                setError(null);
                const file = (event.currentTarget.elements.namedItem("document") as HTMLInputElement).files?.[0];
                try {
                  if (file) {
                    const upload = new FormData();
                    upload.append("file", file);
                    await api(`/api/applications/${item.id}/documents`, { method: "POST", formData: upload });
                  }
                  const updated = await api<Detail>(`/api/applications/${item.id}/submit`, { method: "POST", body: {} });
                  setItem(updated);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not submit application");
                } finally {
                  setPending(false);
                }
              }}
            >
              <h3 className="mb-2 font-semibold text-navy">Complete draft application</h3>
              <p className="mb-3 text-sm text-slate-600">Upload a supporting document, then submit for departmental review.</p>
              <input name="document" type="file" required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="mb-3 block text-sm" />
              <button disabled={pending} className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white">
                Submit application
              </button>
            </form>
          ) : null}

          {isOfficer && item.status === "ASSIGNED" ? (
            <Link href={`/inspections/new?applicationId=${item.id}`} className="inline-block rounded bg-navy px-4 py-2 text-sm font-semibold text-white">
              Start inspection
            </Link>
          ) : null}
          {item.inspectionId ? (
            <Link href={`/inspections/${item.inspectionId}`} className="inline-block text-sm text-navy underline">
              Open inspection record
            </Link>
          ) : null}
          {isAdmin && item.status === "PASSED" && item.inspectionId ? (
            <button
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setError(null);
                try {
                  const cert = await api<{ id: string }>("/api/certificates", {
                    method: "POST",
                    body: { inspectionId: item.inspectionId },
                  });
                  router.push(`/certificates/${cert.id}`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not generate certificate");
                } finally {
                  setPending(false);
                }
              }}
              className="block rounded bg-navy px-4 py-2 text-sm font-semibold text-white"
            >
              Generate verification certificate
            </button>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}
