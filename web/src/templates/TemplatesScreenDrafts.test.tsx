// Разделы экрана «Шаблоны» (в том числе «Кто отвечает за данные») сохраняются
// каждый своей кнопкой, а `updatedAt` у настроек один на всех. Сохранение
// одного раздела не должно стирать то, что учитель набрал в других и ещё не
// сохранил (useSavedDraft.ts): до 2026-09-29 каждое поле сбрасывалось до
// сохранённого по общему `updatedAt`.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LESSON_REMINDER_MINUTES,
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  DEFAULT_PREVIEW_MINUTES,
  type SettingsDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import TemplatesScreen from './TemplatesScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const PREVIEW_LABEL = 'За сколько минут показывать черновик';

function makeSettings(overrides: Partial<SettingsDto> = {}): SettingsDto {
  return {
    templates: { lesson_link: 'Анонс', recording: 'Запись' },
    tz: 'Asia/Jerusalem',
    previewMinutes: DEFAULT_PREVIEW_MINUTES,
    lessonReminderMinutes: DEFAULT_LESSON_REMINDER_MINUTES,
    newcomerContact: DEFAULT_NEWCOMER_CONTACT,
    paymentReminder: DEFAULT_PAYMENT_REMINDER,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TemplatesScreen — черновики разных разделов', () => {
  it('сохранение адреса сайта не стирает набранное в «Оплатах» и в шаблоне поста', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': makeSettings(), '/lessons': [] });
    render(<TemplatesScreen />);

    // Несохранённые правки в четырёх разделах.
    fireEvent.change(await screen.findByLabelText('Время'), {
      target: { value: '09:30' },
    });
    const [announcement] = screen.getAllByLabelText('Текст шаблона');
    if (!announcement) throw new Error('редактор анонса не отрисован');
    fireEvent.change(announcement, { target: { value: 'Анонс, правка' } });
    await user.type(screen.getByLabelText('Адрес сайта школы'), 'https://xuanxue.su');
    await user.type(screen.getByLabelText('Имя человека или название школы'), 'Дмитрий');

    // Ответ на сохранение адреса: новый updatedAt, и заодно с сервера пришло
    // время предпросмотра — по нему видно, что сверка с сохранённым прошла.
    mockApiByPath({
      '/settings': makeSettings({
        schoolSiteUrl: 'https://xuanxue.su',
        previewMinutes: 25,
        updatedAt: '2026-01-02T00:00:00Z',
      }),
      '/lessons': [],
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить адрес' }));

    await waitFor(() => expect(screen.getByLabelText(PREVIEW_LABEL)).toHaveValue('25'));
    expect(screen.getByLabelText('Время')).toHaveValue('09:30');
    expect(screen.getByRole('button', { name: 'Сохранить напоминание' })).toBeEnabled();
    expect(screen.getAllByLabelText('Текст шаблона')[0]).toHaveValue('Анонс, правка');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
    expect(screen.getByLabelText('Имя человека или название школы')).toHaveValue(
      'Дмитрий',
    );
    expect(
      screen.getByRole('button', { name: 'Сохранить ответственного' }),
    ).toBeEnabled();
  });

  it('сохранение напоминания не стирает набранный адрес сайта', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': makeSettings(), '/lessons': [] });
    render(<TemplatesScreen />);

    await user.type(
      await screen.findByLabelText('Адрес сайта школы'),
      'https://xuanxue.su',
    );
    fireEvent.change(screen.getByLabelText('Время'), { target: { value: '09:30' } });

    mockApiByPath({
      '/settings': makeSettings({
        paymentReminder: { ...DEFAULT_PAYMENT_REMINDER, time: '09:30' },
        previewMinutes: 25,
        updatedAt: '2026-01-02T00:00:00Z',
      }),
      '/lessons': [],
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить напоминание' }));

    await waitFor(() => expect(screen.getByLabelText(PREVIEW_LABEL)).toHaveValue('25'));
    expect(screen.getByLabelText('Адрес сайта школы')).toHaveValue('https://xuanxue.su');
    expect(screen.getByRole('button', { name: 'Сохранить адрес' })).toBeEnabled();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: { paymentReminder: { time: '09:30' } },
      }),
    );
  });
});
