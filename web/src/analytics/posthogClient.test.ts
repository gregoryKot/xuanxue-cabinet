import { beforeEach, describe, expect, it, vi } from 'vitest';

// Настоящий posthog-js пошёл бы в сеть и в DOM — здесь важны только вызовы.
const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
  sessionRecordingStarted: vi.fn(() => false),
}));
vi.mock('posthog-js', () => ({ default: posthog }));
vi.mock('posthog-js/dist/recorder', () => ({}));

const PERSON = { roles: ['student'], status: 'active' };

// Модуль держит флаг «уже запущен» — каждый тест берёт свежую копию.
async function loadClient() {
  vi.resetModules();
  return import('./posthogClient');
}

beforeEach(() => {
  vi.clearAllMocks();
  posthog.sessionRecordingStarted.mockReturnValue(false);
});

describe('posthogClient', () => {
  it('до старта ничего не делает', async () => {
    const client = await loadClient();
    client.syncRecording('/schedule');
    client.reset();
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });

  it('старт — init и identify только по id, повторный вызов не пересоздаёт', async () => {
    const client = await loadClient();
    client.startAnalytics('phc_x', 'u1', PERSON);
    client.startAnalytics('phc_x', 'u1', PERSON);
    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.identify).toHaveBeenCalledWith('u1', PERSON);
  });

  it('обычный экран — запись включается, если ещё не идёт', async () => {
    const client = await loadClient();
    client.startAnalytics('phc_x', 'u1', PERSON);
    client.syncRecording('/schedule');
    expect(posthog.startSessionRecording).toHaveBeenCalledTimes(1);
  });

  it('запись уже идёт — повторно не дёргаем', async () => {
    const client = await loadClient();
    client.startAnalytics('phc_x', 'u1', PERSON);
    posthog.sessionRecordingStarted.mockReturnValue(true);
    client.syncRecording('/schedule');
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
    expect(posthog.stopSessionRecording).not.toHaveBeenCalled();
  });

  it('экран с кодом в адресе — запись останавливается', async () => {
    const client = await loadClient();
    client.startAnalytics('phc_x', 'u1', PERSON);
    posthog.sessionRecordingStarted.mockReturnValue(true);
    client.syncRecording('/join/abc');
    expect(posthog.stopSessionRecording).toHaveBeenCalledTimes(1);
  });

  it('выход — reset, после него синхронизация снова ничего не делает', async () => {
    const client = await loadClient();
    client.startAnalytics('phc_x', 'u1', PERSON);
    client.reset();
    client.syncRecording('/schedule');
    expect(posthog.reset).toHaveBeenCalledTimes(1);
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
  });
});
