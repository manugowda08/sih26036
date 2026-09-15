"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, ErrorText, StatusBadge } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { dueTone, formatDate } from "@/lib/format";

type Detail = {
  id: string;
  instrumentCode: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  capacity: string;
  accuracyClass: string | null;
  purpose: string | null;
  currentStatus: string;
  registeredAt: string;
  lastVerifiedAt: string | null;
  nextDueAt: string | null;
    type: { name: string; code: string };
  business: { name: string };
  location: { address: string | null; city: string | null; state: string | null };
  applications: Array<{
    id: string;
    applicationNumber: string;
    kind: string;
    status: string;
    createdAt: string;
  }>;
  certificates: Array<{
    id: string;
    certificateNumber: string;
    status: string;
    verifiedAt: string;
    nextDueAt: string;
    issuedAt: string;
  }>;
  history: Array<{
    id: string;
    event: string;
    notes: string | null;
    occurredAt: string;
    certificateNumber: string | null;
  }>;
};

export default function InstrumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api<Detail>(`/api/instruments/${params.id}`)
      .then(setItem)
      .catch((err) => setError(err instanceof Error ? err.message : "Not found"));
  }, [params.id, router]);

  return (
    <AppShell>
      <ErrorText message={error} />
      {item ? (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">Instrument file</p>
              <h2 className="text-2xl font-semibold text-navy">{item.instrumentCode}</h2>
              <p className="text-sm text-slate-600">
                {item.manufacturer} {item.model} · Serial {item.serialNumber}
              </p>
            </div>
            <Link
              href={`/applications/new?instrumentId=${item.id}&kind=REVERIFICATION`}
              className="rounded border border-navy px-4 py-2 text-sm font-semibold text-navy"
            >
              Start reverification
            </Link>
            <Link
              href={`/applications/new?instrumentId=${item.id}`}
              className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white"
            >
              Apply for verification
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded border border-slate-200 bg-white p-4 text-sm">
              <h3 className="mb-3 font-semibold">Particulars</h3>
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-slate-500">Type</dt>
                <dd>{item.type.name}</dd>
                <dt className="text-slate-500">Capacity / range</dt>
                <dd>{item.capacity}</dd>
                <dt className="text-slate-500">Accuracy class</dt>
                <dd>{item.accuracyClass || "—"}</dd>
                <dt className="text-slate-500">Purpose / use</dt>
                <dd>{item.purpose || "—"}</dd>
                <dt className="text-slate-500">Business</dt>
                <dd>{item.business.name}</dd>
                <dt className="text-slate-500">Status</dt>
                <dd><StatusBadge status={item.currentStatus} /></dd>
              </dl>
            </section>
            <section className="rounded border border-slate-200 bg-white p-4 text-sm">
              <h3 className="mb-3 font-semibold">Location and validity</h3>
              <p>{item.location.address}</p>
              <p>
                {item.location.city}, {item.location.state}
              </p>
              <p className="mt-3 text-slate-500">Registered {formatDate(item.registeredAt)}</p>
              <p>Last verified: {formatDate(item.lastVerifiedAt)}</p>
              <p>Next due / expiry: {formatDate(item.nextDueAt)}</p>
              <p className="text-xs text-slate-500">{dueTone(item.nextDueAt)}</p>
            </section>
          </div>
          <section className="mt-6 rounded border border-slate-200 bg-white">
            <h3 className="border-b px-4 py-3 font-semibold">Applications</h3>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Number</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {item.applications.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2">
                      <Link href={`/applications/${row.id}`} className="text-navy">{row.applicationNumber}</Link>
                    </td>
                    <td>{row.kind}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
                {item.applications.length === 0 ? (
                  <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>No applications yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </section>
          <section className="mt-6 rounded border border-slate-200 bg-white">
            <h3 className="border-b px-4 py-3 font-semibold">Verification history</h3>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th>Certificate</th>
                  <th>Event</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {item.history.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2">{formatDate(row.occurredAt)}</td>
                    <td>{row.certificateNumber ?? "—"}</td>
                    <td>{row.event.replaceAll("_", " ")}</td>
                    <td>{row.notes ?? "—"}</td>
                  </tr>
                ))}
                {item.certificates.map((row) => (
                  <tr key={`cert-${row.id}`} className="border-t">
                    <td className="px-4 py-2">{formatDate(row.verifiedAt)}</td>
                    <td>
                      <Link href={`/certificates/${row.id}`} className="text-navy underline">{row.certificateNumber}</Link>
                    </td>
                    <td>Verified — {row.status}</td>
                    <td>Valid until {formatDate(row.nextDueAt)}</td>
                  </tr>
                ))}
                {item.history.length === 0 && item.certificates.length === 0 ? (
                  <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>No verification history yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
