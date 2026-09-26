import assert from "node:assert/strict";
import test from "node:test";

import { calculateReviewPriority } from "./review-priority";

test("returns NORMAL when there are no review signals", () => {
  const result = calculateReviewPriority({});

  assert.equal(result.score, 0);
  assert.equal(result.level, "NORMAL");
  assert.equal(result.reasons.length, 0);
});

test("serial mismatch creates an explainable attention signal", () => {
  const result = calculateReviewPriority({
    ocrMismatches: [
      {
        field: "serialNumber",
        label: "Serial number",
        registered: "SIH-DEMO-001",
        extracted: "SIH-DEMO-007",
        message: "Serial number mismatch",
      },
    ],
  });

  assert.equal(result.score, 25);
  assert.equal(result.level, "ATTENTION");
  assert.equal(result.reasons[0]?.code, "OCR_SERIALNUMBER_MISMATCH");
});

test("multiple independent signals can produce HIGH priority", () => {
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
  assert.equal(result.reasons.length, 3);
});

test("score is capped at 100", () => {
  const result = calculateReviewPriority({
    ocrMismatches: [
      {
        field: "serialNumber",
        label: "Serial number",
        registered: "A",
        extracted: "B",
        message: "Serial number mismatch",
      },
      {
        field: "capacity",
        label: "Capacity",
        registered: "30 kg",
        extracted: "500 kg",
        message: "Capacity mismatch",
      },
      {
        field: "manufacturer",
        label: "Manufacturer",
        registered: "A",
        extracted: "B",
        message: "Manufacturer mismatch",
      },
    ],
    previousFailedInspections: 3,
    previousReviewInspections: 2,
    locationMismatch: true,
    failedMeasurements: 2,
    certificateExpired: true,
    certificateRevoked: true,
  });

  assert.equal(result.score, 100);
  assert.equal(result.level, "HIGH");
});

test("disclaimer states that priority is not fraud probability", () => {
  const result = calculateReviewPriority({});

  assert.match(result.disclaimer, /not a fraud probability/i);
});