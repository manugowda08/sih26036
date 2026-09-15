"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getStoredUser } from "@/lib/api";
import { statusLabel } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "SUBMITTED" || status === "SCHEDULED" || status === "ASSIGNED"
      ? "bg-sky-100 text-sky-800"
      : status === "DRAFT" || status === "UNDER_REVIEW" || status === "REQUIRES_REVIEW"
        ? "bg-slate-100 text-slate-700"
        : status === "PASSED" || status === "PASS" || status === "VALID" || status === "ACTIVE" || status === "CERTIFICATE_GENERATED"
          ? "bg-emerald-100 text-emerald-800"
        : status === "FAILED" || status === "FAIL" || status === "EXPIRED" || status === "REVOKED" || status === "INVALID" || status === "DAYS_LT_7"
            ? "bg-red-100 text-red-800"
            : status === "EXPIRING" || status === "DAYS_7_30" || status === "DAYS_30_90" || status === "REVERIFICATION"
              ? "bg-amber-100 text-amber-800"
            : "bg-amber-100 text-amber-800";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStoredUser();
  const roles = user?.roles ?? [];
  const isStaff = roles.includes("ADMIN") || roles.includes("LMO") || roles.includes("GATC");

  const links = roles.includes("ADMIN")
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/applications", label: "Applications" },
        { href: "/certificates", label: "Certificates" },
        { href: "/notifications", label: "Notifications" },
      ]
    : roles.includes("LMO") || roles.includes("GATC")
      ? [
          { href: "/dashboard", label: "Dashboard" },
          { href: "/inspections", label: "Inspections" },
          { href: "/certificates", label: "Certificates" },
          { href: "/notifications", label: "Notifications" },
        ]
      : [
          { href: "/dashboard", label: "Dashboard" },
          { href: "/instruments", label: "Instruments" },
          { href: "/instruments/new", label: "Register instrument" },
          { href: "/applications", label: "Applications" },
          { href: "/applications/new", label: "Apply" },
          { href: "/certificates", label: "Certificates" },
          { href: "/notifications", label: "Notifications" },
        ];

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="h-1.5 bg-gradient-to-r from-saffron via-white to-indiaGreen" />
      <header className="border-b border-slate-200 bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-saffron bg-white text-sm font-bold text-navy">
              LM
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-saffron">Legal Metrology</p>
              <h1 className="text-lg font-semibold leading-tight">LM Smart Verification Portal</h1>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{user?.fullName ?? (isStaff ? "Officer" : "Owner")}</p>
            <p className="text-slate-300">{user?.email}</p>
            <button
              className="mt-1 text-xs underline decoration-saffron"
              onClick={() => {
                clearSession();
                router.push("/");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="bg-[#082c52]">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 py-2 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded px-3 py-1.5 ${
                  pathname === link.href ? "bg-white text-navy" : "text-slate-200 hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
        SIH 2026 prototype for PS26036. Not an official Government of India website.
      </footer>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export function inputClass() {
  return "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-navy";
}

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>;
}
