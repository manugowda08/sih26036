import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(100),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(15).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(100),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const locationSchema = z.object({
  label: z.string().trim().max(120).optional(),
  address: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().max(80).optional(),
  state: z.string().trim().min(2).max(80),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(160),
  gstin: z.string().trim().max(20).optional(),
  location: locationSchema.optional(),
});

const emptyToUndef = (value: unknown) => (value === "" || value == null ? undefined : value);

const optionalDate = z.preprocess(
  emptyToUndef,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
);

const optionalText = z.preprocess(emptyToUndef, z.string().trim().max(400).optional());

export const createInstrumentSchema = z
  .object({
    businessId: z.string().uuid().optional(),
    business: createBusinessSchema.optional(),
    typeId: z.string().uuid(),
    manufacturer: z.string().trim().min(2).max(120),
    model: z.string().trim().min(1).max(80),
    serialNumber: z.string().trim().min(1).max(80),
    capacity: z.string().trim().min(1).max(80),
    accuracyClass: optionalText,
    purpose: optionalText,
    location: locationSchema,
    previousCertificateNumber: z.preprocess(emptyToUndef, z.string().trim().max(80).optional()),
    lastVerifiedAt: optionalDate,
    nextDueAt: optionalDate,
  })
  .refine((value) => Boolean(value.businessId || value.business), {
    message: "Provide businessId or a new business",
    path: ["businessId"],
  });

export const updateInstrumentSchema = z.object({
  manufacturer: z.string().trim().min(2).max(120).optional(),
  model: z.string().trim().min(1).max(80).optional(),
  capacity: z.string().trim().min(1).max(80).optional(),
  accuracyClass: z.string().trim().max(40).optional(),
  purpose: z.string().trim().max(400).optional(),
  location: locationSchema.optional(),
});

export const createApplicationSchema = z.object({
  instrumentId: z.string().uuid(),
  kind: z.enum(["VERIFICATION", "REVERIFICATION"]),
  notes: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
});

export const updateApplicationStatusSchema = z.object({
  status: z.enum(["SUBMITTED", "UNDER_REVIEW"]),
});

export const createScheduleSchema = z.object({
  applicationId: z.string().uuid(),
  scheduledAt: z.string().min(10),
  assignedOfficerId: z.string().uuid(),
  assignmentReason: z.preprocess(emptyToUndef, z.string().trim().max(400).optional()),
});

export const assignOfficerSchema = z.object({
  applicationId: z.string().uuid(),
  assignedOfficerId: z.string().uuid(),
  assignmentReason: z.preprocess(emptyToUndef, z.string().trim().max(400).optional()),
});

export const checklistSchema = z.object({
  identificationVerified: z.boolean().optional(),
  serialNumberMatches: z.boolean().optional(),
  physicalConditionOk: z.boolean().optional(),
  displayFunctioning: z.boolean().optional(),
  zeroIndicationChecked: z.boolean().optional(),
  measurementAccuracyChecked: z.boolean().optional(),
  sealStampOk: z.boolean().optional(),
  documentsChecked: z.boolean().optional(),
});

export const updateInspectionSchema = z.object({
  remarks: z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
  locationMismatch: z.boolean().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  checklist: checklistSchema.optional(),
});

export const createMeasurementSchema = z.object({
  capacity: z.coerce.number(),
  testLoad: z.coerce.number(),
  observedValue: z.coerce.number(),
  permissibleError: z.coerce.number().nonnegative(),
});

export const completeInspectionSchema = z.object({
  result: z.enum(["PASS", "FAIL", "REQUIRES_REVIEW"]),
  remarks: z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
});

export const createCertificateSchema = z.object({
  inspectionId: z.string().uuid(),
});

export const prototypeDueSchema = z.object({
  nextDueAt: z.string().min(10),
});

export const createReverificationSchema = z.object({
  notes: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
});

export type CreateInstrumentInput = z.infer<typeof createInstrumentSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
