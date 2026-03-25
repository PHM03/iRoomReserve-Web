import { z } from "zod";

import { normalizeCampus, RESERVATION_CAMPUSES } from "../campuses";
import { ALL_USER_ROLES, normalizeRole } from "../domain/roles";
import { RESERVATION_APPROVAL_ROLES } from "../reservation-approval";

const nonEmptyString = z.string().trim().min(1);
const timeString = z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:mm time.");
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date.");
const emailString = z.string().trim().toLowerCase().email();
const userRoleSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? normalizeRole(value) ?? value.trim()
      : value,
  z.enum(ALL_USER_ROLES)
);

export const roomStatusSchema = z.enum([
  "Available",
  "Reserved",
  "Ongoing",
  "Unavailable",
]);

export const roomCheckInMethodSchema = z.enum(["manual", "ble"]);

export const equipmentSchema = z.record(z.string(), z.number().int().min(0));
export const reservationCampusSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? normalizeCampus(value) ?? value.trim().toLowerCase()
      : value,
  z.enum(RESERVATION_CAMPUSES)
);

export const reservationApprovalRoleSchema = z.enum(
  RESERVATION_APPROVAL_ROLES
);

export const reservationApprovalStepSchema = z.object({
  role: reservationApprovalRoleSchema,
  email: emailString,
});

export const reservationApprovalRecordSchema = reservationApprovalStepSchema.extend(
  {
    date: z.unknown(),
    status: z.literal("approved"),
  }
);

function normalizeReservationPayload(
  value: unknown
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const nextValue = { ...(value as Record<string, unknown>) };

  if (typeof nextValue.campus === "string") {
    nextValue.campus =
      normalizeCampus(nextValue.campus) ??
      nextValue.campus.trim().toLowerCase();
  }

  if (typeof nextValue.userRole === "string") {
    nextValue.userRole =
      normalizeRole(nextValue.userRole) ?? nextValue.userRole.trim();
  }

  return nextValue;
}

const reservationCommonSchema = z.object({
  userId: nonEmptyString,
  userName: nonEmptyString,
  userRole: userRoleSchema,
  roomId: nonEmptyString,
  roomName: nonEmptyString,
  buildingId: nonEmptyString,
  buildingName: nonEmptyString,
  campus: reservationCampusSchema,
  startTime: timeString,
  endTime: timeString,
  purpose: nonEmptyString,
  equipment: equipmentSchema.optional(),
});

export const digiReservationBaseSchema = reservationCommonSchema.extend({
  campus: z.literal("digi"),
  buildingAdminEmail: emailString,
});

export const mainReservationBaseSchema = reservationCommonSchema.extend({
  campus: z.literal("main"),
  advisorEmail: emailString,
  dsasEmail: emailString,
  registrarEmail: emailString,
  buildingAdminEmail: emailString,
});

export const reservationBaseSchema = z.union([
  digiReservationBaseSchema,
  mainReservationBaseSchema,
]);

const singleReservationPayloadSchema = z.discriminatedUnion("campus", [
  digiReservationBaseSchema.extend({
    date: dateString,
  }),
  mainReservationBaseSchema.extend({
    date: dateString,
  }),
]);

const recurringReservationPayloadSchema = z.discriminatedUnion("campus", [
  digiReservationBaseSchema,
  mainReservationBaseSchema,
]);

export const createReservationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("single"),
    reservation: z.preprocess(
      normalizeReservationPayload,
      singleReservationPayloadSchema
    ),
  }),
  z.object({
    type: z.literal("recurring"),
    reservation: z.preprocess(
      normalizeReservationPayload,
      recurringReservationPayloadSchema
    ),
    selectedDays: z.array(z.number().int().min(0).max(6)).min(1),
    startDate: dateString,
    endDate: dateString,
  }),
]);

export const reservationMutationSchema = z.object({
  userId: nonEmptyString,
});

export const reservationCheckInSchema = reservationMutationSchema.extend({
  method: roomCheckInMethodSchema.optional(),
});

export const adminRequestCreateSchema = z.object({
  userId: nonEmptyString,
  userName: nonEmptyString,
  reservationId: z.string().trim().nullable(),
  type: z.enum(["equipment", "general", "other"]),
  subject: nonEmptyString,
  message: nonEmptyString,
  buildingId: nonEmptyString,
  buildingName: nonEmptyString,
});

export const adminRequestRespondSchema = z.object({
  responseText: nonEmptyString,
});

export const feedbackCreateSchema = z.object({
  roomId: nonEmptyString,
  roomName: nonEmptyString,
  buildingId: nonEmptyString,
  buildingName: nonEmptyString,
  reservationId: nonEmptyString,
  userId: nonEmptyString,
  userName: nonEmptyString,
  message: nonEmptyString,
  rating: z.number().int().min(1).max(5),
});

export const feedbackRespondSchema = z.object({
  response: nonEmptyString,
});

export const roomInputSchema = z.object({
  name: nonEmptyString,
  floor: nonEmptyString,
  roomType: nonEmptyString,
  acStatus: nonEmptyString,
  tvProjectorStatus: nonEmptyString,
  capacity: z.number().int().positive(),
  status: roomStatusSchema,
  buildingId: nonEmptyString,
  buildingName: nonEmptyString,
});

export const roomUpdateSchema = roomInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one room field must be provided.",
  });

export const roomStatusUpdateSchema = z.object({
  status: roomStatusSchema,
  reservedBy: z.string().trim().nullable().optional(),
  activeReservationId: z.string().trim().nullable().optional(),
  checkedInAt: z.union([z.literal(null), z.string(), z.undefined()]).optional(),
  checkInMethod: roomCheckInMethodSchema.nullable().optional(),
});

export const scheduleInputSchema = z.object({
  roomId: nonEmptyString,
  roomName: nonEmptyString,
  buildingId: nonEmptyString,
  subjectName: nonEmptyString,
  instructorName: nonEmptyString,
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeString,
  endTime: timeString,
  createdBy: nonEmptyString,
});

export const scheduleUpdateSchema = scheduleInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one schedule field must be provided.",
  });

export const adminApproveSchema = z.object({
  buildingId: z.string().trim().optional(),
  buildingName: z.string().trim().optional(),
});
