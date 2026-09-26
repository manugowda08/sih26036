import { prisma } from "./prisma.js";

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type LocationDistanceResult = {
  registered: GeoPoint;
  captured: GeoPoint;
  distanceMeters: number;
  calculation: "POSTGIS";
  advisory: true;
};

function isValidCoordinate(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

export async function calculatePostgisDistance(
  registered: GeoPoint,
  captured: GeoPoint,
): Promise<LocationDistanceResult> {
  if (!isValidCoordinate(registered) || !isValidCoordinate(captured)) {
    throw new Error("Invalid geographic coordinates");
  }

  const rows = await prisma.$queryRaw<Array<{ distance_meters: number }>>`
    SELECT ST_Distance(
      ST_SetSRID(
        ST_MakePoint(${registered.longitude}, ${registered.latitude}),
        4326
      )::geography,
      ST_SetSRID(
        ST_MakePoint(${captured.longitude}, ${captured.latitude}),
        4326
      )::geography
    )::double precision AS distance_meters
  `;

  const distanceMeters = Number(rows[0]?.distance_meters);

  if (!Number.isFinite(distanceMeters)) {
    throw new Error("PostGIS distance calculation failed");
  }

  return {
    registered,
    captured,
    distanceMeters: Math.round(distanceMeters * 10) / 10,
    calculation: "POSTGIS",
    advisory: true,
  };
}
export async function getInspectionLocationEvidence(
  inspectionId: string,
): Promise<LocationDistanceResult | null> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      location: true,
      instrument: {
        include: {
          location: true,
        },
      },
    },
  });

  if (
    !inspection?.location ||
    !inspection.instrument?.location
  ) {
    return null;
  }

  // An inspection initially inherits the registered instrument
  // location. In that state, field GPS has not necessarily been
  // captured yet.
  if (
    inspection.locationId ===
    inspection.instrument.locationId
  ) {
    return null;
  }

  return calculatePostgisDistance(
    {
      latitude: Number(
        inspection.instrument.location.latitude,
      ),
      longitude: Number(
        inspection.instrument.location.longitude,
      ),
    },
    {
      latitude: Number(inspection.location.latitude),
      longitude: Number(inspection.location.longitude),
    },
  );
}