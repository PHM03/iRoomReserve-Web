import { describe, expect, it } from 'vitest';

import {
  filterInboxMessagesByBuildingScope,
  getBuildingAdminInboxBuildingIds,
} from '../lib/admin/adminInboxScope';

function message(
  id: string,
  buildingId: string | undefined,
  createdAt: number,
  isRead = false,
) {
  return {
    id,
    buildingId,
    buildingName: buildingId?.toUpperCase(),
    createdAt,
    isRead,
  };
}

describe('Building Admin Main Campus Inbox scope', () => {
  const records = [
    message('gd3-newest', 'gd3', 300),
    message('gd2-read', 'gd2', 200, true),
    message('gd1-unread', 'gd1', 100),
    message('digi', 'sdca-digital-campus', 400),
  ];

  it.each(['gd1', 'gd2', 'gd3'])(
    'includes GD1, GD2, and GD3 when %s is selected',
    (selectedBuildingId) => {
      const scope = getBuildingAdminInboxBuildingIds('main', selectedBuildingId);

      expect(scope).toEqual(['gd1', 'gd2', 'gd3']);
      expect(
        filterInboxMessagesByBuildingScope(records, scope).map(
          (record) => record.buildingId,
        ),
      ).toEqual(['gd3', 'gd2', 'gd1']);
    },
  );

  it('does not change when the selected Main Campus building changes', () => {
    expect(getBuildingAdminInboxBuildingIds('main', 'gd1')).toEqual(
      getBuildingAdminInboxBuildingIds('main', 'gd2'),
    );
    expect(getBuildingAdminInboxBuildingIds('main', 'gd2')).toEqual(
      getBuildingAdminInboxBuildingIds('main', 'gd3'),
    );
  });

  it('preserves newest-first order, building identity, and read state', () => {
    const scoped = filterInboxMessagesByBuildingScope(
      records,
      getBuildingAdminInboxBuildingIds('main', 'gd1'),
    );

    expect(scoped.map((record) => record.createdAt)).toEqual([300, 200, 100]);
    expect(scoped.map((record) => record.buildingName)).toEqual([
      'GD3',
      'GD2',
      'GD1',
    ]);
    expect(scoped.map((record) => record.isRead)).toEqual([false, true, false]);
  });

  it('keeps untagged legacy messages instead of guessing their building', () => {
    const legacy = message('legacy', undefined, 50);

    expect(
      filterInboxMessagesByBuildingScope(
        [legacy],
        getBuildingAdminInboxBuildingIds('main', 'gd1'),
      ),
    ).toEqual([legacy]);
  });

  it('does not apply the Main Campus scope to Digi Campus', () => {
    const scope = getBuildingAdminInboxBuildingIds('digi', 'sdca-digital-campus');

    expect(scope).toEqual(['sdca-digital-campus']);
    expect(filterInboxMessagesByBuildingScope(records, [])).toEqual(records);
    expect(
      filterInboxMessagesByBuildingScope(
        [
          { ...message('digi-by-campus', undefined, 50), campus: 'digi' },
          { ...message('digi-by-name', undefined, 40), buildingName: 'SDCA Digi Campus' },
        ],
        getBuildingAdminInboxBuildingIds('main', 'gd1'),
      ),
    ).toEqual([]);
  });

  it('removes duplicate records without changing their first-seen order', () => {
    const duplicateRecords = [records[0], records[0], records[1]];

    expect(
      filterInboxMessagesByBuildingScope(
        duplicateRecords,
        getBuildingAdminInboxBuildingIds('main', 'gd1'),
      ).map((record) => record.id),
    ).toEqual(['gd3-newest', 'gd2-read']);
  });
});
