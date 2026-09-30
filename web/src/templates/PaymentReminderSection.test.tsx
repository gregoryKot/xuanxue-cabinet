// Секция «Оплаты» целиком: настоящий useSettings поверх мока сети, чтобы
// проверить и запрос (PATCH только с изменёнными полями), и то, что ответ
// сервера ложится обратно в форму (ADR-0087). Сеть — mockApiByPath, не очередь
// `…Once` (ADR-0116).
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LESSON_REMINDER_MINUTES,
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  DEFAULT_PREVIEW_MINUTES,
  type PaymentReminderSettings,
  type SettingsDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { stubViewerTimeZone, TEST_VIEWER_TZ } from '../test-support/viewerTimeZone';
import { PaymentReminderSection } from './PaymentReminderSection';
import TemplatesScreen from './TemplatesScreen';
import { useSettings } from './useSettings';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

function makeSettings(
  paymentReminder: Partial<PaymentReminderSettings> = {},
  updatedAt = '2026-01-01T00:00:00Z',
  tz = 'Asia/Jerusalem',
): SettingsDto {
  return {
    templates: { lesson_link: 'Анонс', recording: 'Запись' },
    tz,
    previewMinutes: DEFAULT_PREVIEW_MINUTES,
    lessonReminderMinutes: DEFAULT_LESSON_REMINDER_MINUTES,
    newcomerContact: DEFAULT_NEWCOMER_CONTACT,
    paymentContact: DEFAULT_PAYMENT_CONTACT,
    paymentReminder: { ...DEFAULT_PAYMENT_REMINDER, ...paymentReminder },
    updatedAt,
  };
}

function Harness() {
  const { settings, loading, update } = useSettings();
  if (loading) return null;
  return <PaymentReminderSection settings={settings} update={update} />;
}

function patchCalls() {
  return mockedApiFetch.mock.calls.filter(([, options]) => options?.method === 'PATCH');
}

