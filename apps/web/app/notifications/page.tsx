"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, ErrorText, StatusBadge } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Note = {
  id: string;
  title: string;
  body: string;
  channel: string;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    return api<Note[]>("/api/notifications").then(setRows);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load notifications"));
  }, [router]);

  async function markRead(id: string) {
    await api(`/api/notifications/${id}/read`, { method: "POST", body: {} });
    await load();
  }

  return (
    <AppShell>
      <h2 className="mb-2 text-xl font-semibold text-navy">Notifications</h2>
      <p className="mb-4 text-sm text-slate-600">
        In-app expiry alerts. Email and WhatsApp rows are demo channels only — nothing is sent outside this prototype.
      </p>
      <ErrorText message={error} />
      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.id} className={`rounded border bg-white p-4 ${row.readAt ? "border-slate-200" : "border-saffron"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-navy">{row.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{row.body}</p>
              </div>
              <div className="text-right text-xs">
                <StatusBadge status={row.channel} />
                <p className="mt-1 text-slate-500">{formatDateTime(row.createdAt)}</p>
                {!row.readAt ? (
                  <button className="mt-2 text-navy underline" onClick={() => markRead(row.id)}>
                    Mark read
                  </button>
                ) : (
                  <p className="mt-2 text-slate-400">Read</p>
                )}
              </div>
            </div>
          </article>
        ))}
        {rows.length === 0 ? <p className="text-sm text-slate-500">No notifications yet.</p> : null}
      </div>
    </AppShell>
  );
}
