import {
  PublicVerifyShell,
  VerifyLookupForm,
  VerifyResultCard,
  type PublicVerifyResult,
} from "@/components/PublicVerify";

export default async function VerifyTokenRoutePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const response = await fetch(`${api}/api/public/verify/${encodeURIComponent(decoded)}`, { cache: "no-store" });
  const result = (await response.json().catch(() => ({
    outcome: "INVALID",
    message: "This verification token is not valid.",
  }))) as PublicVerifyResult;

  return (
    <PublicVerifyShell>
      <VerifyLookupForm initialToken={decoded} />
      <VerifyResultCard result={result} />
    </PublicVerifyShell>
  );
}
