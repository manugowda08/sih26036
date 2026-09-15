"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { publicApi } from "@/lib/api";
import { formatDate } from "@/lib/format";

export type PublicVerifyResult = {
  outcome: "VALID" | "EXPIRED" | "REVOKED" | "INVALID";
  message?: string;
  certificateNumber?: string;
  status?: string;
  authorityName?: string;
  verifiedAt?: string;
  nextDueAt?: string;
  issuedAt?: string;
  officerName?: string;
  ownerName?: string | null;
  businessName?: string;
  verificationStatus?: string;
  instrument?: {
    serialNumber: string;
    manufacturer: string;
    model: string;
    capacity: string;
    typeName: string | null;
    locationText: string;
  };
};

function stampClass(outcome: string) {
  if (outcome === "VALID") return "border-indiaGreen bg-emerald-50 text-indiaGreen";
  if (outcome === "EXPIRED") return "border-amber-600 bg-amber-50 text-amber-800";
  return "border-red-700 bg-red-50 text-red-800";
}

export function PublicVerifyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="h-1.5 bg-gradient-to-r from-saffron via-white to-indiaGreen" />
      <header className="border-b border-slate-200 bg-navy text-white">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-saffron">Legal Metrology</p>
          <h1 className="text-xl font-semibold">LM Smart public certificate verification</h1>
          <p className="mt-1 text-sm text-slate-300">Anyone can check a verification certificate without signing in.</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
        SIH 2026 prototype for PS26036. Not an official Government of India website.
      </footer>
    </div>
  );
}

export function VerifyResultCard({ result }: { result: PublicVerifyResult }) {
  const outcome = result.outcome;
  return (
    <div className="rounded border border-slate-200 bg-white p-6 shadow-sm">
      <div className={`mb-6 rounded border-4 px-4 py-6 text-center ${stampClass(outcome)}`}>
        <p className="text-xs uppercase tracking-[0.2em]">Verification result</p>
        <p className="mt-1 text-4xl font-black tracking-wide">{outcome}</p>
        <p className="mt-2 text-sm">{result.message}</p>
      </div>
      {outcome !== "INVALID" && result.certificateNumber ? (
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Certificate number</dt>
            <dd className="font-semibold text-navy">{result.certificateNumber}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Certificate status</dt>
            <dd>{result.status}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Business / establishment</dt>
            <dd>{result.businessName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Owner</dt>
            <dd>{result.ownerName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Instrument type</dt>
            <dd>{result.instrument?.typeName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Manufacturer / model</dt>
            <dd>
              {result.instrument?.manufacturer} {result.instrument?.model}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Serial number</dt>
            <dd>{result.instrument?.serialNumber}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Capacity / range</dt>
            <dd>{result.instrument?.capacity}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-slate-500">Instrument location</dt>
            <dd>{result.instrument?.locationText}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Verification date</dt>
            <dd>{formatDate(result.verifiedAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Valid until / next due</dt>
            <dd>{formatDate(result.nextDueAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Issuing authority</dt>
            <dd>{result.authorityName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Authorized officer</dt>
            <dd>{result.officerName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Inspection result</dt>
            <dd>{result.verificationStatus}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

export function VerifyLookupForm({ initialToken = "" }: { initialToken?: string }) {
  const router = useRouter();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("token");
    const token = String(value ?? "").trim();
    if (!token) return;
    router.push(`/verify/${encodeURIComponent(token)}`);
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 rounded border border-slate-200 bg-white p-4">
      <label className="block text-sm font-medium text-ink">Certificate verification token</label>
      <div className="mt-2 flex gap-2">
        <input
          name="token"
          defaultValue={initialToken}
          placeholder="Paste the token from the QR URL"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white">Verify</button>
      </div>
    </form>
  );
}

export function VerifyByToken({ token }: { token: string }) {
  const [result, setResult] = useState<PublicVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicApi<PublicVerifyResult>(`/api/public/verify/${encodeURIComponent(token)}`)
      .then(setResult)
      .catch((err) => setError(err instanceof Error ? err.message : "Verification failed"));
  }, [token]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!result) return <p className="text-sm text-slate-600">Checking certificate…</p>;
  return <VerifyResultCard result={result} />;
}

export function VerifyTokenPage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params.token ?? "");
  return (
    <PublicVerifyShell>
      <VerifyLookupForm initialToken={token} />
      {token ? <VerifyByToken token={token} /> : null}
    </PublicVerifyShell>
  );
}
