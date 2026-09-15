import type {
  Application,
  ApplicationDocument,
  Business,
  Certificate,
  Inspection,
  InspectionChecklist,
  InspectionMeasurement,
  InspectionPhoto,
  Instrument,
  InstrumentType,
  Location,
  User,
  VerificationSchedule,
} from "@prisma/client";
import { daysRemaining, expiryBucket, expiryLabel } from "./expiry.js";

type Loc = Location;

export function num(value: { toString(): string } | null | undefined) {
  if (value == null) return null;
  return Number(value.toString());
}

export function presentLocation(location: Loc | null | undefined) {
  if (!location) return null;
  return {
    id: location.id,
    label: location.label,
    address: location.address,
    city: location.city,
    district: location.district,
    state: location.state,
    latitude: num(location.latitude),
    longitude: num(location.longitude),
  };
}

export function presentBusiness(
  business: Business & { location?: Loc | null },
) {
  return {
    id: business.id,
    name: business.name,
    gstin: business.gstin,
    location: presentLocation(business.location),
  };
}

export function presentInstrument(
  instrument: Instrument & {
    type: InstrumentType;
    business: Business & { location?: Loc | null };
    location: Loc;
    applications?: Application[];
  },
) {
  return {
    id: instrument.id,
    instrumentCode: instrument.instrumentCode,
    manufacturer: instrument.manufacturer,
    model: instrument.model,
    serialNumber: instrument.serialNumber,
    capacity: instrument.capacity,
    accuracyClass: instrument.accuracyClass,
    purpose: instrument.purpose,
    currentStatus: instrument.currentStatus,
    registeredAt: instrument.registeredAt,
    lastVerifiedAt: instrument.lastVerifiedAt,
    nextDueAt: instrument.nextDueAt,
    type: {
      id: instrument.type.id,
      code: instrument.type.code,
      name: instrument.type.name,
      category: instrument.type.category,
      unit: instrument.type.unit,
      defaultPermissibleError: num(instrument.type.defaultPermissibleError),
    },
    business: presentBusiness(instrument.business),
    location: presentLocation(instrument.location),
  };
}

export function presentApplication(
  application: Application & {
    instrument?: (Instrument & { type?: InstrumentType; location?: Loc }) | null;
    documents?: ApplicationDocument[];
    business?: (Business & { location?: Loc | null }) | null;
    owner?: Pick<User, "id" | "fullName" | "email" | "phone"> | null;
    schedule?: (VerificationSchedule & { assignedOfficer?: Pick<User, "id" | "fullName" | "email"> | null }) | null;
    inspections?: Inspection[];
  },
) {
  return {
    id: application.id,
    applicationNumber: application.applicationNumber,
    kind: application.kind,
    status: application.status,
    notes: application.notes,
    submittedAt: application.submittedAt,
    createdAt: application.createdAt,
    owner: application.owner
      ? {
          id: application.owner.id,
          fullName: application.owner.fullName,
          email: application.owner.email,
          phone: application.owner.phone,
        }
      : null,
    instrument: application.instrument
      ? {
          id: application.instrument.id,
          instrumentCode: application.instrument.instrumentCode,
          serialNumber: application.instrument.serialNumber,
          manufacturer: application.instrument.manufacturer,
          model: application.instrument.model,
          capacity: application.instrument.capacity,
          currentStatus: application.instrument.currentStatus,
          nextDueAt: application.instrument.nextDueAt,
          location: presentLocation(application.instrument.location),
          type: application.instrument.type
            ? {
                id: application.instrument.type.id,
                name: application.instrument.type.name,
                code: application.instrument.type.code,
                unit: application.instrument.type.unit,
                defaultPermissibleError: num(application.instrument.type.defaultPermissibleError),
              }
            : null,
        }
      : null,
    business: application.business
      ? presentBusiness(application.business)
      : null,
    schedule: application.schedule
      ? {
          id: application.schedule.id,
          scheduledAt: application.schedule.scheduledAt,
          assignmentReason: application.schedule.assignmentReason,
          assignedOfficer: application.schedule.assignedOfficer
            ? {
                id: application.schedule.assignedOfficer.id,
                fullName: application.schedule.assignedOfficer.fullName,
                email: application.schedule.assignedOfficer.email,
              }
            : null,
        }
      : null,
    inspectionId: application.inspections?.[0]?.id ?? null,
    documents: (application.documents ?? []).map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt,
    })),
  };
}

