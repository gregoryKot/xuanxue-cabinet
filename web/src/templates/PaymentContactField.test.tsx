// Поле «Кому и куда присылать скриншот об оплате» (ADR-0159) — компонент отдельно от
// экрана «Шаблоны»: `update` подменён, сети нет. Логика поля — в
// usePaymentContactField.test.ts, PATCH-механика — useSettingsTextField.test.ts.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  type SettingsDto,
} from '@xuanxue/shared';
import { PaymentContactField } from './PaymentContactField';

const LABEL = 'Кому и куда присылать скриншот об оплате';
const SAVE = 'Сохранить контакт для оплаты';

const SETTINGS: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 5,
  lessonReminderMinutes: 60,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  paymentContact: 'Кате @katya_books',
  paymentReminder: DEFAULT_PAYMENT_REMINDER,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

describe('PaymentContactField', () => {
  it('объяснено, кто видит контакт; сохранённый контакт показан в поле', () => {
    render(<PaymentContactField settings={SETTINGS} update={vi.fn()} />);

    expect(screen.getByText('ученики')).toBeInTheDocument();
    expect(screen.getByLabelText(LABEL)).toHaveValue('Кате @katya_books');
    expect(screen.getByLabelText(LABEL)).toHaveAttribute(
      'placeholder',
      DEFAULT_PAYMENT_CONTACT,
    );
  });

  it('«Сохранить контакт для оплаты» — update({ paymentContact }) без пробелов по краям', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockResolvedValue(undefined);
    render(<PaymentContactField settings={SETTINGS} update={update} />);

    const field = screen.getByLabelText(LABEL);
    await user.clear(field);
    await user.type(field, '  Маше Вязовой — например, в Telegram @marievyazova ');
    await user.click(screen.getByRole('button', { name: SAVE }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        paymentContact: 'Маше Вязовой — например, в Telegram @marievyazova',
      }),
    );
  });

  it('поле очищено — кнопка неактивна, update не зовётся', async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    render(<PaymentContactField settings={SETTINGS} update={update} />);

    await user.clear(screen.getByLabelText(LABEL));

    expect(screen.getByRole('button', { name: SAVE })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it('сбой сохранения — ошибка сервера видна под полем', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    const update = vi
      .fn()
      .mockRejectedValue(new ApiError('Контакт слишком длинный.', 400, 'invalid_input'));
    render(<PaymentContactField settings={SETTINGS} update={update} />);

    const field = screen.getByLabelText(LABEL);
    await user.type(field, 'x');
    await user.click(screen.getByRole('button', { name: SAVE }));

    expect(await screen.findByText('Контакт слишком длинный.')).toBeInTheDocument();
  });
});
