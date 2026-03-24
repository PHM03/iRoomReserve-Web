import { ZodError } from "zod";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "The request payload is invalid.",
          details: error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  const message =
    error instanceof Error ? error.message : "An unexpected server error occurred.";

  return NextResponse.json(
    {
      error: {
        code: "internal_error",
        message,
      },
    },
    { status: 500 }
  );
}