export function presentInspection(
  inspection: Inspection & {
    application?: Application & {
      owner?: Pick<User, "id" | "fullName" | "email"> | null;
      business?: Business | null;
      schedule?: (VerificationSchedule & { assignedOfficer?: Pick<User, "id" | "fullName" | "email"> | null }) | null;
    };
    instrument?: Instrument & { type?: InstrumentType; location?: Loc; business?: Business | null };
    officer?: Pick<User, "id" | "fullName" | "email">;
    location?: Loc | null;
    checklist?: InspectionChecklist | null;
    measurements?: InspectionMeasurement[];
    photos?: InspectionPhoto[];
    certificates?: Array<{ id: string; certificateNumber: string; status: string }>;
  },
) {
  return {
    id: inspection.id,
    result: inspection.result,
    remarks: inspection.remarks,
    locationMismatch: inspection.locationMismatch,
    startedAt: inspection.startedAt,
    submittedAt: inspection.submittedAt,
    createdAt: inspection.createdAt,
    officer: inspection.officer
      ? { id: inspection.officer.id, fullName: inspection.officer.fullName, email: inspection.officer.email }
      : null,
    location: presentLocation(inspection.location),
    application: inspection.application
      ? {
          id: inspection.application.id,
          applicationNumber: inspection.application.applicationNumber,
          status: inspection.application.status,
          kind: inspection.application.kind,
          owner: inspection.application.owner ?? null,
          business: inspection.application.business
            ? { id: inspection.application.business.id, name: inspection.application.business.name }
            : null,
          schedule: inspection.application.schedule
            ? {
                scheduledAt: inspection.application.schedule.scheduledAt,
                assignedOfficer: inspection.application.schedule.assignedOfficer ?? null,
              }
            : null,
        }
      : null,
    instrument: inspection.instrument
      ? {
          id: inspection.instrument.id,
          instrumentCode: inspection.instrument.instrumentCode,
          serialNumber: inspection.instrument.serialNumber,
          manufacturer: inspection.instrument.manufacturer,
          model: inspection.instrument.model,
          capacity: inspection.instrument.capacity,
          location: presentLocation(inspection.instrument.location),
          business: inspection.instrument.business
            ? { id: inspection.instrument.business.id, name: inspection.instrument.business.name }
            : null,
          type: inspection.instrument.type
            ? {
                name: inspection.instrument.type.name,
                code: inspection.instrument.type.code,
                unit: inspection.instrument.type.unit,
                defaultPermissibleError: num(inspection.instrument.type.defaultPermissibleError),
              }
            : null,
        }
      : null,
    checklist: inspection.checklist,
    measurements: (inspection.measurements ?? []).map((row) => ({
      id: row.id,
      capacity: num(row.capacity),
      testLoad: num(row.testLoad),
      observedValue: num(row.observedValue),
      error: num(row.error),
      permissibleError: num(row.permissibleError),
      result: row.result,
      createdAt: row.createdAt,
    })),
    photos: (inspection.photos ?? []).map((photo) => ({
      id: photo.id,
      kind: photo.kind,
      filename: photo.filename,
      capturedAt: photo.capturedAt,
      latitude: num(photo.latitude),
      longitude: num(photo.longitude),
    })),
    certificate: inspection.certificates?.[0]
      ? {
          id: inspection.certificates[0].id,
          certificateNumber: inspection.certificates[0].certificateNumber,
          status: inspection.certificates[0].status,
        }
      : null,
  };
}

export function locationText(location?: Loc | null) {
  if (!location) return "—";
  return [location.label, location.address, location.city, location.district, location.state]
    .filter((part) => part && part.trim())
    .join(", ");
}

export type CertificateRecord = Certificate & {
  instrument: Instrument & { type?: InstrumentType | null; location?: Loc | null };
  business: Business;
  officer: Pick<User, "id" | "fullName">;
  application: Application & { owner?: Pick<User, "id" | "fullName"> | null };
  inspection?: Pick<Inspection, "id" | "result"> | null;
  qrTokens?: Array<{ token: string }>;
};

export function presentCertificate(row: CertificateRecord, verifyUrl: string) {
  const bucket = expiryBucket(row.nextDueAt, row.status);
  return {
    id: row.id,
    certificateNumber: row.certificateNumber,
    status: bucket === "EXPIRED" && row.status === "ACTIVE" ? "EXPIRED" : row.status,
    expiryBucket: bucket,
    expiryLabel: expiryLabel(bucket),
    daysRemaining: daysRemaining(row.nextDueAt),
    canReverify: bucket === "EXPIRED" || bucket === "DAYS_LT_7" || bucket === "DAYS_7_30" || bucket === "DAYS_30_90",
    applicationId: row.applicationId,
    instrumentId: row.instrumentId,
    authorityName: row.authorityName,
    verificationFee: num(row.verificationFee),
    verifiedAt: row.verifiedAt,
    nextDueAt: row.nextDueAt,
    issuedAt: row.issuedAt,
    digitalHash: row.digitalHash,
    verifyUrl,
    inspectionResult: row.inspection?.result ?? "PASS",
    officer: { fullName: row.officer.fullName },
    ownerName: row.application.owner?.fullName ?? null,
    businessName: row.business.name,
    instrument: {
      id: row.instrument.id,
      instrumentCode: row.instrument.instrumentCode,
      serialNumber: row.instrument.serialNumber,
      manufacturer: row.instrument.manufacturer,
      model: row.instrument.model,
      capacity: row.instrument.capacity,
      typeName: row.instrument.type?.name ?? null,
      locationText: locationText(row.instrument.location),
    },
  };
}

export function presentPublicVerification(outcome: "VALID" | "EXPIRED" | "REVOKED" | "INVALID", row?: CertificateRecord) {
  if (outcome === "INVALID" || !row) {
    return {
      outcome: "INVALID" as const,
      message: "This verification token is not valid.",
    };
  }
  return {
    outcome,
    message:
      outcome === "VALID"
        ? "This certificate is valid."
        : outcome === "EXPIRED"
          ? "This certificate has expired."
          : "This certificate has been revoked.",
    certificateNumber: row.certificateNumber,
    status: row.status,
    authorityName: row.authorityName,
    verifiedAt: row.verifiedAt,
    nextDueAt: row.nextDueAt,
    issuedAt: row.issuedAt,
    officerName: row.officer.fullName,
    ownerName: row.application.owner?.fullName ?? null,
    businessName: row.business.name,
    verificationStatus: row.inspection?.result ?? "PASS",
    instrument: {
      serialNumber: row.instrument.serialNumber,
      manufacturer: row.instrument.manufacturer,
      model: row.instrument.model,
      capacity: row.instrument.capacity,
      typeName: row.instrument.type?.name ?? null,
      locationText: locationText(row.instrument.location),
    },
  };
}

export function parseDate(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
