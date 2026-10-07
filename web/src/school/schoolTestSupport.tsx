// Общая обвязка тестов экрана «Школа» (ADR-0176): настройки школы, ответы сети
// и рендер. Сам `vi.mock('../api/http', …)` остаётся в файле теста — vitest
// поднимает его до импортов. Вынесено, чтобы SchoolScreen.test.tsx и
// SchoolScreenDrafts.test.tsx не повторяли один каркас (CLAUDE.md «Дубли»).
import { render } from '@testing-library/react';
import {
  DEFAULT_LESSON_REMINDER_MINUTES,
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  DEFAULT_PREVIEW_MINUTES,
  type SettingsDto,
} from '@xuanxue/shared';
import { mockApiByPath, mockedApiFetch } from '../test-support/apiFetchMock';
import SchoolScreen from './SchoolScreen';

const STATS_PATH = '/notifications/lesson-prefs-stats';

/** Строка «сколько учеников выбрали своё» (LessonPrefsStats.tsx) тянет свой
 * запрос при открытии экрана; в тестах разделов она не предмет проверки. */
const EMPTY_STATS = { activeStudents: 0, chosenClasses: 0, ownReminder: 0 };

export function makeSettings(overrides: Partial<SettingsDto> = {}): SettingsDto {
  return {
    templates: { lesson_link: 'Анонс', recording: 'Запись' },
    tz: 'Asia/Jerusalem',
    previewMinutes: DEFAULT_PREVIEW_MINUTES,
    lessonReminderMinutes: DEFAULT_LESSON_REMINDER_MINUTES,
    newcomerContact: DEFAULT_NEWCOMER_CONTACT,
    paymentContact: DEFAULT_PAYMENT_CONTACT,
    paymentReminder: DEFAULT_PAYMENT_REMINDER,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Сеть экрана «Школа»: настройки (и на GET, и на PATCH — настоящий
 * контроллер отвечает полным SettingsDto, ADR-0087) и число под напоминанием.
 * `Error` вместо настроек — «настройки не загрузились». */
export function mockSchoolApi(settings: SettingsDto | Error = makeSettings()): void {
  mockApiByPath({ '/settings': settings, [STATS_PATH]: EMPTY_STATS });
}

/** Настройки читаются, а сохранение (PATCH) падает с `error`. Очередь
 * `mockRejectedValueOnce` ловила бы первый попавшийся запрос, а не запись
 * (check-once-mock-ratchet, ADR-0116) — здесь ответ выбирается по методу. */
export function mockSchoolSaveFailure(error: Error): void {
  mockedApiFetch.mockImplementation((path: string, options) => {
    if (path.startsWith('/settings')) {
      return options?.method === 'PATCH'
        ? Promise.reject(error)
        : Promise.resolve(makeSettings());
    }
    if (path.startsWith(STATS_PATH)) return Promise.resolve(EMPTY_STATS);
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
}

export function renderSchoolScreen() {
  return render(<SchoolScreen />);
}
