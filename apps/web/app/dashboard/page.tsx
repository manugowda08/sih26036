"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, ErrorText, StatusBadge } from "@/components/ui";
import { api, getStoredUser, getToken } from "@/lib/api";
import { dueTone, expiryBucketLabel, formatDate, formatDateTime } from "@/lib/format";

type ExpiryRow = {
  id: string;
  certificateNumber: string;
  status: string;
  expiryBucket: string;
  nextDueAt: string;
  applicationId: string;
  instrumentId: string;
  businessName: string;
  instrumentCode: string;
  serialNumber: string;
  typeName: string | null;
};

type OwnerDash = {
  summary: {
    instruments: number;
    activeCertificates: number;
    expiringSoon: number;
    expired: number;
    reverificationRequired: number;
    unreadNotifications: number;
  };
  instruments: Array<{
    id: string;
    instrumentCode: string;
    serialNumber: string;
    currentStatus: string;
    nextDueAt: string | null;
    type: { name: string };
  }>;
  applications: Array<{
    id: string;
    applicationNumber: string;
    status: string;
    kind: string;
    instrument: { instrumentCode: string } | null;
  }>;
  certificates: {
    active: ExpiryRow[];
    expiringSoon: ExpiryRow[];
    expired: ExpiryRow[];
    reverificationRequired: ExpiryRow[];
  };
};

type AdminDash = {
  summary: {
    submitted: number;
    underReview: number;
    scheduled: number;
    assigned: number;
    inProgress: number;
    unreadNotifications: number;
  };
  applications: Array<{
    id: string;
    applicationNumber: string;
    status: string;
    owner: { fullName: string } | null;
    instrument: { instrumentCode: string } | null;
    schedule: { scheduledAt: string; assignedOfficer: { fullName: string } | null } | null;
  }>;
  expiry: {
    totalActive: number;
    within90: number;
    within30: number;
    within7: number;
    expired: number;
    lists: {
      active: ExpiryRow[];
      within90: ExpiryRow[];
      within30: ExpiryRow[];
      within7: ExpiryRow[];
      expired: ExpiryRow[];
    };
  };
};

type OfficerDash = {
  summary: { assigned: number; upcoming: number; completed: number };
  assigned: Array<{
    id: string;
    applicationNumber: string;
    status: string;
    inspectionId: string | null;
    instrument: { instrumentCode: string; location: { city: string | null } | null } | null;
    business: { name: string } | null;
    owner: { fullName: string } | null;
    schedule: { scheduledAt: string } | null;
  }>;
  inspections: Array<{
    id: string;
    result: string | null;
    submittedAt: string | null;
    application: { applicationNumber: string; status: string } | null;
    instrument: { instrumentCode: string } | null;
  }>;
};

