export type OcrField = {
  value?: string | number | null;
  unit?: string | null;
  raw?: string | null;
  original?: string | null;
  confidence?: number;
  status?: string;
};

export type RegisteredInstrument = {
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  capacity?: string | null;
  typeName?: string | null;
};

export type FieldMismatch = {
  field: "manufacturer" | "model" | "serialNumber" | "capacity" | "instrumentType";
  label: string;
  registered: string | null;
  extracted: string | null;
  message: string;
};

const UNIT_TO_GRAMS: Record<string, number> = {
  kg: 1000,
  g: 1,
  mg: 0.001,
  t: 1_000_000,
};

function collapse(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function alnum(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseCapacity(raw: string | null | undefined): { grams: number | null; display: string | null } {
  if (!raw) return { grams: null, display: null };
  const match = collapse(raw).match(
    /([0-9]+(?:[.,][0-9]+)?)\s*(kgs?|kilograms?|grams?|gms?|g|mg|tonnes?|tons?|t)?/i,
  );
  if (!match) return { grams: null, display: collapse(raw) };
  const amount = Number(match[1].replace(",", "."));
  const unitRaw = (match[2] || "kg").toLowerCase();
  const unit = unitRaw.startsWith("kg") || unitRaw.startsWith("kilogram")
    ? "kg"
    : unitRaw.startsWith("mg")
      ? "mg"
      : unitRaw.startsWith("t")
        ? "t"
        : unitRaw.startsWith("g")
          ? "g"
          : "kg";
  const factor = UNIT_TO_GRAMS[unit];
  return {
    grams: Number.isFinite(amount) ? amount * factor : null,
    display: `${amount} ${unit}`,
  };
}

function fieldText(field: OcrField | undefined): string | null {
  if (!field || field.status === "not_found" || field.value == null || field.value === "") return null;
  if (typeof field.value === "number") {
    return field.raw || `${field.value}${field.unit ? ` ${field.unit}` : ""}`;
  }
  return String(field.value);
}

export function compareOcrToInstrument(
  fields: Record<string, OcrField | undefined>,
  instrument: RegisteredInstrument | null | undefined,
): FieldMismatch[] {
  if (!instrument) return [];
  const mismatches: FieldMismatch[] = [];

  const serialExtracted = fieldText(fields.serialNumber);
  if (serialExtracted && instrument.serialNumber && alnum(serialExtracted) !== alnum(instrument.serialNumber)) {
    mismatches.push({
      field: "serialNumber",
      label: "Serial number",
      registered: instrument.serialNumber,
      extracted: serialExtracted,
      message: "Serial number mismatch",
    });
  }

  const manufacturer = fieldText(fields.manufacturer);
  if (manufacturer && instrument.manufacturer && collapse(manufacturer).toLowerCase() !== collapse(instrument.manufacturer).toLowerCase()) {
    mismatches.push({
      field: "manufacturer",
      label: "Manufacturer",
      registered: instrument.manufacturer,
      extracted: manufacturer,
      message: "Manufacturer mismatch",
    });
  }

  const model = fieldText(fields.model);
  if (model && instrument.model && collapse(model).toLowerCase() !== collapse(instrument.model).toLowerCase()) {
    mismatches.push({
      field: "model",
      label: "Model",
      registered: instrument.model,
      extracted: model,
      message: "Model mismatch",
    });
  }

  const extractedCapacity = fieldText(fields.maxCapacity) || (fields.maxCapacity?.raw ?? null);
  const left = parseCapacity(extractedCapacity);
  const right = parseCapacity(instrument.capacity);
  if (left.grams != null && right.grams != null && Math.abs(left.grams - right.grams) / Math.max(right.grams, 1) > 0.02) {
    mismatches.push({
      field: "capacity",
      label: "Capacity",
      registered: instrument.capacity ?? null,
      extracted: extractedCapacity,
      message: "Capacity mismatch",
    });
  }

  const typeName = fieldText(fields.instrumentType);
  if (typeName && instrument.typeName) {
    const a = collapse(typeName).toLowerCase();
    const b = collapse(instrument.typeName).toLowerCase();
    if (!a.includes(b) && !b.includes(a) && alnum(a) !== alnum(b)) {
      mismatches.push({
        field: "instrumentType",
        label: "Instrument type",
        registered: instrument.typeName,
        extracted: typeName,
        message: "Instrument type mismatch",
      });
    }
  }

  return mismatches;
}
