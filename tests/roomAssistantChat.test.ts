import { describe, expect, it } from 'vitest';

import {
  CHAT_STEPS,
  createRoomAssistantChat,
  handleUnavailableRoom,
  runRoomAssistantExamples,
  sampleRooms,
  sampleTimeslot,
  startHelpMeChooseChat,
} from '../lib/roomAssistantChat';

const availabilityByRoomId: Record<string, boolean> = {
  'glass-101': false,
  'glass-102': true,
  'lecture-105': true,
  'lecture-201': true,
  'lab-301': true,
};

const isAvailable = (roomId: string) => availabilityByRoomId[roomId] ?? true;

type ChatMessage = {
  options?: Array<{ label: string; value: string | number }>;
  text: string;
};

type RecommendationResult = {
  roomId: string;
};

describe('roomAssistantChat', () => {
  it('injects chat messages and alternatives when a selected room is unavailable', () => {
    const result = handleUnavailableRoom(
      sampleRooms[0],
      sampleTimeslot,
      sampleRooms,
      isAvailable
    );

    expect(result.step).toBe(CHAT_STEPS.SHOW_RECOMMENDATIONS);
    expect(result.messages[0].text).toContain('already reserved at that time');
    expect(result.messages[1].text).toContain('top 3 available alternatives');
    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations[0].roomId).toBe('glass-102');
  });

  it('starts the help me choose assistant by asking for room type', () => {
    const state = startHelpMeChooseChat(sampleTimeslot);
    const firstMessage = state.messages[0] as ChatMessage;

    expect(state.step).toBe(CHAT_STEPS.ASK_TYPE);
    expect(firstMessage.text).toBe('Sure 👍 What kind of room are you looking for?');
    expect(firstMessage.options).toEqual([
      { label: 'Glass', value: 'glass' },
      { label: 'Lecture', value: 'lecture' },
      { label: 'Lab', value: 'lab' },
      { label: 'No preference', value: '' },
    ]);
  });

  it('moves through the step-based chat and returns recommendations', () => {
    const assistant = createRoomAssistantChat(sampleRooms, isAvailable);

    assistant.startHelpMeChoose(sampleTimeslot);
    assistant.selectType('lecture');
    assistant.selectCapacity(30);
    const finalState = assistant.finishFeatureSelection(['AC', 'Projector']);
    const recommendations = finalState.recommendations as RecommendationResult[];
    const messages = finalState.messages as ChatMessage[];

    expect(finalState.step).toBe(CHAT_STEPS.SHOW_RECOMMENDATIONS);
    expect(finalState.preferences).toEqual({
      minCapacity: 30,
      preferredBuilding: '',
      preferredType: 'lecture',
      requiredFeatures: ['AC', 'Projector'],
    });
    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].roomId).toBe('lecture-201');
    expect(
      messages.some((message) =>
        message.text.includes('Perfect 👍 Let me find the best rooms for you...')
      )
    ).toBe(true);
  });

  it('exports example conversations for both scenarios', () => {
    const examples = runRoomAssistantExamples();

    expect(examples.unavailableRoomConversation[0].text).toContain(
      'already reserved at that time'
    );
    expect(examples.helpMeChooseConversation[0].text).toBe(
      'Sure 👍 What kind of room are you looking for?'
    );
    expect(
      examples.helpMeChooseConversation.some((message) =>
        message.text.includes('top 3 rooms')
      )
    ).toBe(true);
  });
});
