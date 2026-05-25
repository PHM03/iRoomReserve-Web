'use client';

import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase/firebase";
import type { UserRole } from "@/lib/auth/roles";
import { buildUrl, type QueryParams } from "@/lib/utils/buildUrl";

interface ApiRequestOptions {
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  params?: QueryParams;
  role?: UserRole | null;
  userId?: string | null;
}

interface ApiErrorResponse {
  error?: {
    message?: string;
  };
}

type ApiRequestError = Error & {
  contentType?: string;
  responseBody?: string;
  status?: number;
};

let authReadyPromise: Promise<void> | null = null;

async function waitForAuthReady() {
  if (auth.currentUser) {
    return;
  }

  const authWithReady = auth as typeof auth & {
    authStateReady?: () => Promise<void>;
  };

  if (typeof authWithReady.authStateReady === "function") {
    await authWithReady.authStateReady();
    return;
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, () => {
        unsubscribe();
        resolve();
      });
    }).finally(() => {
      authReadyPromise = null;
    });
  }

  await authReadyPromise;
}

export async function apiRequest<T>(
  input: string,
  { body, method = "POST", params, role, userId }: ApiRequestOptions = {}
): Promise<T> {
  await waitForAuthReady();
  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken(true) : null;

  const response = await fetch(buildUrl(input, params), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(currentUser?.uid ? { "x-user-id": currentUser.uid } : {}),
      ...(userId ? { "x-user-id": userId } : {}),
      ...(role ? { "x-user-role": role } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const responseText = await response.text();
  let payload: ApiErrorResponse | T | null = null;

  if (responseText) {
    try {
      payload = JSON.parse(responseText) as ApiErrorResponse | T;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const responseBody = responseText.trim();
    const isHtmlResponse =
      contentType.includes("text/html") ||
      responseBody.startsWith("<!DOCTYPE") ||
      responseBody.startsWith("<html");

    const error = new Error(
      (payload as ApiErrorResponse | null)?.error?.message ??
        (!isHtmlResponse && responseBody.length > 0
          ? responseBody
          : `The request failed (status ${response.status}).`)
    ) as ApiRequestError;

    error.status = response.status;
    error.responseBody = responseBody;
    error.contentType = contentType;

    throw error;
  }

  return payload as T;
}
