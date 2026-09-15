"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, ErrorText, StatusBadge } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { dueTone, formatDate } from "@/lib/format";

type Instrument = {
  id: string;
  instrumentCode: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  currentStatus: string;
  nextDueAt: string | null;
  type: { name: string };
  location: { city: string | null; state: string | null } | null;
};

export default function InstrumentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Instrument[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api<Instrument[]>("/api/instruments")
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [router]);

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-navy">Registered instruments</h2>
        <Link href="/instruments/new" className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white">
          Add instrument
        </Link>
      </div>
      <ErrorText message={error} />
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Instrument</th>
              <th>Type</th>
              <th>Location</th>
              <th>Status</th>
              <th>Due / expiry</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-3">
                  <Link href={`/instruments/${item.id}`} className="font-semibold text-navy">
                    {item.instrumentCode}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {item.manufacturer} {item.model} · SN {item.serialNumber}
                  </p>
                </td>
                <td>{item.type.name}</td>
                <td>{item.location ? `${item.location.city}, ${item.location.state}` : "—"}</td>
                <td><StatusBadge status={item.currentStatus} /></td>
                <td>
                  {formatDate(item.nextDueAt)}
                  <p className="text-xs text-slate-500">{dueTone(item.nextDueAt)}</p>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={5}>
                  No instruments registered. Add one to start a verification application.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
