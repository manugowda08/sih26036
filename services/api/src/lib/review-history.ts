import { prisma } from "./prisma.js";

export type ReviewHistorySignals = {
  previousFailedInspections: number;
  previousReviewInspections: number;
  certificateExpired: boolean;
  certificateRevoked: boolean;
};

export async function getReviewHistorySignals(
  instrumentId: string,
): Promise<ReviewHistorySignals> {
  const now = new Date();

  const [
    previousFailedInspections,
    previousReviewInspections,
    certificates,
  ] = await Promise.all([
    prisma.inspection.count({
      where: {
        instrumentId,
        result: "FAIL",
      },
    }),

    prisma.inspection.count({
      where: {
        instrumentId,
        result: "REQUIRES_REVIEW",
      },
    }),

    prisma.certificate.findMany({
      where: {
        instrumentId,
      },
      select: {
        status: true,
        nextDueAt: true,
      },
    }),
  ]);

  const certificateRevoked = certificates.some(
    (certificate) => certificate.status === "REVOKED",
  );

  const certificateExpired = certificates.some(
    (certificate) =>
      certificate.status === "EXPIRED" ||
      certificate.nextDueAt.getTime() < now.getTime(),
  );

  return {
    previousFailedInspections,
    previousReviewInspections,
    certificateExpired,
    certificateRevoked,
  };
}