import test from "node:test";
import assert from "node:assert/strict";

import { calculateReviewPriority } from "./review-priority.js";

test("historical failed inspection increases review priority", () => {
  const result = calculateReviewPriority({
    previousFailedInspections: 1,
  });

  assert.equal(result.score, 20);
  assert.equal(result.level, "ATTENTION");

  assert.ok(
    result.reasons.some(
      (reason) => reason.code === "PREVIOUS_FAILED_INSPECTION",
    ),
  );
});

test("historical review-required inspection is explainable", () => {
  const result = calculateReviewPriority({
    previousReviewInspections: 1,
  });

  assert.equal(result.score, 10);
  assert.equal(result.level, "NORMAL");

  assert.ok(
    result.reasons.some(
      (reason) => reason.code === "PREVIOUS_REVIEW_REQUIRED",
    ),
  );
});

test("expired certificate creates review signal", () => {
  const result = calculateReviewPriority({
    certificateExpired: true,
  });

  assert.equal(result.score, 10);

  assert.ok(
    result.reasons.some(
      (reason) => reason.code === "CERTIFICATE_EXPIRED",
    ),
  );
});

test("revoked certificate creates stronger review signal", () => {
  const result = calculateReviewPriority({
    certificateRevoked: true,
  });

  assert.equal(result.score, 20);
  assert.equal(result.level, "ATTENTION");

  assert.ok(
    result.reasons.some(
      (reason) => reason.code === "CERTIFICATE_REVOKED",
    ),
  );
});

test("OCR and historical signals combine deterministically", () => {
  const result = calculateReviewPriority({
    ocrMismatches: [
      {
        field: "serialNumber",
        label: "Serial number",
        registered: "SIH-DEMO-001",
        extracted: "SIH-DEMO-007",
        message: "Serial number mismatch",
      },
      {
        field: "capacity",
        label: "Capacity",
        registered: "30 kg",
        extracted: "500 kg",
        message: "Capacity mismatch",
      },
    ],
    previousFailedInspections: 1,
  });

  assert.equal(result.score, 65);
  assert.equal(result.level, "HIGH");

  assert.equal(
    result.reasons.some(
      (reason) => reason.code === "PREVIOUS_FAILED_INSPECTION",
    ),
    true,
  );
});