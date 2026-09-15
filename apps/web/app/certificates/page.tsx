"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, ErrorText, StatusBadge } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { formatDate } from "@/lib/format";

type CertificateRow = {
  id: string;
  certificateNumber: string;
  status: string;
  verifiedAt: string;
  nextDueAt: string;
  businessName: string;
  ownerName: string | null;
  instrument: { serialNumber: string; typeName: string | null };
};

export default function CertificatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CertificateRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api<CertificateRow[]>("/api/certificates")
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load certificates"));
  }, [router]);

  return (
    <AppShell>
      <h2 className="mb-4 text-xl font-semibold text-navy">Verification certificates</h2>
      <ErrorText message={error} />
      <table className="w-full overflow-hidden rounded border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="px-3 py-2">Certificate</th>
            <th>Business</th>
            <th>Instrument</th>
            <th>Verified</th>
            <th>Valid until</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="px-3 py-2">
                <Link className="font-medium text-navy underline" href={`/certificates/${row.id}`}>
                  {row.certificateNumber}
                </Link>
              </td>
              <td>{row.businessName}</td>
              <td>
                {row.instrument.typeName} · {row.instrument.serialNumber}
              </td>
              <td>{formatDate(row.verifiedAt)}</td>
              <td>{formatDate(row.nextDueAt)}</td>
              <td>
                <StatusBadge status={row.status} />
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-slate-500" colSpan={6}>
                No certificates have been issued yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </AppShell>
  );
}
