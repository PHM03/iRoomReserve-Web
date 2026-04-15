'use client';

import { auth } from "@/lib/configs/firebase";
import type { UserRole } from "@/lib/domain/roles";

interface ApiRequestOptions {
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  role?: UserRole | null;
  userId?: string | null;
}

export async function apiRequest<T>(
  input: string,
  { body, method = "POST", role, userId }: ApiRequestOptions = {}
): Promise<T> {
  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : null;

  const response = await fetch(input, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "x-user-id": userId } : {}),
      ...(role ? { "x-user-role": role } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "The request failed.");
  }

  return payload as T;
}
