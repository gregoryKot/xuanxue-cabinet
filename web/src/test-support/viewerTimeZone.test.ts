// Обвязка тестов тоже код (apiFetchMock.test.ts): если `process.env.TZ`
// перестанет менять пояс Intl — сменится рантайм, пул vitest, — подписи про
// пояс снова начнут зависеть от машины, и падать будут экранные тесты, где
// причина не видна. Механизм закрепляем здесь.
import { describe, expect, it } from 'vitest';
import { formatTime } from '../lib/formatDate';
import { planningTzNote } from '../schedule/timezoneLabel';
import { stubViewerTimeZone, TEST_VIEWER_TZ } from './viewerTimeZone';

stubViewerTimeZone();

describe('stubViewerTimeZone', () => {
  it('пояс зрителя — заданный, а не системный', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(TEST_VIEWER_TZ);
  });

  it('подпись про пояс школы считает зрителя по заданному поясу', () => {
    expect(planningTzNote(['Asia/Jerusalem'])).toBe(
      'Время — по вашим часам. Школа живёт по Asia/Jerusalem.',
    );
  });

  it('время на экране форматируется в том же поясе', () => {
    expect(formatTime('2026-09-08T16:00:00.000Z')).toBe('19:00');
  });
});
