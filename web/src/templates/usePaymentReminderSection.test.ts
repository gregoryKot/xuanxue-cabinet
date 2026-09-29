import { act, renderHook } from '@testing-library/react';
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
import { ApiError } from '../api/http';
import { usePaymentReminderSection } from './usePaymentReminderSection';

function makeSettings(
  paymentReminder: Partial<PaymentReminderSettings> = {},
  updatedAt = '2026-09-06T18:00:00.000Z',
): SettingsDto {
  return {
    templates: { lesson_link: '', recording: '' },
    tz: 'Asia/Jerusalem',
    previewMinutes: DEFAULT_PREVIEW_MINUTES,
    lessonReminderMinutes: DEFAULT_LESSON_REMINDER_MINUTES,
    newcomerContact: DEFAULT_NEWCOMER_CONTACT,
    paymentContact: DEFAULT_PAYMENT_CONTACT,
    paymentReminder: { ...DEFAULT_PAYMENT_REMINDER, ...paymentReminder },
    updatedAt,
  };
}

function setup(settings: SettingsDto | null = makeSettings()) {
  const update = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(
    ({ current }: { current: SettingsDto | null }) =>
      usePaymentReminderSection(current, update),
    { initialProps: { current: settings } },
  );
  return { ...hook, update };
}

describe('usePaymentReminderSection — загрузка', () => {
  it('настройки ещё не пришли — значения по умолчанию, сохранять нечего', () => {
    const { result } = setup(null);

    expect(result.current.form).toEqual({
      enabled: false,
      dayText: String(DEFAULT_PAYMENT_REMINDER.dayOfMonth),
      time: DEFAULT_PAYMENT_REMINDER.time,
      template: DEFAULT_PAYMENT_REMINDER.template,
    });
    expect(result.current.hasChanges).toBe(false);
  });

  it('сохранённая настройка — форма показывает её, изменений нет', () => {
    const { result } = setup(
      makeSettings({ enabled: true, dayOfMonth: 12, time: '09:30', template: 'Привет' }),
    );

    expect(result.current.form).toEqual({
      enabled: true,
      dayText: '12',
      time: '09:30',
      template: 'Привет',
    });
    expect(result.current.hasChanges).toBe(false);
  });

  it('ответ старого сервера без paymentReminder — не падает, берёт значения по умолчанию', () => {
    const legacy = { ...makeSettings(), paymentReminder: undefined } as unknown;
    const { result } = setup(legacy as SettingsDto);

    expect(result.current.form.template).toBe(DEFAULT_PAYMENT_REMINDER.template);
    expect(result.current.hasChanges).toBe(false);
  });
});

