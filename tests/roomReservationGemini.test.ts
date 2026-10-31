import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@google/genai', () => ({
  ThinkingLevel: { LOW: 'LOW' },
  GoogleGenAI: vi.fn(function GoogleGenAIMock() {
    return { models: { generateContent } };
  }),
}));

import { GoogleGenAI } from '@google/genai';

import { ApiError } from '../lib/server/api-error';
import { extractReservationDetails } from '../lib/server/services/room-reservation-ai';

const validExtraction = {
  assistantMessage: 'I found that room for the requested time.',
  intent: 'reservation',
  roomQuery: 'Room 205',
  campus: 'digi',
  buildingQuery: 'Digital Learning Center',
  date: '2026-11-03',
  startTime: '14:00',
  endTime: '16:00',
  roomType: '',
  minCapacity: '',
  requiredFeatures: [],
  program: 'BSIT',
  purpose: 'Study group',
  organization: 'Student council',
  isEvent: 'No',
};
const emptyAssistantMessageFallback =
  'I found your reservation details. Let me check the room and schedule.';

const input = {
  localDate: '2026-10-31',
  timeZone: 'Asia/Shanghai',
  messages: [{ role: 'user' as const, content: 'I need Room 205.' }],
};

function geminiResponse(value: unknown) {
  return { text: JSON.stringify(value) };
}

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.stubEnv('GEMINI_MODEL', 'gemini-test-model');
  generateContent.mockReset();
  vi.mocked(GoogleGenAI).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Gemini room reservation extraction', () => {
  it('uses server credentials and structured JSON while preserving the extraction handoff shape', async () => {
    generateContent.mockResolvedValue(geminiResponse(validExtraction));

    const result = await extractReservationDetails(input);

    expect(result).toEqual(validExtraction);
    expect({ ...result, roomId: 'live-room-id' }).toEqual({
      ...validExtraction,
      roomId: 'live-room-id',
    });
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-key',
      httpOptions: { timeout: 20_000 },
    });
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-test-model',
      contents: 'User: I need Room 205.',
      config: expect.objectContaining({
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseJsonSchema: expect.objectContaining({
          properties: expect.objectContaining({
            roomQuery: { type: 'string' },
            program: { type: 'string' },
          }),
        }),
      }),
    }));
  });

  it.each(['', ' \t\n '])(
    'uses the deterministic assistant message fallback when the model returns %j',
    async (assistantMessage) => {
      generateContent.mockResolvedValue(geminiResponse({
        ...validExtraction,
        assistantMessage,
      }));

      await expect(extractReservationDetails(input)).resolves.toEqual({
        ...validExtraction,
        assistantMessage: emptyAssistantMessageFallback,
      });
    }
  );

  it('preserves a non-empty assistant message and still rejects invalid extraction fields', async () => {
    generateContent.mockResolvedValue(geminiResponse(validExtraction));
    await expect(extractReservationDetails(input)).resolves.toEqual(validExtraction);

    generateContent.mockResolvedValue(geminiResponse({
      ...validExtraction,
      campus: 'digital',
    }));
    await expect(extractReservationDetails(input)).rejects.toMatchObject({
      status: 502,
      code: 'ai_invalid_response',
      message: 'The reservation assistant returned an unreadable response. Please try again.',
    });
  });

  it('reports missing server credentials without calling Gemini', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');

    await expect(extractReservationDetails(input)).rejects.toMatchObject({
      status: 503,
      code: 'ai_not_configured',
      message: expect.stringContaining('GEMINI_API_KEY'),
    });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('keeps ambiguous room requests in the clarification response', async () => {
    const ambiguousExtraction = {
      ...validExtraction,
      assistantMessage: 'Which Room 205 did you mean?',
      campus: '',
    };
    generateContent.mockResolvedValue(geminiResponse(ambiguousExtraction));

    await expect(extractReservationDetails(input)).resolves.toEqual(ambiguousExtraction);
  });

  it('keeps missing room, date, and time information empty for follow-up questions', async () => {
    const incompleteExtraction = {
      ...validExtraction,
      assistantMessage: 'Which room, date, and times should I use?',
      roomQuery: '',
      date: '',
      startTime: '',
      endTime: '',
    };
    generateContent.mockResolvedValue(geminiResponse(incompleteExtraction));

    await expect(extractReservationDetails(input)).resolves.toMatchObject({
      assistantMessage: 'Which room, date, and times should I use?',
      roomQuery: '',
      date: '',
      startTime: '',
      endTime: '',
    });
  });

  it('rejects missing or malformed Gemini structured output as an assistant response error', async () => {
    generateContent.mockResolvedValue({ text: '{not-json' });

    await expect(extractReservationDetails(input)).rejects.toMatchObject({
      status: 502,
      code: 'ai_invalid_response',
    });

    generateContent.mockResolvedValue({ candidates: [] });
    await expect(extractReservationDetails(input)).rejects.toMatchObject({
      status: 502,
      code: 'ai_invalid_response',
    });
  });

  it('maps invalid Gemini credentials to a safe configuration message', async () => {
    generateContent.mockRejectedValue({ status: 403, message: 'internal credential detail' });

    let caught: unknown;
    try {
      await extractReservationDetails(input);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ status: 503, code: 'ai_credentials_invalid' });
    expect((caught as Error).message).not.toContain('internal credential detail');
  });

  it('maps Gemini quota and rate-limit errors without exposing provider details', async () => {
    generateContent.mockRejectedValue({ status: 429, message: 'private quota response' });

    let caught: unknown;
    try {
      await extractReservationDetails(input);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 503, code: 'ai_rate_limited' });
    expect((caught as Error).message).not.toContain('private quota response');
  });

  it('maps model timeouts to a retryable assistant message', async () => {
    const timeout = new Error('provider timeout detail');
    timeout.name = 'TimeoutError';
    generateContent.mockRejectedValue(timeout);

    const safeTimeout = {
      status: 504,
      code: 'ai_timeout',
      message: 'The reservation assistant took too long to respond. Please try again.',
    };
    await expect(extractReservationDetails(input)).rejects.toMatchObject(safeTimeout);

    generateContent.mockRejectedValue({ code: 'ETIMEDOUT', message: 'private socket detail' });
    await expect(extractReservationDetails(input)).rejects.toMatchObject(safeTimeout);
  });
});
