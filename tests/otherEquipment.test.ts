import { describe, expect, it } from 'vitest';

import {
  formatOtherEquipment,
  getOtherEquipmentFields,
} from '../lib/reservations/equipment';

describe('other equipment compatibility helpers', () => {
  it('persists a custom equipment name and positive quantity', () => {
    expect(getOtherEquipmentFields('  Whiteboard  ', 2)).toEqual({
      otherEquipment: 'Whiteboard',
      otherEquipmentQuantity: 2,
    });
  });

  it('keeps the legacy name-only representation readable without migration', () => {
    expect(getOtherEquipmentFields('Whiteboard')).toEqual({
      otherEquipment: 'Whiteboard',
    });
    expect(formatOtherEquipment('Whiteboard')).toBe(
      'Whiteboard — Qty: Unspecified'
    );
  });

  it('does not persist an invalid quantity', () => {
    expect(getOtherEquipmentFields('Whiteboard', 0)).toEqual({
      otherEquipment: 'Whiteboard',
    });
    expect(getOtherEquipmentFields('Whiteboard', 1.5)).toEqual({
      otherEquipment: 'Whiteboard',
    });
  });

  it('formats a supplied quantity for reservation displays', () => {
    expect(formatOtherEquipment('Whiteboard', 2)).toBe(
      'Whiteboard — Qty: 2'
    );
  });
});
