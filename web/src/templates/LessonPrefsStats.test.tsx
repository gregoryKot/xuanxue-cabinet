// Строка «сколько учеников выбрали своё» (ADR-0162, п. 5): загрузка, число,
// пустая база, сбой. Сеть — `mockApiByPath` по пути запроса, не очередь `…Once`
// (check-once-mock-ratchet).
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  type SettingsDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { LessonPrefsStats } from './LessonPrefsStats';
import { LESSON_PREFS_NOBODY_TEXT } from './lessonPrefsStatsText';
import { SchoolSiteField } from './SchoolSiteField';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const STATS_PATH = '/notifications/lesson-prefs-stats';

const SETTINGS: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 5,
  lessonReminderMinutes: 60,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  paymentContact: DEFAULT_PAYMENT_CONTACT,
  paymentReminder: DEFAULT_PAYMENT_REMINDER,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

describe('LessonPrefsStats', () => {
  it('пока число грузится — скелетон по форме строки, текста ещё нет', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    const { container } = render(<LessonPrefsStats />);

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByText(/выбрали/)).not.toBeInTheDocument();
  });

  it('показывает число: факты выделены, маркеров ** на экране нет', async () => {
    mockApiByPath({
      [STATS_PATH]: { activeStudents: 40, chosenClasses: 5, ownReminder: 3 },
    });

    const { container } = render(<LessonPrefsStats />);

    expect(await screen.findByText('5 из 40')).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('5 из 40');
    expect(container).toHaveTextContent(
      'Свои занятия выбрали 5 из 40 учеников, своё время напоминания — 3.',
    );
    expect(container).not.toHaveTextContent('**');
  });

  it('пустая база — честная фраза вместо «0 из 0»', async () => {
    mockApiByPath({
      [STATS_PATH]: { activeStudents: 0, chosenClasses: 0, ownReminder: 0 },
    });

    render(<LessonPrefsStats />);

    expect(await screen.findByText(LESSON_PREFS_NOBODY_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/0 из 0/)).not.toBeInTheDocument();
  });

  it('сбой — тихая приписка с текстом сервера, без красного баннера', async () => {
    mockApiByPath({ [STATS_PATH]: new ApiError('Сервис недоступен', 503, 'unknown') });

    render(<LessonPrefsStats />);

    expect(await screen.findByText('Сервис недоступен')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SchoolSiteField — число под школьным напоминанием', () => {
  it('строка стоит в разделе «Школа», после поля «За сколько минут напомнить»', async () => {
    mockApiByPath({
      [STATS_PATH]: { activeStudents: 12, chosenClasses: 2, ownReminder: 0 },
    });

    render(<SchoolSiteField settings={SETTINGS} update={vi.fn()} />);

    const stats = await screen.findByText('2 из 12');
    const field = screen.getByLabelText('За сколько минут напомнить ученикам о занятии');
    expect(
      field.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      STATS_PATH,
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
  });
});
