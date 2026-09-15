"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell, ErrorText } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { useState } from "react";

function StartInspection() {
  const router = useRouter();
  const search = useSearchParams();
  const applicationId = search.get("applicationId");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    if (!applicationId) {
      setError("Missing application");
      return;
    }
    api<{ id: string }>("/api/inspections", { method: "POST", body: { applicationId } })
      .then((row) => router.replace(`/inspections/${row.id}`))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not start inspection"));
  }, [applicationId, router]);

  return (
    <AppShell>
      <ErrorText message={error} />
      {!error ? <p className="text-sm text-slate-600">Opening inspection...</p> : null}
    </AppShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<AppShell><p className="text-sm">Loading...</p></AppShell>}>
      <StartInspection />
    </Suspense>
  );
}