describe('PaymentReminderSection', () => {
  it('до первого действия объясняет, кому и когда придёт напоминание', async () => {
    mockApiByPath({ '/settings': makeSettings() });
    render(<Harness />);

    expect(await screen.findByRole('heading', { name: 'Оплаты' })).toBeInTheDocument();
    expect(screen.getByText(/об оплате за месяц/)).toBeInTheDocument();
    expect(screen.getByText(/в последний день месяца/)).toBeInTheDocument();
  });

  it('говорит, что день школы — по умолчанию, а свой ученик выбирает в «Профиле» (ADR-0160)', async () => {
    mockApiByPath({ '/settings': makeSettings() });
    render(<Harness />);

    expect(await screen.findByText(/выбирает сам в «Профиле»/)).toBeInTheDocument();
    expect(screen.getByText('для тех, кто не выбрал').tagName).toBe('STRONG');
    expect(screen.getByLabelText('День по умолчанию')).toBeInTheDocument();
    expect(screen.queryByLabelText('День месяца')).not.toBeInTheDocument();
  });

  it('выключено по умолчанию — включатель доступен по подписи, рядом спокойная строка', async () => {
    mockApiByPath({ '/settings': makeSettings() });
    render(<Harness />);

    const toggle = await screen.findByLabelText('Напоминать об оплате');
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText('Сейчас выключено — ученикам ничего не приходит.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить напоминание' })).toBeDisabled();
  });

  it('включатель с клавиатуры меняет строку под ним', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': makeSettings() });
    render(<Harness />);

    const toggle = await screen.findByLabelText('Напоминать об оплате');
    toggle.focus();
    await user.keyboard(' ');

    expect(toggle).toBeChecked();
    expect(screen.getByText(/Включено — напоминание придёт/)).toBeInTheDocument();
  });

  it('кнопка подстановки вставляет {месяц} в текст на место курсора', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': makeSettings({ template: 'Оплатите за ' }) });
    render(<Harness />);

    const textarea = await screen.findByLabelText('Текст напоминания');
    await user.click(textarea);
    await user.keyboard('{End}');
    await user.click(screen.getByRole('button', { name: '{месяц}' }));

    expect(textarea).toHaveValue('Оплатите за {месяц}');
  });

  it('у подстановок напоминания нет {пароль} из постов, а пояснения раскрываются списком', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': makeSettings() });
    render(<Harness />);

    await screen.findByLabelText('Текст напоминания');
    expect(screen.queryByRole('button', { name: '{пароль}' })).not.toBeInTheDocument();
    for (const name of ['{месяц}', '{сумма}', '{имя}', '{ссылка}']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }

    await user.click(screen.getByText('Что подставится в напоминание'));
    expect(
      screen.getByText('Имя ученика, как оно записано в кабинете.'),
    ).toBeInTheDocument();
  });

  it('неверный день — ошибка под полем, кнопка неактивна', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': makeSettings() });
    render(<Harness />);

    const day = await screen.findByLabelText('День по умолчанию');
    await user.clear(day);
    await user.type(day, '32');

    expect(screen.getByText(/День — число от 1 до 31/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить напоминание' })).toBeDisabled();
  });

  it('неизвестная подстановка — ошибка с именем под текстом', async () => {
    mockApiByPath({ '/settings': makeSettings() });
    render(<Harness />);

    const textarea = await screen.findByLabelText('Текст напоминания');
    fireEvent.change(textarea, { target: { value: 'Привет {ведущий}' } });

    expect(screen.getByText(/Неизвестные подстановки: \{ведущий\}/)).toBeInTheDocument();
  });

  it('сохранение шлёт PATCH только с изменёнными полями, ответ сервера ложится в форму', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': makeSettings() });
    render(<Harness />);

    await user.click(await screen.findByLabelText('Напоминать об оплате'));
    const day = screen.getByLabelText('День по умолчанию');
    await user.clear(day);
    await user.type(day, '31');

    mockApiByPath({
      '/settings': makeSettings(
        { enabled: true, dayOfMonth: 31 },
        '2026-01-02T00:00:00Z',
      ),
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить напоминание' }));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0]).toEqual([
      '/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: { paymentReminder: { enabled: true, dayOfMonth: 31 } },
      }),
    ]);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Сохранить напоминание' }),
      ).toBeDisabled(),
    );
    expect(screen.getByLabelText('День по умолчанию')).toHaveValue('31');
  });

  it('сервер отказал — текст ошибки под формой, кнопка остаётся доступной', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({ '/settings': makeSettings() });
    render(<Harness />);

    await user.click(await screen.findByLabelText('Напоминать об оплате'));
    mockApiByPath({
      '/settings': new ApiError('Сервис недоступен. Попробуйте позже.', 503, 'unknown'),
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить напоминание' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    expect(screen.getByRole('button', { name: 'Сохранить напоминание' })).toBeEnabled();
  });

  it('пояс школы отличается от часов зрителя — у времени подпись с поясом школы', async () => {
    mockApiByPath({
      '/settings': makeSettings({}, '2026-01-01T00:00:00Z', 'Asia/Jerusalem'),
    });
    render(<Harness />);

    // stubViewerTimeZone задаёт Europe/Moscow: пояс школы другой.
    expect(await screen.findByText('Asia/Jerusalem')).toBeInTheDocument();
  });

  it('настройки ещё не пришли — форма стоит на значениях по умолчанию, сохранять нечего', () => {
    render(<PaymentReminderSection settings={null} update={vi.fn()} />);

    expect(screen.getByLabelText('Напоминать об оплате')).not.toBeChecked();
    expect(screen.getByLabelText('День по умолчанию')).toHaveValue(
      String(DEFAULT_PAYMENT_REMINDER.dayOfMonth),
    );
    expect(screen.queryByText(/По часам школы/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить напоминание' })).toBeDisabled();
  });

  it('пояс школы совпадает с часами зрителя — подписи с поясом нет', async () => {
    mockApiByPath({
      '/settings': makeSettings({}, '2026-01-01T00:00:00Z', TEST_VIEWER_TZ),
    });
    render(<Harness />);

    await screen.findByRole('heading', { name: 'Оплаты' });
    expect(screen.queryByText(/По часам школы/)).not.toBeInTheDocument();
  });

  it('новое время включает «Сохранить напоминание» и уходит в PATCH', async () => {
    mockApiByPath({ '/settings': makeSettings() });
    render(<Harness />);

    fireEvent.change(await screen.findByLabelText('Время'), {
      target: { value: '09:30' },
    });
    const save = screen.getByRole('button', { name: 'Сохранить напоминание' });
    expect(save).toBeEnabled();

    mockApiByPath({
      '/settings': makeSettings({ time: '09:30' }, '2026-01-02T00:00:00Z'),
    });
    fireEvent.click(save);

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0]).toEqual([
      '/settings',
      expect.objectContaining({ body: { paymentReminder: { time: '09:30' } } }),
    ]);
  });
});

// Две кнопки сохранения живут на одном экране и не должны мешать друг другу:
// напоминание сохраняется своей, шаблоны постов — терракотовой внизу.
describe('PaymentReminderSection на экране «Шаблоны»', () => {
  it('правка напоминания включает «Сохранить напоминание», но не «Сохранить» у постов', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': makeSettings(), '/lessons': [] });
    render(<TemplatesScreen />);

    await user.click(await screen.findByLabelText('Напоминать об оплате'));

    expect(screen.getByRole('button', { name: 'Сохранить напоминание' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});
