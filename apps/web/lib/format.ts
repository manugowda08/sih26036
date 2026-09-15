export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function dueTone(nextDueAt?: string | null) {
  if (!nextDueAt) return "No due date recorded";
  const due = new Date(nextDueAt);
  const now = new Date();
  const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "EXPIRED";
  if (days < 7) return `Less than 7 days (${days} day(s))`;
  if (days < 30) return `7–30 days remaining (${days} day(s))`;
  if (days < 90) return `30–90 days remaining (${days} day(s))`;
  return "90+ days remaining";
}

export function expiryBucketLabel(bucket?: string | null) {
  if (bucket === "DAYS_90_PLUS") return "90+ days remaining";
  if (bucket === "DAYS_30_90") return "30–90 days remaining";
  if (bucket === "DAYS_7_30") return "7–30 days remaining";
  if (bucket === "DAYS_LT_7") return "Less than 7 days remaining";
  if (bucket === "EXPIRED") return "EXPIRED";
  if (bucket === "REVOKED") return "REVOKED";
  return bucket ?? "—";
}
