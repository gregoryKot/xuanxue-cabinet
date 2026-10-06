// Раздел «Доска»: подписи, объяснение «зачем» и кнопка сохранения. Логика
// значений — useBoardNoticeField.test.ts; здесь то, что видит и нажимает
// учитель. Один тест берёт настоящий useSettings поверх мока сети, чтобы
// проверить read-after-write (ADR-0087): экран показывает ответ сервера.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  type SettingsDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { BoardNoticeField } from './BoardNoticeField';
import { useSettings } from './useSettings';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const TEXT_LABEL = 'Объявление ученикам';
const UNTIL_LABEL = 'Показывать до';
const SAVE_LABEL = 'Сохранить объявление';

const SETTINGS: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 5,
  lessonReminderMinutes: 60,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  paymentContact: DEFAULT_PAYMENT_CONTACT,
  paymentReminder: DEFAULT_PAYMENT_REMINDER,
  updatedAt: '2026-10-06T10:00:00.000Z',
};

describe('BoardNoticeField', () => {
  it('до первого действия объясняет, что это и кто увидит; подсказка с примером', () => {
    render(<BoardNoticeField settings={SETTINGS} update={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Доска' })).toBeInTheDocument();
    // Акцент дошёл как <strong>, а не звёздочками (ADR-0124).
    expect(screen.getByText('доске каждого ученика').tagName).toBe('STRONG');
    expect(screen.getByText('оплата до 20 октября Маше').tagName).toBe('STRONG');
  });

  it('подсказывает пояс школы, когда он не совпадает с поясом зрителя', () => {
    render(<BoardNoticeField settings={SETTINGS} update={vi.fn()} />);

    expect(screen.getByText('Asia/Jerusalem').tagName).toBe('STRONG');
  });

  it('без изменений кнопка неактивна', () => {
    render(<BoardNoticeField settings={SETTINGS} update={vi.fn()} />);

    expect(screen.getByRole('button', { name: SAVE_LABEL })).toBeDisabled();
  });

  it('текст и дата уходят вместе одним сохранением', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockResolvedValue(undefined);
    render(<BoardNoticeField settings={SETTINGS} update={update} />);

    await user.type(screen.getByLabelText(TEXT_LABEL), 'Ретрит в ноябре');
    fireEvent.change(screen.getByLabelText(UNTIL_LABEL), {
      target: { value: '2026-10-20' },
    });
    await user.click(screen.getByRole('button', { name: SAVE_LABEL }));

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      boardNotice: { text: 'Ретрит в ноябре', until: '2026-10-20' },
    });
  });

  it('текст без даты — ошибка «Укажите, до какого дня показывать», запроса нет', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockResolvedValue(undefined);
    render(<BoardNoticeField settings={SETTINGS} update={update} />);

    await user.type(screen.getByLabelText(TEXT_LABEL), 'Ретрит в ноябре');
    await user.click(screen.getByRole('button', { name: SAVE_LABEL }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Укажите, до какого дня показывать',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('очищенный текст сбрасывает объявление — уходит null', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockResolvedValue(undefined);
    render(
      <BoardNoticeField
        settings={{
          ...SETTINGS,
          boardNotice: { text: 'Ретрит в ноябре', until: '2026-10-20' },
        }}
        update={update}
      />,
    );

    await user.clear(screen.getByLabelText(TEXT_LABEL));
    await user.click(screen.getByRole('button', { name: SAVE_LABEL }));

    expect(update).toHaveBeenCalledWith({ boardNotice: null });
  });
});

function Harness() {
  const { settings, loading, update } = useSettings();
  if (loading) return null;
  return <BoardNoticeField settings={settings} update={update} />;
}

describe('BoardNoticeField — поверх настоящего useSettings', () => {
  it('после сохранения поля показывают ответ сервера, кнопка снова неактивна', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': SETTINGS });
    render(<Harness />);

    const text = await screen.findByLabelText(TEXT_LABEL);
    await user.type(text, '  Ретрит в ноябре  ');
    fireEvent.change(screen.getByLabelText(UNTIL_LABEL), {
      target: { value: '2026-10-20' },
    });

    mockApiByPath({
      '/settings': {
        ...SETTINGS,
        boardNotice: { text: 'Ретрит в ноябре', until: '2026-10-20' },
        updatedAt: '2026-10-06T10:10:00.000Z',
      },
    });
    await user.click(screen.getByRole('button', { name: SAVE_LABEL }));

    await waitFor(() => expect(text).toHaveValue('Ретрит в ноябре'));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: { boardNotice: { text: 'Ретрит в ноябре', until: '2026-10-20' } },
      }),
    );
    expect(screen.getByLabelText(UNTIL_LABEL)).toHaveValue('2026-10-20');
    expect(screen.getByRole('button', { name: SAVE_LABEL })).toBeDisabled();
  });
});
