// Набранное в секции «Оплаты» и ещё не сохранённое не пропадает от того, что
// настройки пришли или обновились (useSavedDraft.ts). Два случая одного сбоя:
// 2026-09-29 «новое время включает „Сохранить напоминание“» мигало на нагруженной
// машине, а такой же сброс от сохранения соседнего поля был виден и без нагрузки.
import { fireEvent, render, screen } from '@testing-library/react';
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
import { renderBeforeEffects } from '../test-support/renderBeforeEffects';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { PaymentReminderSection } from './PaymentReminderSection';

stubViewerTimeZone();

const SAVE = 'Сохранить напоминание';

function makeSettings(
  paymentReminder: Partial<PaymentReminderSettings> = {},
  updatedAt = '2026-01-01T00:00:00Z',
): SettingsDto {
  return {
    templates: { lesson_link: 'Анонс', recording: 'Запись' },
    tz: 'Asia/Jerusalem',
    previewMinutes: DEFAULT_PREVIEW_MINUTES,
    lessonReminderMinutes: DEFAULT_LESSON_REMINDER_MINUTES,
    newcomerContact: DEFAULT_NEWCOMER_CONTACT,
    paymentContact: DEFAULT_PAYMENT_CONTACT,
    paymentReminder: { ...DEFAULT_PAYMENT_REMINDER, ...paymentReminder },
    updatedAt,
  };
}

describe('PaymentReminderSection — набранное переживает синхронизацию', () => {
  it('время, введённое сразу после появления секции, не сбрасывается эффектом монтирования', async () => {
    await renderBeforeEffects(
      <PaymentReminderSection settings={makeSettings()} update={vi.fn()} />,
      (container) => {
        const time = container.querySelector<HTMLInputElement>('input[type="time"]');
        if (!time) throw new Error('поле времени не отрисовано');

        fireEvent.change(time, { target: { value: '09:30' } });

        expect(time.value).toBe('09:30');
        const save = [...container.querySelectorAll('button')].find(
          (button) => button.textContent === SAVE,
        );
        expect(save).toBeEnabled();
      },
    );
  });

  it('пришёл новый updatedAt, пока учитель менял время: время его, остальное — с сервера', () => {
    const update = vi.fn();
    const { rerender } = render(
      <PaymentReminderSection settings={makeSettings()} update={update} />,
    );

    fireEvent.change(screen.getByLabelText('Время'), { target: { value: '09:30' } });
    // Соседняя секция сохранилась, и в тех же настройках день уже другой.
    rerender(
      <PaymentReminderSection
        settings={makeSettings({ dayOfMonth: 20 }, '2026-01-02T00:00:00Z')}
        update={update}
      />,
    );

    expect(screen.getByLabelText('Время')).toHaveValue('09:30');
    expect(screen.getByLabelText('День месяца')).toHaveValue('20');
    expect(screen.getByRole('button', { name: SAVE })).toBeEnabled();
  });
});
