// Раздел «Кто отвечает за данные»: подписи, объяснение «зачем» и кнопки
// сохранения. Логика значений — useDataControllerFields.test.ts; здесь то, что
// видит и нажимает учитель. Почти везде сети нет — `update` заглушка; один
// тест берёт настоящий useSettings поверх мока сети, чтобы проверить, что
// ответ PATCH ложится обратно в форму (ADR-0087). Сеть — mockApiByPath.
import { render, screen, waitFor } from '@testing-library/react';
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
import { DataControllerField } from './DataControllerField';
import { useSettings } from '../templates/useSettings';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const NAME_LABEL = 'Имя человека или название школы';
const CONTACT_LABEL = 'Как связаться: почта, телефон или Telegram';

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

describe('DataControllerField', () => {
  it('до первого действия объясняет, зачем эти поля, и что будет, если оставить пустыми', () => {
    render(<DataControllerField settings={SETTINGS} update={vi.fn()} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Кто отвечает за данные' }),
    ).toBeInTheDocument();
    // Акцент дошёл как <strong>, а не звёздочками (ADR-0124).
    expect(screen.getByText('кто отвечает за данные учеников').tagName).toBe('STRONG');
    expect(
      screen.getByText('Пока поле пустое, страница отправляет учеников к учителю.'),
    ).toBeInTheDocument();
  });

  it('без изменений обе кнопки неактивны', () => {
    render(<DataControllerField settings={SETTINGS} update={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Сохранить ответственного' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить способ связи' })).toBeDisabled();
  });

  it('«Сохранить ответственного» шлёт только имя', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockResolvedValue(undefined);
    render(<DataControllerField settings={SETTINGS} update={update} />);

    await user.type(screen.getByLabelText(NAME_LABEL), 'Дмитрий Дейч');
    await user.click(screen.getByRole('button', { name: 'Сохранить ответственного' }));

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ dataControllerName: 'Дмитрий Дейч' });
  });

  it('«Сохранить способ связи» шлёт только контакт', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockResolvedValue(undefined);
    render(<DataControllerField settings={SETTINGS} update={update} />);

    await user.type(screen.getByLabelText(CONTACT_LABEL), 'privacy@xuanxue.su');
    await user.click(screen.getByRole('button', { name: 'Сохранить способ связи' }));

    expect(update).toHaveBeenCalledWith({ dataControllerContact: 'privacy@xuanxue.su' });
  });

  it('заполненное поле можно очистить — уходит null, страница вернётся к «спросите учителя»', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockResolvedValue(undefined);
    render(
      <DataControllerField
        settings={{ ...SETTINGS, dataControllerName: 'Дмитрий Дейч' }}
        update={update}
      />,
    );

    await user.clear(screen.getByLabelText(NAME_LABEL));
    await user.click(screen.getByRole('button', { name: 'Сохранить ответственного' }));

    expect(update).toHaveBeenCalledWith({ dataControllerName: null });
  });
});

function Harness() {
  const { settings, loading, update } = useSettings();
  if (loading) return null;
  return <DataControllerField settings={settings} update={update} />;
}

describe('DataControllerField — поверх настоящего useSettings', () => {
  // Read-after-write: экран показывает то, что сервер вернул в ответе PATCH
  // (обрезанное и сохранённое), а не то, что ученик напечатал в поле.
  it('после сохранения поле показывает значение из ответа сервера, кнопка снова неактивна', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/settings': SETTINGS });
    render(<Harness />);

    const field = await screen.findByLabelText(NAME_LABEL);
    await user.type(field, '  Дмитрий Дейч  ');
    expect(field).toHaveValue('  Дмитрий Дейч  ');

    mockApiByPath({
      '/settings': {
        ...SETTINGS,
        dataControllerName: 'Дмитрий Дейч',
        updatedAt: '2026-09-06T18:10:00.000Z',
      },
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить ответственного' }));

    await waitFor(() => expect(field).toHaveValue('Дмитрий Дейч'));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: { dataControllerName: 'Дмитрий Дейч' },
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Сохранить ответственного' }),
    ).toBeDisabled();
  });
});
