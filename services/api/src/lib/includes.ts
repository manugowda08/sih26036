export const applicationInclude = {
  instrument: { include: { type: true, location: true } },
  business: { include: { location: true } },
  owner: { select: { id: true, fullName: true, email: true, phone: true } },
  documents: { orderBy: { createdAt: "desc" as const } },
  schedule: {
    include: {
      assignedOfficer: { select: { id: true, fullName: true, email: true } },
    },
  },
  inspections: { orderBy: { createdAt: "desc" as const }, take: 1 },
};

export const inspectionInclude = {
  officer: { select: { id: true, fullName: true, email: true } },
  location: true,
  checklist: true,
  measurements: { orderBy: { createdAt: "asc" as const } },
  photos: { orderBy: { capturedAt: "desc" as const } },
  certificates: { orderBy: { issuedAt: "desc" as const }, take: 1 },
  instrument: { include: { type: true, location: true, business: true } },
  application: {
    include: {
      owner: { select: { id: true, fullName: true, email: true } },
      business: true,
      schedule: {
        include: { assignedOfficer: { select: { id: true, fullName: true, email: true } } },
      },
    },
  },
};

export const certificateInclude = {
  instrument: { include: { type: true, location: true } },
  business: true,
  officer: { select: { id: true, fullName: true } },
  application: { include: { owner: { select: { id: true, fullName: true } } } },
  inspection: { select: { id: true, result: true, submittedAt: true } },
  qrTokens: { where: { revokedAt: null }, orderBy: { issuedAt: "desc" as const }, take: 1 },
};
