import { apiRequest } from "@/lib/api/client";

export interface SeedBuildingsResult {
  created: string[];
  skipped: string[];
}

export async function seedBuildings(): Promise<SeedBuildingsResult> {
  return apiRequest<SeedBuildingsResult>("/api/admin/tools/seed-buildings", {
    method: "POST",
  });
}
