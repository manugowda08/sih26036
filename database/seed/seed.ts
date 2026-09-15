import path from "node:path";
import { config as loadDotenv } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleCode } from "@prisma/client";

loadDotenv({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Demo@12345";

const instrumentTypes = [
  { code: "EWM", name: "Electronic weighing machine", category: "weighing", defaultPermissibleError: 0.5, unit: "g" },
  { code: "PLATFORM", name: "Platform scale", category: "weighing", defaultPermissibleError: 2, unit: "g" },
  { code: "RETAIL", name: "Retail weighing scale", category: "weighing", defaultPermissibleError: 1, unit: "g" },
  { code: "WEIGHBRIDGE", name: "Weighbridge", category: "weighing", defaultPermissibleError: 20, unit: "kg" },
  { code: "CYLINDER", name: "Measuring cylinder", category: "volume", defaultPermissibleError: 1, unit: "ml" },
  { code: "FUEL", name: "Fuel dispenser", category: "volume", defaultPermissibleError: 0.5, unit: "ml" },
  { code: "WATER", name: "Water meter", category: "volume", defaultPermissibleError: 2, unit: "L" },
];

async function upsertRole(code: RoleCode, name: string) {
  return prisma.role.upsert({
    where: { code },
    update: { name },
    create: { code, name },
  });
}

async function upsertUser(opts: {
  email: string;
  fullName: string;
  roleId: string;
  phone: string;
}) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: { fullName: opts.fullName, passwordHash, phone: opts.phone, isActive: true },
    create: {
      email: opts.email,
      fullName: opts.fullName,
      passwordHash,
      phone: opts.phone,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: opts.roleId } },
    update: {},
    create: { userId: user.id, roleId: opts.roleId },
  });

  return user;
}

async function main() {
  const [adminRole, lmoRole, gatcRole, ownerRole] = await Promise.all([
    upsertRole("ADMIN", "Administrator"),
    upsertRole("LMO", "Legal Metrology Officer"),
    upsertRole("GATC", "Government Approved Test Centre"),
    upsertRole("OWNER", "Instrument Owner"),
  ]);

  for (const type of instrumentTypes) {
    await prisma.instrumentType.upsert({
      where: { code: type.code },
      update: {
        name: type.name,
        category: type.category,
        defaultPermissibleError: type.defaultPermissibleError,
        unit: type.unit,
      },
      create: type,
    });
  }

  const bengaluru = await prisma.location.upsert({
    where: { id: "11111111-1111-1111-1111-111111111111" },
    update: {},
    create: {
      id: "11111111-1111-1111-1111-111111111111",
      label: "Bengaluru demo HQ",
      address: "Fictional Legal Metrology Office",
      city: "Bengaluru",
      district: "Bengaluru Urban",
      state: "Karnataka",
      latitude: 12.9716,
      longitude: 77.5946,
    },
  });

  const admin = await upsertUser({
    email: "admin@lmsmart.demo",
    fullName: "Demo Administrator",
    roleId: adminRole.id,
    phone: "9000000001",
  });

  const lmo = await upsertUser({
    email: "lmo@lmsmart.demo",
    fullName: "Demo Legal Metrology Officer",
    roleId: lmoRole.id,
    phone: "9000000002",
  });

  const gatcUser = await upsertUser({
    email: "gatc@lmsmart.demo",
    fullName: "Demo GATC Operator",
    roleId: gatcRole.id,
    phone: "9000000003",
  });

  const owner = await upsertUser({
    email: "owner@lmsmart.demo",
    fullName: "Demo Instrument Owner",
    roleId: ownerRole.id,
    phone: "9000000004",
  });

  await prisma.lmOfficer.upsert({
    where: { userId: lmo.id },
    update: { locationId: bengaluru.id, isAvailable: true },
    create: {
      userId: lmo.id,
      employeeCode: "LMO-BLR-001",
      locationId: bengaluru.id,
    },
  });

  await prisma.gatc.upsert({
    where: { userId: gatcUser.id },
    update: { locationId: bengaluru.id },
    create: {
      userId: gatcUser.id,
      centreCode: "GATC-BLR-001",
      name: "Bengaluru Demo Test Centre",
      locationId: bengaluru.id,
    },
  });

  await prisma.business.upsert({
    where: { id: "22222222-2222-2222-2222-222222222222" },
    update: { ownerId: owner.id, locationId: bengaluru.id },
    create: {
      id: "22222222-2222-2222-2222-222222222222",
      ownerId: owner.id,
      name: "Demo Retail Stores Pvt Ltd",
      gstin: "29DEMOLM1234Z1",
      locationId: bengaluru.id,
    },
  });

  console.log("Seed complete. Demo password: Demo@12345");
  console.log("Users:", admin.email, lmo.email, gatcUser.email, owner.email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
