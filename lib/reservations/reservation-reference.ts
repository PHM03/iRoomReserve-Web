export function createReservationReference(reservationId: string, createdAt = new Date()) {
  const year = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(createdAt);
  return `RES-${year}-${reservationId.slice(0, 8).toUpperCase()}`;
}
