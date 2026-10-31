import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import RoomCard from '../components/rooms/RoomCard';

describe('RoomCard administrative reservation status', () => {
  it('shows unoccupied status separately from administrative unavailability', () => {
    const markup = renderToStaticMarkup(
      <RoomCard
        administrativelyUnavailable
        availability="Available"
        buildingName="SDCA Digital Campus"
        campusName="SDCA Digital Campus"
        floor="2nd Floor"
        name="Room 205"
        roomType="Classroom"
      />
    );

    expect(markup).toContain('Occupancy: Available');
    expect(markup).toContain('Unavailable for reservations');
  });

  it('preserves occupied status for a room that remains administratively eligible', () => {
    const markup = renderToStaticMarkup(
      <RoomCard
        availability="Occupied"
        buildingName="SDCA Digital Campus"
        campusName="SDCA Digital Campus"
        floor="2nd Floor"
        name="Room 206"
        roomType="Classroom"
      />
    );

    expect(markup).toContain('Occupancy: Occupied');
    expect(markup).not.toContain('Unavailable for reservations');
  });
});
