import { test } from "node:test";
import assert from "node:assert/strict";
import { compareOcrToInstrument } from "./ocr-mismatch.ts";

test("detects serial mismatch without calling it fraud", () => {
  const mismatches = compareOcrToInstrument(
    { serialNumber: { value: "SIH-DEMO-007", status: "found", confidence: 0.9 } },
    { serialNumber: "SIH-DEMO-001", manufacturer: "DemoTech Instruments", model: "LM-500", capacity: "30 kg" },
  );
  assert.equal(mismatches[0]?.message, "Serial number mismatch");
});

test("detects capacity mismatch", () => {
  const mismatches = compareOcrToInstrument(
    { maxCapacity: { value: 500, unit: "kg", raw: "500 kg", status: "found" } },
    { serialNumber: "SIH-DEMO-001", capacity: "30 kg" },
  );
  assert.equal(mismatches.some((item) => item.field === "capacity"), true);
});

test("matching serial and 30 kg vs 30 Kgs is not a mismatch", () => {
  const mismatches = compareOcrToInstrument(
    {
      serialNumber: { value: "SIH-DEMO-001", status: "found" },
      maxCapacity: { value: 30, unit: "kg", raw: "30 kg", status: "found" },
      manufacturer: { value: "DemoTech Instruments", status: "found" },
    },
    { serialNumber: "sih-demo-001", capacity: "30 Kgs", manufacturer: "DemoTech Instruments" },
  );
  assert.equal(mismatches.length, 0);
});

test("does not mismatch when OCR field is missing", () => {
  const mismatches = compareOcrToInstrument(
    { serialNumber: { value: null, status: "not_found" } },
    { serialNumber: "SIH-DEMO-001" },
  );
  assert.equal(mismatches.length, 0);
});
