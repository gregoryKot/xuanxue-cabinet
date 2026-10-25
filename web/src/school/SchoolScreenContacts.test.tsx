// Контакты на экране «Школа» (ADR-0176): «Контакт для новичков» (ADR-0115) и
// «Контакт для оплаты» (ADR-0159). Сеть — mockApiByPath по пути запроса, не
// очередь `…Once` (ADR-0116); общая обвязка — schoolTestSupport.tsx.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_NEWCOMER_CONTACT, DEFAULT_PAYMENT_CONTACT } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import {
  makeSettings,
  mockSchoolApi,
  mockSchoolSaveFailure,
  renderSchoolScreen,
} from './schoolTestSupport';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

// Поле «Кому писать, если человек ещё не в школе» — PATCH-механика та же, что у
// адреса сайта (NewcomerContactField.tsx), кнопка «Сохранить контакт». В отличие
// от адреса сайта поле нельзя очистить: пустое значение не проходит на сервере
// (UpdateSettingsInput.newcomerContact, shared/src/settings.ts).
describe('SchoolScreen — контакт для новичков', () => {
  const LABEL = 'Кому писать, если человек ещё не в школе';
  const SAVE = 'Сохранить контакт';

  it('дефолт школы без документа настроек — поле показывает контакт по умолчанию', async () => {
    mockSchoolApi();

    renderSchoolScreen();

    // Под нагрузкой CI ответ /settings приезжал позже, чем находилось поле
    // (web-coverage, PR #442, 2026-09-27): ждём значение, а не наличие поля.
    await waitFor(() =>
      expect(screen.getByLabelText(LABEL)).toHaveValue(DEFAULT_NEWCOMER_CONTACT),
    );
  });

  it('сохранённый контакт показан в поле', async () => {
    mockSchoolApi(makeSettings({ newcomerContact: 'Ире @irina_school' }));

    renderSchoolScreen();

    expect(await screen.findByDisplayValue('Ире @irina_school')).toHaveAccessibleName(
      LABEL,
    );
  });

  it('«Сохранить контакт» — PATCH /settings с { newcomerContact }', async () => {
    const user = userEvent.setup();
    mockSchoolApi(makeSettings({ newcomerContact: 'Старый контакт' }));

    renderSchoolScreen();
    // До ответа /settings поле показывает дефолт школы, а приход настроек
    // перезаписывает его (useSettingsTextField, эффект по updatedAt). Под
    // нагрузкой ответ приезжал между очисткой и набором (2026-09-27), поэтому
    // сначала ждём значение, которого без ответа сервера быть не может.
    const field = await screen.findByDisplayValue('Старый контакт');
    await user.clear(field);
    await user.type(field, 'Ире @irina_school');
    expect(field).toHaveValue('Ире @irina_school');

    mockSchoolApi(
      makeSettings({
        newcomerContact: 'Ире @irina_school',
        updatedAt: '2026-01-02T00:00:00Z',
      }),
    );
    await user.click(screen.getByRole('button', { name: SAVE }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({
          method: 'PATCH',
          body: { newcomerContact: 'Ире @irina_school' },
        }),
      ),
    );
  });

  it('поле очищено — «Сохранить контакт» неактивна, PATCH не уходит', async () => {
    const user = userEvent.setup();
    mockSchoolApi();

    renderSchoolScreen();
    await user.clear(await screen.findByLabelText(LABEL));

    expect(screen.getByRole('button', { name: SAVE })).toBeDisabled();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('сбой сохранения — ошибка сервера видна под полем', async () => {
    const user = userEvent.setup();
    mockSchoolApi();

    renderSchoolScreen();
    const field = await screen.findByLabelText(LABEL);
    await user.clear(field);
    await user.type(field, 'Ире @irina_school');

    mockSchoolSaveFailure(
      new ApiError('Контакт для новичков: заполните поле.', 400, 'invalid_input'),
    );
    await user.click(screen.getByRole('button', { name: SAVE }));

    expect(
      await screen.findByText('Контакт для новичков: заполните поле.'),
    ).toBeInTheDocument();
  });
});

// Сам компонент и его сохранение проверены в PaymentContactField.test.tsx;
// здесь только то, что экран «Школа» его рисует первым и кладёт в него контакт
// из /settings.
describe('SchoolScreen — контакт для оплаты', () => {
  it('поле показывает сохранённый контакт бухгалтера', async () => {
    mockSchoolApi(makeSettings({ paymentContact: 'Кате @katya_books' }));

    renderSchoolScreen();

    expect(await screen.findByDisplayValue('Кате @katya_books')).toHaveAccessibleName(
      'Кому и куда присылать скриншот об оплате',
    );
  });

  it('без документа настроек — контакт для оплаты по умолчанию', async () => {
    mockSchoolApi();

    renderSchoolScreen();

    await waitFor(() =>
      expect(
        screen.getByLabelText('Кому и куда присылать скриншот об оплате'),
      ).toHaveValue(DEFAULT_PAYMENT_CONTACT),
    );
  });
});
