import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { PhotoKind, type InspectionResult } from "@prisma/client";
import {
  completeInspectionSchema,
  createMeasurementSchema,
  updateInspectionSchema,
} from "@lm-smart/validation";
import { loadEnv } from "@lm-smart/config";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { inspectionInclude } from "../lib/includes.js";
import { presentInspection } from "../lib/present.js";
import { requireRoles } from "../plugins/rbac.js";
import {
  calculatePostgisDistance,
  getInspectionLocationEvidence,
} from "../lib/geospatial.js";

const PHOTO_KINDS = new Set<string>(Object.values(PhotoKind));

function canAccessInspection(
  roles: string[],
  userId: string,
  officerId: string,
) {
  if (roles.includes("ADMIN")) return true;
  return officerId === userId;
}

async function syncStatus(
  applicationId: string,
  instrumentId: string,
  status:
    | "INSPECTION_IN_PROGRESS"
    | "PASSED"
    | "FAILED"
    | "UNDER_REVIEW",
) {
  await prisma.$transaction([
    prisma.application.update({
      where: { id: applicationId },
      data: { status },
    }),
    prisma.instrument.update({
      where: { id: instrumentId },
      data: { currentStatus: status },
    }),
  ]);
}

export async function inspectionRoutes(app: FastifyInstance) {
  const env = loadEnv();

  // ---------------------------------------------------------
  // GET ALL INSPECTIONS
  // ---------------------------------------------------------

  app.get(
    "/api/inspections",
    {
      preHandler: requireRoles(app, ["ADMIN", "LMO", "GATC"]),
    },
    async (request) => {
      const mine = !request.user.roles.includes("ADMIN");

      const rows = await prisma.inspection.findMany({
        where: mine ? { officerId: request.user.sub } : undefined,
        include: inspectionInclude,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(presentInspection);
    },
  );

  // ---------------------------------------------------------
  // GET ONE INSPECTION
  // ---------------------------------------------------------

  app.get(
    "/api/inspections/:id",
    {
      preHandler: requireRoles(app, [
        "ADMIN",
        "LMO",
        "GATC",
        "OWNER",
      ]),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const inspection = await prisma.inspection.findUnique({
        where: { id },
        include: inspectionInclude,
      });

      if (!inspection) {
        return reply.code(404).send({
          error: "Inspection not found",
        });
      }

      const ownerOk =
        request.user.roles.includes("OWNER") &&
        inspection.application.owner?.id === request.user.sub;

      if (
        !ownerOk &&
        !canAccessInspection(
          request.user.roles,
          request.user.sub,
          inspection.officerId,
        )
      ) {
        return reply.code(403).send({
          error: "Forbidden",
        });
      }

      const locationEvidence =
        await getInspectionLocationEvidence(inspection.id);

      return {
        ...presentInspection(inspection),
        locationEvidence,
      };
    },
  );

  // ---------------------------------------------------------
  // CREATE / START INSPECTION
  // ---------------------------------------------------------

  app.post(
    "/api/inspections",
    {
      preHandler: requireRoles(app, ["LMO", "GATC", "ADMIN"]),
    },
    async (request, reply) => {
      const body = (request.body ?? {}) as {
        applicationId?: string;
      };

      if (!body.applicationId) {
        return reply.code(400).send({
          error: "applicationId is required",
        });
      }

      const application = await prisma.application.findUnique({
        where: {
          id: body.applicationId,
        },
        include: {
          schedule: true,
          instrument: true,
          inspections: true,
        },
      });

      if (!application) {
        return reply.code(404).send({
          error: "Application not found",
        });
      }

      if (!application.schedule?.assignedOfficerId) {
        return reply.code(400).send({
          error: "Application has no assigned officer",
        });
      }

      if (
        !request.user.roles.includes("ADMIN") &&
        application.schedule.assignedOfficerId !== request.user.sub
      ) {
        return reply.code(403).send({
          error: "This inspection is not assigned to you",
        });
      }

      const existing = application.inspections[0];

      if (existing) {
        const full = await prisma.inspection.findUnique({
          where: {
            id: existing.id,
          },
          include: inspectionInclude,
        });

        return presentInspection(full!);
      }

      const officerId =
        application.schedule.assignedOfficerId;

      const inspection = await prisma.inspection.create({
        data: {
          applicationId: application.id,
          instrumentId: application.instrumentId,
          officerId,
          locationId: application.instrument.locationId,
          startedAt: new Date(),
          checklist: {
            create: {},
          },
        },
        include: inspectionInclude,
      });

      await syncStatus(
        application.id,
        application.instrumentId,
        "INSPECTION_IN_PROGRESS",
      );

      await writeAudit({
        request,
        userId: request.user.sub,
        action: "START_INSPECTION",
        entity: "inspection",
        entityId: inspection.id,
      });

      const full = await prisma.inspection.findUnique({
        where: {
          id: inspection.id,
        },
        include: inspectionInclude,
      });

      return reply
        .code(201)
        .send(presentInspection(full!));
    },
  );

  // ---------------------------------------------------------
  // UPDATE INSPECTION
  // Includes PostGIS registered-vs-captured distance
  // ---------------------------------------------------------

  app.put(
    "/api/inspections/:id",
    {
      preHandler: requireRoles(app, ["LMO", "GATC", "ADMIN"]),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed = updateInspectionSchema.safeParse(
        request.body,
      );

      if (!parsed.success) {
        return reply.code(400).send({
          error: "Invalid input",
          details: parsed.error.flatten(),
        });
      }

      const inspection =
        await prisma.inspection.findUnique({
          where: { id },
        });

      if (!inspection) {
        return reply.code(404).send({
          error: "Inspection not found",
        });
      }

      if (
        !canAccessInspection(
          request.user.roles,
          request.user.sub,
          inspection.officerId,
        )
      ) {
        return reply.code(403).send({
          error: "Forbidden",
        });
      }

      if (inspection.submittedAt) {
        return reply.code(400).send({
          error: "Inspection is already submitted",
        });
      }

      let locationId = inspection.locationId;

      let locationEvidence:
        | {
            registered: {
              latitude: number;
              longitude: number;
            };
            captured: {
              latitude: number;
              longitude: number;
            };
            distanceMeters: number;
            calculation: "POSTGIS";
            advisory: true;
          }
        | null = null;

      // If field GPS has been supplied, compare it with the
      // instrument's registered location using PostGIS.
      if (
        parsed.data.latitude != null &&
        parsed.data.longitude != null
      ) {
        const instrument =
          await prisma.instrument.findUnique({
            where: {
              id: inspection.instrumentId,
            },
            include: {
              location: true,
            },
          });

        if (!instrument?.location) {
          return reply.code(400).send({
            error:
              "Registered instrument location not found",
          });
        }

        locationEvidence =
          await calculatePostgisDistance(
            {
              latitude: Number(
                instrument.location.latitude,
              ),
              longitude: Number(
                instrument.location.longitude,
              ),
            },
            {
              latitude: parsed.data.latitude,
              longitude: parsed.data.longitude,
            },
          );

        const capturedLocation =
          await prisma.location.create({
            data: {
              label: "Inspection GPS",
              latitude: parsed.data.latitude,
              longitude: parsed.data.longitude,
              city: "Field",
              state: "Karnataka",
              address: "Captured during inspection",
            },
          });

        locationId = capturedLocation.id;
      }

      await prisma.inspection.update({
        where: {
          id,
        },
        data: {
          remarks: parsed.data.remarks,

          // This remains an officer/workflow signal.
          // We intentionally do NOT create a statutory
          // distance threshold here.
          locationMismatch:
            parsed.data.locationMismatch,

          locationId,
        },
      });

      if (parsed.data.checklist) {
        await prisma.inspectionChecklist.upsert({
          where: {
            inspectionId: id,
          },
          update: parsed.data.checklist,
          create: {
            inspectionId: id,
            ...parsed.data.checklist,
          },
        });
      }

      const full =
        await prisma.inspection.findUnique({
          where: {
            id,
          },
          include: inspectionInclude,
        });

      const presented =
        presentInspection(full!);

      return {
        ...presented,
        locationEvidence,
      };
    },
  );

  // ---------------------------------------------------------
  // ADD MEASUREMENT
  // ---------------------------------------------------------

  app.post(
    "/api/inspections/:id/measurements",
    {
      preHandler: requireRoles(app, ["LMO", "GATC", "ADMIN"]),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed =
        createMeasurementSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "Invalid input",
          details: parsed.error.flatten(),
        });
      }

      const inspection =
        await prisma.inspection.findUnique({
          where: { id },
        });

      if (!inspection) {
        return reply.code(404).send({
          error: "Inspection not found",
        });
      }

      if (
        !canAccessInspection(
          request.user.roles,
          request.user.sub,
          inspection.officerId,
        )
      ) {
        return reply.code(403).send({
          error: "Forbidden",
        });
      }

      if (inspection.submittedAt) {
        return reply.code(400).send({
          error: "Inspection is already submitted",
        });
      }

      const error =
        parsed.data.observedValue -
        parsed.data.testLoad;

      const measurementResult: InspectionResult =
        Math.abs(error) <=
        parsed.data.permissibleError
          ? "PASS"
          : "FAIL";

      await prisma.inspectionMeasurement.create({
        data: {
          inspectionId: id,
          capacity: parsed.data.capacity,
          testLoad: parsed.data.testLoad,
          observedValue:
            parsed.data.observedValue,
          error,
          permissibleError:
            parsed.data.permissibleError,
          result: measurementResult,
        },
      });

      await writeAudit({
        request,
        userId: request.user.sub,
        action: "UPDATE_MEASUREMENT",
        entity: "inspection",
        entityId: id,
      });

      const full =
        await prisma.inspection.findUnique({
          where: {
            id,
          },
          include: inspectionInclude,
        });

      return reply
        .code(201)
        .send(presentInspection(full!));
    },
  );

  // ---------------------------------------------------------
  // UPLOAD INSPECTION PHOTO
  // ---------------------------------------------------------

  app.post(
    "/api/inspections/:id/photos",
    {
      preHandler: requireRoles(app, ["LMO", "GATC", "ADMIN"]),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const inspection =
        await prisma.inspection.findUnique({
          where: { id },
        });

      if (!inspection) {
        return reply.code(404).send({
          error: "Inspection not found",
        });
      }

      if (
        !canAccessInspection(
          request.user.roles,
          request.user.sub,
          inspection.officerId,
        )
      ) {
        return reply.code(403).send({
          error: "Forbidden",
        });
      }

      if (inspection.submittedAt) {
        return reply.code(400).send({
          error: "Inspection is already submitted",
        });
      }

      const file = await request.file();

      if (!file) {
        return reply.code(400).send({
          error: "A photo file is required",
        });
      }

      const ext = path
        .extname(file.filename)
        .toLowerCase();

      if (
        ![
          ".png",
          ".jpg",
          ".jpeg",
          ".webp",
        ].includes(ext) &&
        !file.mimetype.startsWith("image/")
      ) {
        return reply.code(400).send({
          error: "Upload a JPG or PNG photo",
        });
      }

      const fields = file.fields as Record<
        string,
        | { value?: unknown }
        | Array<{ value?: unknown }>
        | undefined
      >;

      const readField = (name: string) => {
        const raw = fields?.[name];

        const item = Array.isArray(raw)
          ? raw[0]
          : raw;

        return item?.value == null
          ? undefined
          : String(item.value);
      };

      const kindRaw =
        readField("kind") ??
        "INSTRUMENT_FRONT";

      const kind = (
        PHOTO_KINDS.has(kindRaw)
          ? kindRaw
          : "INSTRUMENT_FRONT"
      ) as PhotoKind;

      const latRaw = Number(
        readField("latitude"),
      );

      const lngRaw = Number(
        readField("longitude"),
      );

      const buffer = await file.toBuffer();

      const safeName = path
        .basename(file.filename)
        .replace(/[^\w.\-]+/g, "_");

      const dir = path.join(
        env.storagePath,
        "photos",
      );

      await fs.mkdir(dir, {
        recursive: true,
      });

      const storedPath = path.join(
        dir,
        `${id}-${Date.now()}-${safeName}`,
      );

      await fs.writeFile(
        storedPath,
        buffer,
      );

      await prisma.inspectionPhoto.create({
        data: {
          inspectionId: id,
          kind,
          filename: file.filename,
          storedPath,

          latitude: Number.isFinite(latRaw)
            ? latRaw
            : null,

          longitude: Number.isFinite(lngRaw)
            ? lngRaw
            : null,
        },
      });

      await writeAudit({
        request,
        userId: request.user.sub,
        action: "UPLOAD_PHOTO",
        entity: "inspection",
        entityId: id,
      });

      const full =
        await prisma.inspection.findUnique({
          where: {
            id,
          },
          include: inspectionInclude,
        });

      return reply
        .code(201)
        .send(presentInspection(full!));
    },
  );

  // ---------------------------------------------------------
  // COMPLETE INSPECTION
  // ---------------------------------------------------------

  app.post(
    "/api/inspections/:id/complete",
    {
      preHandler: requireRoles(app, ["LMO", "GATC", "ADMIN"]),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed =
        completeInspectionSchema.safeParse(
          request.body ?? {},
        );

      if (!parsed.success) {
        return reply.code(400).send({
          error: "Invalid input",
          details: parsed.error.flatten(),
        });
      }

      const inspection =
        await prisma.inspection.findUnique({
          where: { id },
          include: {
            measurements: true,
            photos: true,
          },
        });

      if (!inspection) {
        return reply.code(404).send({
          error: "Inspection not found",
        });
      }

      if (
        !canAccessInspection(
          request.user.roles,
          request.user.sub,
          inspection.officerId,
        )
      ) {
        return reply.code(403).send({
          error: "Forbidden",
        });
      }

      if (inspection.submittedAt) {
        return reply.code(400).send({
          error: "Inspection is already submitted",
        });
      }

      if (inspection.measurements.length === 0) {
        return reply.code(400).send({
          error:
            "Record at least one measurement before completing",
        });
      }

      const appStatus =
        parsed.data.result === "PASS"
          ? "PASSED"
          : parsed.data.result === "FAIL"
            ? "FAILED"
            : "UNDER_REVIEW";

      await prisma.inspection.update({
        where: {
          id,
        },
        data: {
          result: parsed.data.result,
          remarks: parsed.data.remarks,
          submittedAt: new Date(),
        },
      });

      await syncStatus(
        inspection.applicationId,
        inspection.instrumentId,
        appStatus,
      );

      if (parsed.data.result === "PASS") {
        await prisma.instrument.update({
          where: {
            id: inspection.instrumentId,
          },
          data: {
            lastVerifiedAt: new Date(),
          },
        });
      }

      await writeAudit({
        request,
        userId: request.user.sub,
        action:
          parsed.data.result === "FAIL"
            ? "FAIL_INSPECTION"
            : "PASS_INSPECTION",
        entity: "inspection",
        entityId: id,
      });

      const full =
        await prisma.inspection.findUnique({
          where: {
            id,
          },
          include: inspectionInclude,
        });

      return presentInspection(full!);
    },
  );
}