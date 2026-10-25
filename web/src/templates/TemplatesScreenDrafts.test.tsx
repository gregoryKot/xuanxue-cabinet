// «Черновик поста» и шаблоны постов на экране «Шаблоны» сохраняются каждый
// своей кнопкой, а `updatedAt` у настроек один на всех. Сохранение одного
// не должно стирать то, что учитель набрал в другом и ещё не сохранил
// (useSavedDraft.ts): до 2026-09-29 каждое поле сбрасывалось до сохранённого
// по общему `updatedAt`. Такая же проверка для разделов «Школы» —
// school/SchoolScreenDrafts.test.tsx.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LESSON_REMINDER_MINUTES,
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
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
    paymentContact: DEFAULT_PAYMENT_CONTACT,
    paymentReminder: DEFAULT_PAYMENT_REMINDER,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const SAVE_PREVIEW = 'Сохранить время предпросмотра';

describe('TemplatesScreen — черновики разных разделов', () => {
  it('сохранение времени предпросмотра не стирает набранное в шаблоне поста', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': makeSettings(), '/lessons': [] });
    render(<TemplatesScreen />);

    const field = await screen.findByLabelText(PREVIEW_LABEL);
    await user.clear(field);
    await user.type(field, '10');
    const [announcement] = screen.getAllByLabelText('Текст шаблона');
    if (!announcement) throw new Error('редактор анонса не отрисован');
    fireEvent.change(announcement, { target: { value: 'Анонс, правка' } });

    // Ответ на сохранение времени: новый updatedAt, и заодно с сервера пришёл
    // другой текст записи — по нему видно, что сверка с сохранённым прошла.
    mockApiByPath({
      '/settings': makeSettings({
        previewMinutes: 10,
        templates: { lesson_link: 'Анонс', recording: 'Запись с сервера' },
        updatedAt: '2026-01-02T00:00:00Z',
      }),
      '/lessons': [],
    });
    await user.click(screen.getByRole('button', { name: SAVE_PREVIEW }));

    await waitFor(() =>
      expect(screen.getAllByLabelText('Текст шаблона')[1]).toHaveValue(
        'Запись с сервера',
      ),
    );
    expect(screen.getAllByLabelText('Текст шаблона')[0]).toHaveValue('Анонс, правка');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
    expect(screen.getByLabelText(PREVIEW_LABEL)).toHaveValue('10');
    expect(screen.getByRole('button', { name: SAVE_PREVIEW })).toBeDisabled();
  });

  it('сохранение шаблонов не стирает набранное время предпросмотра', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': makeSettings(), '/lessons': [] });
    render(<TemplatesScreen />);

    const field = await screen.findByLabelText(PREVIEW_LABEL);
    await user.clear(field);
    await user.type(field, '10');
    const [announcement] = screen.getAllByLabelText('Текст шаблона');
    if (!announcement) throw new Error('редактор анонса не отрисован');
    fireEvent.change(announcement, { target: { value: 'Анонс, правка' } });

    mockApiByPath({
      '/settings': makeSettings({
        templates: { lesson_link: 'Анонс, правка', recording: 'Запись' },
        updatedAt: '2026-01-02T00:00:00Z',
      }),
      '/lessons': [],
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled(),
    );
    expect(screen.getByLabelText(PREVIEW_LABEL)).toHaveValue('10');
    expect(screen.getByRole('button', { name: SAVE_PREVIEW })).toBeEnabled();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: { templates: { lesson_link: 'Анонс, правка' } },
      }),
    );
  });
});
