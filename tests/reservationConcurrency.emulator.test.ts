import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!emulatorHost)("reservation availability transaction concurrency", () => {
  const date = "2026-11-18";
  const roomId = "phase1-concurrency-room";
  const buildingId = "gd1";
  const firstReservationId = "phase1-concurrency-first";
  const secondReservationId = "phase1-concurrency-second";
  let db: FirebaseFirestore.Firestore;
  let assertAndLockReservationAvailability: typeof import("@/lib/server/services/reservations").assertAndLockReservationAvailability;

  beforeAll(async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    });
    vi.stubEnv("FIREBASE_ADMIN_PROJECT_ID", "demo-reservation-concurrency");
    vi.stubEnv("FIREBASE_ADMIN_CLIENT_EMAIL", "emulator@example.test");
    vi.stubEnv("FIREBASE_ADMIN_PRIVATE_KEY", privateKey);
    vi.doMock("server-only", () => ({}));
    vi.resetModules();

    const firebase = await import("@/lib/firebase/firebase-admin");
    const reservations = await import("@/lib/server/services/reservations");
    db = firebase.db;
    assertAndLockReservationAvailability = reservations.assertAndLockReservationAvailability;

    await db.collection("buildings").doc(buildingId).set({
      activeScheduleAcademicYear: "A.Y. 2026-2027",
      activeScheduleSemester: "1st Semester",
    });
    await db.collection("rooms").doc(roomId).set({
      buildingId,
      name: "Concurrency Test Room",
      status: "Available",
    });
  });

  afterAll(async () => {
    if (!db) return;
    const reservations = db.collection("reservations");
    await Promise.all([
      reservations.doc(firstReservationId).delete(),
      reservations.doc(secondReservationId).delete(),
      db.collection("reservationLocks").doc(`room_${roomId}`).delete(),
      db.collection("reservationLocks").doc("user_phase1-concurrency-user").delete(),
      db.collection("rooms").doc(roomId).delete(),
      db.collection("buildings").doc(buildingId).delete(),
    ]);
    await db.terminate();
    vi.unstubAllEnvs();
  });

  it("allows only one simultaneous reservation for the same room and timeslot", async () => {
    const input = {
      buildingId,
      endTime: "11:00",
      roomId,
      startTime: "10:00",
      userId: "phase1-concurrency-user",
    };
    const attempts = [firstReservationId, secondReservationId].map((reservationId) =>
      db.runTransaction(async (transaction) => {
        await assertAndLockReservationAvailability(transaction, input, [date]);
        transaction.create(db.collection("reservations").doc(reservationId), {
          ...input,
          date,
          status: "pending",
        });
      })
    );

    const results = await Promise.allSettled(attempts);
    const successfulAttempts = results.filter((result) => result.status === "fulfilled");
    const savedReservations = await db
      .collection("reservations")
      .where("roomId", "==", roomId)
      .where("date", "==", date)
      .get();

    expect(successfulAttempts).toHaveLength(1);
    expect(savedReservations.size).toBe(1);
  });
});
