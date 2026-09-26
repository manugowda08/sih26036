import type { FieldMismatch } from "./ocr-mismatch.js";

export type ReviewPriorityLevel = "NORMAL" | "ATTENTION" | "HIGH";

export type ReviewReason = {
  code: string;
  label: string;
  points: number;
  evidence?: string;
};

export type ReviewPriorityInput = {
  ocrMismatches?: FieldMismatch[];

  previousFailedInspections?: number;
  previousReviewInspections?: number;

  locationMismatch?: boolean;

  failedMeasurements?: number;

  certificateExpired?: boolean;
  certificateRevoked?: boolean;
};

export type ReviewPriorityResult = {
  advisory: true;
  score: number;
  level: ReviewPriorityLevel;
  reasons: ReviewReason[];
  disclaimer: string;
};

const OCR_WEIGHTS: Record<FieldMismatch["field"], number> = {
  serialNumber: 25,
  capacity: 20,
  manufacturer: 15,
  model: 10,
  instrumentType: 10,
};

export function calculateReviewPriority(
  input: ReviewPriorityInput,
): ReviewPriorityResult {
  const reasons: ReviewReason[] = [];

  for (const mismatch of input.ocrMismatches ?? []) {
    const points = OCR_WEIGHTS[mismatch.field];

    reasons.push({
      code: `OCR_${mismatch.field.toUpperCase()}_MISMATCH`,
      label: mismatch.message,
      points,
      evidence:
        mismatch.registered != null || mismatch.extracted != null
          ? `Registered: ${mismatch.registered ?? "not available"}; document: ${mismatch.extracted ?? "not available"}`
          : undefined,
    });
  }

  if ((input.previousFailedInspections ?? 0) > 0) {
    reasons.push({
      code: "PREVIOUS_FAILED_INSPECTION",
      label: "Previous failed inspection",
      points: 20,
      evidence: `${input.previousFailedInspections} previous failed inspection(s)`,
    });
  }

  if ((input.previousReviewInspections ?? 0) > 0) {
    reasons.push({
      code: "PREVIOUS_REVIEW_REQUIRED",
      label: "Previous inspection required review",
      points: 10,
      evidence: `${input.previousReviewInspections} previous review-required inspection(s)`,
    });
  }

  if (input.locationMismatch) {
    reasons.push({
      code: "LOCATION_MISMATCH",
      label: "Inspection location requires review",
      points: 15,
    });
  }

  if ((input.failedMeasurements ?? 0) > 0) {
    reasons.push({
      code: "FAILED_MEASUREMENT",
      label: "Inspection contains failed measurement(s)",
      points: 20,
      evidence: `${input.failedMeasurements} failed measurement(s)`,
    });
  }

  if (input.certificateExpired) {
    reasons.push({
      code: "CERTIFICATE_EXPIRED",
      label: "Previous certificate is expired",
      points: 10,
    });
  }

  if (input.certificateRevoked) {
    reasons.push({
      code: "CERTIFICATE_REVOKED",
      label: "Previous certificate is revoked",
      points: 20,
    });
  }

  const rawScore = reasons.reduce((sum, reason) => sum + reason.points, 0);
  const score = Math.min(rawScore, 100);

  let level: ReviewPriorityLevel = "NORMAL";

  if (score >= 50) {
    level = "HIGH";
  } else if (score >= 20) {
    level = "ATTENTION";
  }

  return {
    advisory: true,
    score,
    level,
    reasons,
    disclaimer:
      "Review priority is an explainable workflow aid, not a fraud probability, statutory risk rating, or automatic Legal Metrology decision.",
  };
}