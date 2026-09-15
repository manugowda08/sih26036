"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, ErrorText, StatusBadge } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Row = {
  id: string;
  result: string | null;
  submittedAt: string | null;
  application: { id: string; applicationNumber: string; status: string } | null;
  instrument: { instrumentCode: string } | null;
};

export default function InspectionsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api<Row[]>("/api/inspections")
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [router]);

  return (
    <AppShell>
      <h2 className="mb-4 text-2xl font-semibold text-navy">Inspections</h2>
      <ErrorText message={error} />
      <div className="rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Instrument</th>
              <th>Application</th>
              <th>Status</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-3">
                  <Link href={`/inspections/${row.id}`} className="font-medium text-navy">
                    {row.instrument?.instrumentCode}
                  </Link>
                </td>
                <td>{row.application?.applicationNumber}</td>
                <td><StatusBadge status={row.application?.status ?? "DRAFT"} /></td>
                <td>{row.result ? <StatusBadge status={row.result} /> : formatDateTime(row.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
