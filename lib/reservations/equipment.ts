export interface OtherEquipmentFields {
  otherEquipment?: string;
  otherEquipmentQuantity?: number;
}

export function getOtherEquipmentFields(
  otherEquipment?: string,
  otherEquipmentQuantity?: number
): OtherEquipmentFields {
  const trimmedOtherEquipment = otherEquipment?.trim();

  if (!trimmedOtherEquipment) {
    return {};
  }

  if (
    typeof otherEquipmentQuantity === "number" &&
    Number.isInteger(otherEquipmentQuantity) &&
    otherEquipmentQuantity >= 1
  ) {
    return {
      otherEquipment: trimmedOtherEquipment,
      otherEquipmentQuantity,
    };
  }

  return { otherEquipment: trimmedOtherEquipment };
}

export function formatOtherEquipment(
  otherEquipment?: string,
  otherEquipmentQuantity?: number
) {
  const trimmedOtherEquipment = otherEquipment?.trim();

  if (!trimmedOtherEquipment) {
    return "";
  }

  const quantityLabel =
    typeof otherEquipmentQuantity === "number" &&
    Number.isInteger(otherEquipmentQuantity) &&
    otherEquipmentQuantity >= 1
      ? otherEquipmentQuantity
      : "Unspecified";

  return `${trimmedOtherEquipment} — Qty: ${quantityLabel}`;
}
