export const DAY_MS = 24 * 60 * 60 * 1000;

export type ExpiryBucket = "DAYS_90_PLUS" | "DAYS_30_90" | "DAYS_7_30" | "DAYS_LT_7" | "EXPIRED" | "REVOKED";

export function daysRemaining(nextDueAt: Date, now = new Date()) {
  return Math.ceil((nextDueAt.getTime() - now.getTime()) / DAY_MS);
}

export function expiryBucket(
  nextDueAt: Date,
  status?: string | null,
  now = new Date(),
): ExpiryBucket {
  if (status === "REVOKED") return "REVOKED";
  const days = daysRemaining(nextDueAt, now);
  if (days < 0 || status === "EXPIRED") return "EXPIRED";
  if (days < 7) return "DAYS_LT_7";
  if (days < 30) return "DAYS_7_30";
  if (days < 90) return "DAYS_30_90";
  return "DAYS_90_PLUS";
}

export function expiryLabel(bucket: ExpiryBucket) {
  switch (bucket) {
    case "DAYS_90_PLUS":
      return "90+ days remaining";
    case "DAYS_30_90":
      return "30–90 days remaining";
    case "DAYS_7_30":
      return "7–30 days remaining";
    case "DAYS_LT_7":
      return "Less than 7 days remaining";
    case "EXPIRED":
      return "EXPIRED";
    case "REVOKED":
      return "REVOKED";
  }
}

export function notificationMilestone(bucket: ExpiryBucket) {
  if (bucket === "DAYS_30_90") return "D90";
  if (bucket === "DAYS_7_30") return "D30";
  if (bucket === "DAYS_LT_7") return "D7";
  if (bucket === "EXPIRED") return "EXPIRED";
  return null;
}

export function instrumentStatusForBucket(bucket: ExpiryBucket) {
  if (bucket === "EXPIRED") return "EXPIRED" as const;
  if (bucket === "DAYS_LT_7" || bucket === "DAYS_7_30") return "EXPIRING" as const;
  if (bucket === "REVOKED") return "EXPIRED" as const;
  return "ACTIVE" as const;
}
