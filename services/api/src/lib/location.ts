import type { z } from "zod";
import type { locationSchema } from "@lm-smart/validation";
import { prisma } from "./prisma.js";

type LocationInput = z.infer<typeof locationSchema>;

export async function createLocation(input: LocationInput) {
  return prisma.location.create({
    data: {
      label: input.label || input.city,
      address: input.address,
      city: input.city,
      district: input.district || null,
      state: input.state,
      latitude: input.latitude ?? 12.9716,
      longitude: input.longitude ?? 77.5946,
    },
  });
}