describe('usePaymentReminderSection — изменение и сохранение', () => {
  it('меняем только включатель — PATCH несёт одно поле enabled', async () => {
    const { result, update } = setup();

    act(() => result.current.setField('enabled', true));
    expect(result.current.hasChanges).toBe(true);

    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ paymentReminder: { enabled: true } });
  });

  it('день и время — в PATCH число и строка HH:mm, остальное не трогается', async () => {
    const { result, update } = setup();

    act(() => {
      result.current.setField('dayText', '31');
      result.current.setField('time', '18:45');
    });
    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({
      paymentReminder: { dayOfMonth: 31, time: '18:45' },
    });
  });

  it('текст — уходит без обрезки: переводы строк часть вёрстки сообщения', async () => {
    const { result, update } = setup();

    act(() => result.current.setField('template', '{имя}, оплатите {месяц}\n'));
    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({
      paymentReminder: { template: '{имя}, оплатите {месяц}\n' },
    });
  });

  it('вернули сохранённое значение — «нечего сохранять», запроса нет', async () => {
    const { result, update } = setup();

    act(() => result.current.setField('dayText', '20'));
    expect(result.current.hasChanges).toBe(true);
    act(() =>
      result.current.setField('dayText', String(DEFAULT_PAYMENT_REMINDER.dayOfMonth)),
    );
    expect(result.current.hasChanges).toBe(false);

    await act(async () => {
      await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('ответ сервера (новый updatedAt) обновляет форму и гасит «есть изменения»', () => {
    const { result, rerender } = setup();

    act(() => result.current.setField('dayText', '20'));
    expect(result.current.hasChanges).toBe(true);

    rerender({
      current: makeSettings({ dayOfMonth: 20 }, '2026-09-06T18:05:00.000Z'),
    });

    expect(result.current.form.dayText).toBe('20');
    expect(result.current.hasChanges).toBe(false);
  });

  it('тот же updatedAt — набранное не перезатирается', () => {
    const { result, rerender } = setup();

    act(() => result.current.setField('dayText', '20'));
    rerender({ current: makeSettings() });

    expect(result.current.form.dayText).toBe('20');
  });

  it('сервер отказал — ошибка из ApiError, форма остаётся как была', async () => {
    const { result, update } = setup();
    update.mockRejectedValueOnce(
      new ApiError('Неизвестная подстановка', 400, 'invalid_input'),
    );

    act(() => result.current.setField('enabled', true));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error?.message).toBe('Неизвестная подстановка');
    expect(result.current.form.enabled).toBe(true);
    expect(result.current.pending).toBe(false);
  });

  it('сеть не ответила — общий текст с действием', async () => {
    const { result, update } = setup();
    update.mockRejectedValueOnce(new Error('offline'));

    act(() => result.current.setField('enabled', true));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error?.message).toBe(
      'Не удалось сохранить напоминание. Попробуйте ещё раз.',
    );
  });
});

describe('usePaymentReminderSection — валидация', () => {
  it.each(['0', '32', '1.5', '', ' ', 'пятое', '-3'])(
    'день «%s» — ошибка, сохранить нельзя',
    async (dayText) => {
      const { result, update } = setup();

      act(() => result.current.setField('dayText', dayText));

      expect(result.current.dayError).toMatch(/число от 1 до 31/);
      expect(result.current.hasChanges).toBe(false);
      await act(async () => {
        await result.current.save();
      });
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each(['1', '15', '31'])('день «%s» — допустим', (dayText) => {
    const { result } = setup();

    act(() => result.current.setField('dayText', dayText));

    expect(result.current.dayError).toBeNull();
  });

  it.each(['', '9:30', '24:00', '10:60', '10.30'])(
    'время «%s» — ошибка, сохранить нельзя',
    (time) => {
      const { result } = setup();

      act(() => result.current.setField('time', time));

      expect(result.current.timeError).toMatch(/часы и минуты/);
      expect(result.current.hasChanges).toBe(false);
    },
  );

  it('пустой текст и текст из пробелов — ошибка', () => {
    const { result } = setup();

    act(() => result.current.setField('template', '  \n '));

    expect(result.current.templateError).toMatch(/не может быть пустым/);
    expect(result.current.hasChanges).toBe(false);
  });

  it('подстановка поста в напоминании неизвестна — ошибка с именем', () => {
    const { result } = setup();

    act(() => result.current.setField('template', 'Пароль {пароль}'));

    expect(result.current.templateError).toMatch(/\{пароль\}/);
    expect(result.current.hasChanges).toBe(false);
  });

  it('подстановки напоминания и необязательный фрагмент — валидны', () => {
    const { result } = setup();

    act(() =>
      result.current.setField('template', '{имя}, {месяц}[, {сумма}][ {ссылка}]'),
    );

    expect(result.current.templateError).toBeNull();
    expect(result.current.hasChanges).toBe(true);
  });

  it('неверный день блокирует и сохранение исправной соседней правки', () => {
    const { result } = setup();

    act(() => {
      result.current.setField('enabled', true);
      result.current.setField('dayText', '40');
    });

    expect(result.current.hasChanges).toBe(false);
  });

  it('«Сбросить» возвращает текст по умолчанию', () => {
    const { result } = setup(makeSettings({ template: 'Свой текст' }));

    act(() => result.current.resetTemplate());

    expect(result.current.form.template).toBe(DEFAULT_PAYMENT_REMINDER.template);
    expect(result.current.hasChanges).toBe(true);
  });
});
