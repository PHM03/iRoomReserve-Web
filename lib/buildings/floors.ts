import { apiRequest } from "@/lib/api/client";
import { auth } from "@/lib/firebase/firebase";

export interface Floor {
  id: string;
  name: string;
  normalizedName: string;
  sortOrder: number;
}

export async function getFloorsByBuilding(buildingId: string): Promise<Floor[]> {
  return apiRequest<Floor[]>(
    `/api/buildings/${encodeURIComponent(buildingId)}/floors`,
    {
      method: "GET",
      userId: auth.currentUser?.uid,
    }
  );
}

export async function addFloor(buildingId: string, name: string): Promise<Floor> {
  return apiRequest<Floor>(
    `/api/buildings/${encodeURIComponent(buildingId)}/floors`,
    {
      body: { name },
      method: "POST",
      userId: auth.currentUser?.uid,
    }
  );
}

export async function deleteFloor(buildingId: string, floorId: string): Promise<void> {
  await apiRequest(
    `/api/buildings/${encodeURIComponent(buildingId)}/floors/${encodeURIComponent(floorId)}`,
    {
      method: "DELETE",
      userId: auth.currentUser?.uid,
    }
  );
}
