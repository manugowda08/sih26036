"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, ErrorText, StatusBadge } from "@/components/ui";
import { api, downloadAuthorized, getStoredUser, getToken } from "@/lib/api";
import { expiryBucketLabel, formatDate, formatDateTime } from "@/lib/format";

type Certificate = {
  id: string;
  certificateNumber: string;
  status: string;
  authorityName: string;
  verifiedAt: string;
  nextDueAt: string;
  issuedAt: string;
  digitalHash: string;
  verifyUrl: string;
  expiryBucket: string;
  expiryLabel: string;
  daysRemaining: number;
  canReverify: boolean;
  applicationId: string;
  instrumentId: string;
  inspectionResult: string;
  officer: { fullName: string };
  ownerName: string | null;
  businessName: string;
  instrument: {
    instrumentCode: string;
    serialNumber: string;
    manufacturer: string;
    model: string;
    capacity: string;
    typeName: string | null;
    locationText: string;
  };
};

export default function CertificateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Certificate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const roles = getStoredUser()?.roles ?? [];
  const isAdmin = roles.includes("ADMIN");
  const isOwner = roles.includes("OWNER");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api<Certificate>(`/api/certificates/${params.id}`)
      .then(setItem)
      .catch((err) => setError(err instanceof Error ? err.message : "Not found"));
  }, [params.id, router]);

  async function downloadPdf() {
    if (!item) return;
    setPending(true);
    setError(null);
    try {
      await downloadAuthorized(`/api/certificates/${item.id}/pdf`, `${item.certificateNumber}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download PDF");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <ErrorText message={error} />
      {item ? (
        <div className="space-y-4 rounded border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Certificate</p>
              <h2 className="text-xl font-semibold text-navy">{item.certificateNumber}</h2>
            </div>
            <StatusBadge status={item.expiryBucket === "EXPIRED" ? "EXPIRED" : item.status} />
          </div>
          <p className={`rounded px-3 py-2 text-sm ${item.expiryBucket === "EXPIRED" || item.expiryBucket === "DAYS_LT_7" ? "bg-red-50 text-red-900" : item.expiryBucket === "DAYS_7_30" || item.expiryBucket === "DAYS_30_90" ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-900"}`}>
            {item.expiryLabel} · {item.daysRemaining} day(s) from today
          </p>
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Business</dt>
              <dd>{item.businessName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Owner</dt>
              <dd>{item.ownerName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Instrument</dt>
              <dd>
                {item.instrument.typeName} · {item.instrument.manufacturer} {item.instrument.model}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Serial number</dt>
              <dd>{item.instrument.serialNumber}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Capacity / range</dt>
              <dd>{item.instrument.capacity}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Location</dt>
              <dd>{item.instrument.locationText}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Verification date</dt>
              <dd>{formatDate(item.verifiedAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Valid until</dt>
              <dd>{formatDate(item.nextDueAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Authority</dt>
              <dd>{item.authorityName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Officer</dt>
              <dd>{item.officer.fullName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Issued</dt>
              <dd>{formatDateTime(item.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Inspection result</dt>
              <dd>{item.inspectionResult}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-slate-500">Digital hash</dt>
              <dd className="break-all font-mono text-xs">{item.digitalHash}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={pending}
              onClick={downloadPdf}
              className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white"
            >
              Download PDF
            </button>
            {item.verifyUrl ? (
              <a href={item.verifyUrl} target="_blank" rel="noreferrer" className="rounded border border-navy px-4 py-2 text-sm font-semibold text-navy">
                Open public verification
              </a>
            ) : null}
            <Link href={`/instruments/${item.instrumentId}`} className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-navy">
              Instrument history
            </Link>
            {isOwner && item.canReverify ? (
              <button
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setError(null);
                  try {
                    const app = await api<{ id: string }>(`/api/certificates/${item.id}/reverify`, {
                      method: "POST",
                      body: { notes: `Reverification of ${item.certificateNumber}` },
                    });
                    router.push(`/applications/${app.id}`);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not start reverification");
                  } finally {
                    setPending(false);
                  }
                }}
                className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Start reverification
              </button>
            ) : null}
          </div>
          {isAdmin ? (
            <form
              className="rounded border border-dashed border-slate-300 p-4 text-sm"
              onSubmit={async (event) => {
                event.preventDefault();
                const value = String(new FormData(event.currentTarget).get("nextDueAt") || "");
                setPending(true);
                setError(null);
                try {
                  const updated = await api<Certificate>(`/api/certificates/${item.id}/prototype-due`, {
                    method: "PATCH",
                    body: { nextDueAt: value },
                  });
                  setItem(updated);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not update demo due date");
                } finally {
                  setPending(false);
                }
              }}
            >
              <p className="mb-2 font-medium text-navy">Prototype due date (admin demo)</p>
              <p className="mb-2 text-xs text-slate-500">Changes the stored validity date so expiry categories and notifications can be demonstrated. Does not rewrite the original certificate record identity.</p>
              <div className="flex flex-wrap gap-2">
                <input name="nextDueAt" type="date" required className="rounded border border-slate-300 px-3 py-2" />
                <button disabled={pending} className="rounded bg-navy px-3 py-2 font-semibold text-white">
                  Apply demo due date
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}
