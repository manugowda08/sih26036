export type RoleCode = "OWNER" | "LMO" | "GATC" | "ADMIN";

export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "SCHEDULED"
  | "ASSIGNED"
  | "INSPECTION_IN_PROGRESS"
  | "PASSED"
  | "FAILED"
  | "CERTIFICATE_GENERATED"
  | "ACTIVE"
  | "EXPIRING"
  | "EXPIRED"
  | "REVERIFICATION";

export type ApplicationKind = "VERIFICATION" | "REVERIFICATION";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  roles: RoleCode[];
};
