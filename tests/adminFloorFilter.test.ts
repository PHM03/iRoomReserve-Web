import { describe, expect, it } from 'vitest';

import { buildAdminDropdownMenuStyle } from '../components/admin/AdminFloorFilter';

describe('buildAdminDropdownMenuStyle', () => {
  it('opens below the trigger when there is enough space', () => {
    const style = buildAdminDropdownMenuStyle({
      buttonRect: {
        bottom: 120,
        left: 80,
        right: 280,
        top: 80,
        width: 200,
      },
      menuAlign: 'left',
      optionCount: 4,
      viewportHeight: 900,
      viewportWidth: 1280,
    });

    expect(style.top).toBe(128);
    expect(style.bottom).toBeUndefined();
    expect(style.left).toBe(80);
    expect(style.width).toBe(200);
    expect(style.zIndex).toBe(9999);
  });

  it('opens above the trigger when space below is tight', () => {
    const style = buildAdminDropdownMenuStyle({
      buttonRect: {
        bottom: 660,
        left: 420,
        right: 620,
        top: 620,
        width: 200,
      },
      menuAlign: 'left',
      optionCount: 6,
      viewportHeight: 720,
      viewportWidth: 1280,
    });

    expect(style.top).toBeUndefined();
    expect(style.bottom).toBe(108);
    expect(style.maxHeight).toBe(320);
  });

  it('keeps right-aligned menus inside the viewport', () => {
    const style = buildAdminDropdownMenuStyle({
      buttonRect: {
        bottom: 200,
        left: 1110,
        right: 1260,
        top: 160,
        width: 220,
      },
      menuAlign: 'right',
      optionCount: 3,
      viewportHeight: 800,
      viewportWidth: 1280,
    });

    expect(style.left).toBe(1040);
    expect(style.width).toBe(220);
  });
});
