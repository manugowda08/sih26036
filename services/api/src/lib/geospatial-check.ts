import { calculatePostgisDistance } from "./geospatial.js";
import { prisma } from "./prisma.js";

async function main() {
  const same = await calculatePostgisDistance(
    {
      latitude: 12.9716,
      longitude: 77.5946,
    },
    {
      latitude: 12.9716,
      longitude: 77.5946,
    },
  );

  console.log("Same location:");
  console.log(same);

  const moved = await calculatePostgisDistance(
    {
      latitude: 12.9716,
      longitude: 77.5946,
    },
    {
      latitude: 12.9756,
      longitude: 77.5986,
    },
  );

  console.log("\nDifferent location:");
  console.log(moved);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });