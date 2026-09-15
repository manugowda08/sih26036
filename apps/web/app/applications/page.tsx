"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, ErrorText, StatusBadge } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { formatDate } from "@/lib/format";

type Application = {
  id: string;
  applicationNumber: string;
  kind: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  instrument: { instrumentCode: string } | null;
};

export default function ApplicationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api<Application[]>("/api/applications")
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [router]);

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-navy">Verification applications</h2>
        <Link href="/applications/new" className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white">
          New application
        </Link>
      </div>
      <ErrorText message={error} />
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Application</th>
              <th>Instrument</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-3">
                  <Link href={`/applications/${item.id}`} className="font-semibold text-navy">
                    {item.applicationNumber}
                  </Link>
                </td>
                <td>{item.instrument?.instrumentCode}</td>
                <td>{item.kind}</td>
                <td><StatusBadge status={item.status} /></td>
                <td>{formatDate(item.submittedAt || item.createdAt)}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr><td className="px-4 py-8 text-slate-500" colSpan={5}>No applications found.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
