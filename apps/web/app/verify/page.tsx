"use client";

import { PublicVerifyShell, VerifyLookupForm } from "@/components/PublicVerify";

export default function VerifyIndexPage() {
  return (
    <PublicVerifyShell>
      <VerifyLookupForm />
      <p className="text-sm text-slate-600">
        Scan a certificate QR code, or paste the signed token from the verification URL.
      </p>
    </PublicVerifyShell>
  );
}
