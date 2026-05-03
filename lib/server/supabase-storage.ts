import "server-only";

import { ApiError } from "@/lib/server/api-error";

const DEFAULT_BUCKET = "reservation-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

function getSupabaseUrl() {
  const value =
    process.env.SUPABASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ??
    "";

  if (!value) {
    throw new ApiError(
      500,
      "supabase_not_configured",
      "Supabase Storage is not configured. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  return value.replace(/\/$/, "");
}

function getSupabaseServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!value) {
    throw new ApiError(
      500,
      "supabase_not_configured",
      "Supabase Storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return value;
}

function sanitizeFileName(fileName: string) {
  const trimmed = fileName.trim();
  const fallback = "upload";

  const normalized = trimmed.length > 0 ? trimmed : fallback;
  const extensionIndex = normalized.lastIndexOf(".");
  const baseName =
    extensionIndex > 0 ? normalized.slice(0, extensionIndex) : normalized;
  const extension =
    extensionIndex > 0 ? normalized.slice(extensionIndex).toLowerCase() : "";

  const safeBaseName = baseName
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return `${safeBaseName || fallback}${extension}`;
}

function buildObjectPath(input: {
  fileName: string;
  reservationId?: string | null;
  userId: string;
}) {
  const timestamp = Date.now();
  const randomId = crypto.randomUUID();
  const safeName = sanitizeFileName(input.fileName);
  const scope = input.reservationId?.trim() ? input.reservationId.trim() : "pending";

  return `reservations/${scope}/${input.userId}/${timestamp}-${randomId}-${safeName}`;
}

function encodeObjectPath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function assertValidReservationDocument(file: File) {
  if (!file.name.trim()) {
    throw new ApiError(400, "missing_file_name", "Uploaded files must have a file name.");
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new ApiError(
      400,
      "invalid_file_type",
      "Only PDF, JPG, and PNG files are allowed."
    );
  }

  if (file.size <= 0) {
    throw new ApiError(400, "empty_file", "Uploaded files must not be empty.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ApiError(
      400,
      "file_too_large",
      "Uploaded files must be 10 MB or smaller."
    );
  }
}

export interface UploadedReservationDocument {
  bucket: string;
  contentType: string;
  name: string;
  path: string;
  size: number;
}

function buildStorageObjectUrl(input: { bucket: string; path: string }) {
  return `${getSupabaseUrl()}/storage/v1/object/${input.bucket}/${encodeObjectPath(
    input.path
  )}`;
}

function getSupabaseStorageBaseUrl() {
  return `${getSupabaseUrl()}/storage/v1`;
}

export async function createReservationDocumentSignedUrl(input: {
  bucket?: string | null;
  expiresInSeconds?: number;
  path?: string | null;
}): Promise<string | null> {
  const path = input.path?.trim() ?? "";
  if (!path) {
    return null;
  }

  const bucket = input.bucket?.trim() || DEFAULT_BUCKET;
  const expiresInSeconds = input.expiresInSeconds ?? 60 * 60;
  const response = await fetch(
    `${getSupabaseUrl()}/storage/v1/object/sign/${bucket}/${encodeObjectPath(path)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getSupabaseServiceRoleKey()}`,
        apikey: getSupabaseServiceRoleKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expiresIn: expiresInSeconds
      }),
    }
  );

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;

    throw new ApiError(
      502,
      "storage_signed_url_failed",
      errorPayload?.message ??
        errorPayload?.error ??
        "Supabase Storage could not create an access URL for the uploaded file."
    );
  }

  const payload = (await response.json()) as
    | { signedURL?: string; signedUrl?: string }
    | null;
  const signedUrl = payload?.signedURL ?? payload?.signedUrl ?? "";

  if (!signedUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(signedUrl)) {
    return signedUrl;
  }

  if (signedUrl.startsWith("/")) {
    return `${getSupabaseStorageBaseUrl()}${signedUrl}`;
  }

  return `${buildStorageObjectUrl({
    bucket,
    path
  })}?${signedUrl}`;
}

export async function uploadReservationDocument(input: {
  file: File;
  reservationId?: string | null;
  userId: string;
}): Promise<UploadedReservationDocument> {
  assertValidReservationDocument(input.file);

  const bucket = DEFAULT_BUCKET;
  const path = buildObjectPath({
    fileName: input.file.name,
    reservationId: input.reservationId,
    userId: input.userId,
  });
  const response = await fetch(
    `${getSupabaseUrl()}/storage/v1/object/${bucket}/${encodeObjectPath(path)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getSupabaseServiceRoleKey()}`,
        apikey: getSupabaseServiceRoleKey(),
        "Content-Type": input.file.type,
        "x-upsert": "false",
      },
      body: Buffer.from(await input.file.arrayBuffer()),
    }
  );

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;

    throw new ApiError(
      502,
      "storage_upload_failed",
      errorPayload?.message ??
        errorPayload?.error ??
        "Supabase Storage could not store the uploaded file."
    );
  }

  return {
    bucket,
    contentType: input.file.type,
    name: input.file.name,
    path,
    size: input.file.size,
  };
}