export default function DashboardPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerDash | null>(null);
  const [admin, setAdmin] = useState<AdminDash | null>(null);
  const [officer, setOfficer] = useState<OfficerDash | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    const current = getStoredUser()?.roles ?? [];
    setRoles(current);
    const path = current.includes("ADMIN")
      ? "/api/dashboard/admin"
      : current.includes("LMO") || current.includes("GATC")
        ? "/api/dashboard/officer"
        : "/api/dashboard/owner";
    api<OwnerDash & AdminDash & OfficerDash>(path)
      .then((data) => {
        if (current.includes("ADMIN")) setAdmin(data);
        else if (current.includes("LMO") || current.includes("GATC")) setOfficer(data);
        else setOwner(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, [router]);

  return (
    <AppShell>
      <ErrorText message={error} />
      {admin ? <AdminView data={admin} /> : null}
      {officer ? <OfficerView data={officer} /> : null}
      {owner ? <OwnerView data={owner} /> : null}
      {!admin && !officer && !owner && roles.length === 0 ? null : null}
    </AppShell>
  );
}

function CertTable({ rows }: { rows: ExpiryRow[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-4 text-sm text-slate-500">None in this category.</p>;
  }
  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
        <tr>
          <th className="px-4 py-2">Certificate</th>
          <th>Instrument</th>
          <th>Due</th>
          <th>Category</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t">
            <td className="px-4 py-2">
              <Link href={`/certificates/${row.id}`} className="font-medium text-navy underline">
                {row.certificateNumber}
              </Link>
              <p className="text-xs text-slate-500">{row.businessName}</p>
            </td>
            <td>
              <Link href={`/instruments/${row.instrumentId}`} className="text-navy underline">
                {row.instrumentCode}
              </Link>
              <p className="text-xs text-slate-500">
                <Link href={`/applications/${row.applicationId}`} className="underline">
                  Application
                </Link>
              </p>
            </td>
            <td>{formatDate(row.nextDueAt)}</td>
            <td>
              <StatusBadge status={row.expiryBucket === "EXPIRED" ? "EXPIRED" : row.status} />
              <p className="text-xs text-slate-500">{expiryBucketLabel(row.expiryBucket)}</p>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OwnerView({ data }: { data: OwnerDash }) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Owner workspace</p>
          <h2 className="text-2xl font-semibold text-navy">Verification dashboard</h2>
        </div>
        <Link href="/instruments/new" className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white">
          Register instrument
        </Link>
      </div>
      {data.summary.expired > 0 || data.summary.reverificationRequired > 0 ? (
        <div className="mb-4 rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">
          {data.summary.expired} certificate(s) have expired
          {data.summary.reverificationRequired
            ? ` and ${data.summary.reverificationRequired} require reverification.`
            : "."}{" "}
          <Link href="/notifications" className="underline">
            View notifications
          </Link>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Active certificates", data.summary.activeCertificates, ""],
          ["Expiring soon", data.summary.expiringSoon, "text-amber-800"],
          ["Expired", data.summary.expired, "text-red-800"],
          ["Reverification required", data.summary.reverificationRequired, "text-red-800"],
          ["Unread alerts", data.summary.unreadNotifications, ""],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-2 text-3xl font-semibold ${tone || "text-navy"}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6">
        <section className="rounded border border-amber-300 bg-white">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-950">
            Expiring soon
          </div>
          <CertTable rows={data.certificates.expiringSoon} />
        </section>
        <section className="rounded border border-red-300 bg-white">
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-950">Expired</div>
          <CertTable rows={data.certificates.expired} />
        </section>
        <section className="rounded border border-slate-200 bg-white">
          <div className="border-b px-4 py-3 font-semibold">Reverification required</div>
          <CertTable rows={data.certificates.reverificationRequired} />
        </section>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">Registered instruments</h3>
            <Link href="/instruments" className="text-sm text-navy underline">View all</Link>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">Code</th><th>Type</th><th>Status</th><th>Due</th></tr>
            </thead>
            <tbody>
              {data.instruments.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link href={`/instruments/${item.id}`} className="font-medium text-navy">{item.instrumentCode}</Link>
                    <p className="text-xs text-slate-500">{item.serialNumber}</p>
                  </td>
                  <td>{item.type.name}</td>
                  <td><StatusBadge status={item.currentStatus} /></td>
                  <td>
                    <p>{formatDate(item.nextDueAt)}</p>
                    <p className="text-xs text-slate-500">{dueTone(item.nextDueAt)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">Recent applications</h3>
            <Link href="/applications" className="text-sm text-navy underline">View all</Link>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">Application</th><th>Kind</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.applications.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link href={`/applications/${item.id}`} className="font-medium text-navy">{item.applicationNumber}</Link>
                    <p className="text-xs text-slate-500">{item.instrument?.instrumentCode}</p>
                  </td>
                  <td>{item.kind}</td>
                  <td><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function AdminView({ data }: { data: AdminDash }) {
  return (
    <>
      <p className="text-xs uppercase tracking-widest text-slate-500">Administrator</p>
      <h2 className="mb-6 text-2xl font-semibold text-navy">Scheduling and expiry desk</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(data.summary)
          .filter(([key]) => key !== "unreadNotifications")
          .map(([label, value]) => (
          <div key={label} className="rounded border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-navy">{value}</p>
          </div>
        ))}
      </div>
      <h3 className="mb-3 mt-8 font-semibold text-navy">Certificate expiry monitoring</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Total active", data.expiry.totalActive, "text-navy"],
          ["Expiring within 90 days", data.expiry.within90, "text-amber-800"],
          ["Expiring within 30 days", data.expiry.within30, "text-amber-900"],
          ["Expiring within 7 days", data.expiry.within7, "text-red-800"],
          ["Expired", data.expiry.expired, "text-red-800"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-2 text-3xl font-semibold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>
      <section className="mt-6 rounded border border-amber-300 bg-white">
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 font-semibold">Due within 90 days</div>
        <CertTable rows={data.expiry.lists.within90} />
      </section>
      <section className="mt-4 rounded border border-red-300 bg-white">
        <div className="border-b border-red-200 bg-red-50 px-4 py-3 font-semibold">Expired certificates</div>
        <CertTable rows={data.expiry.lists.expired} />
      </section>
      <section className="mt-8 rounded border border-slate-200 bg-white">
        <div className="border-b px-4 py-3 font-semibold">Applications awaiting action</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Application</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Schedule</th>
            </tr>
          </thead>
          <tbody>
            {data.applications.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`/applications/${item.id}`} className="font-medium text-navy">{item.applicationNumber}</Link>
                  <p className="text-xs text-slate-500">{item.instrument?.instrumentCode}</p>
                </td>
                <td>{item.owner?.fullName}</td>
                <td><StatusBadge status={item.status} /></td>
                <td>
                  {item.schedule ? formatDateTime(item.schedule.scheduledAt) : "Not scheduled"}
                  <p className="text-xs text-slate-500">{item.schedule?.assignedOfficer?.fullName}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function OfficerView({ data }: { data: OfficerDash }) {
  return (
    <>
      <p className="text-xs uppercase tracking-widest text-slate-500">Field officer</p>
      <h2 className="mb-6 text-2xl font-semibold text-navy">Inspection dashboard</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Assigned", data.summary.assigned],
          ["Upcoming", data.summary.upcoming],
          ["Completed", data.summary.completed],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-navy">{value}</p>
          </div>
        ))}
      </div>
      <section className="mt-8 rounded border border-slate-200 bg-white">
        <div className="border-b px-4 py-3 font-semibold">Assigned inspections</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Application</th>
              <th>Owner / business</th>
              <th>Location</th>
              <th>Scheduled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.assigned.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`/applications/${item.id}`} className="font-medium text-navy">{item.applicationNumber}</Link>
                  <p className="text-xs text-slate-500">{item.instrument?.instrumentCode}</p>
                  <StatusBadge status={item.status} />
                </td>
                <td>
                  {item.owner?.fullName}
                  <p className="text-xs text-slate-500">{item.business?.name}</p>
                </td>
                <td>{item.instrument?.location?.city ?? "—"}</td>
                <td>{formatDateTime(item.schedule?.scheduledAt)}</td>
                <td>
                  <Link href={item.inspectionId ? `/inspections/${item.inspectionId}` : `/inspections/new?applicationId=${item.id}`} className="text-navy underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="mt-6 rounded border border-slate-200 bg-white">
        <div className="border-b px-4 py-3 font-semibold">Inspection records</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Inspection</th><th>Application</th><th>Result</th></tr>
          </thead>
          <tbody>
            {data.inspections.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`/inspections/${item.id}`} className="text-navy">{item.instrument?.instrumentCode}</Link>
                </td>
                <td>{item.application?.applicationNumber}</td>
                <td>{item.result ? <StatusBadge status={item.result} /> : "In progress"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
