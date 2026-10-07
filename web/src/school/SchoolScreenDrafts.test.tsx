// Разделы экрана «Школа» сохраняются каждый своей кнопкой, а `updatedAt` у
// настроек один на всех. Сохранение одного раздела не должно стирать то, что
// учитель набрал в других и ещё не сохранил (useSavedDraft.ts): до 2026-09-29
// каждое поле сбрасывалось до сохранённого по общему `updatedAt`. Сеть —
// mockApiByPath (ADR-0116); общая обвязка — schoolTestSupport.tsx.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PAYMENT_REMINDER } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { makeSettings, mockSchoolApi, renderSchoolScreen } from './schoolTestSupport';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const REMINDER_LABEL = 'За сколько минут напомнить ученикам о занятии';
const SITE_LABEL = 'Адрес сайта школы';
const NAME_LABEL = 'Имя человека или название школы';
const NEWCOMER_LABEL = 'Кому писать, если человек ещё не в школе';

describe('SchoolScreen — черновики разных разделов', () => {
  it('сохранение адреса сайта не стирает набранное в «Оплатах», у новичков и в «Кто отвечает за данные»', async () => {
    const user = userEvent.setup();
    mockSchoolApi();
    renderSchoolScreen();

    // Несохранённые правки в четырёх разделах.
    fireEvent.change(await screen.findByLabelText('Время'), {
      target: { value: '09:30' },
    });
    await user.type(screen.getByLabelText(SITE_LABEL), 'https://xuanxue.su');
    await user.clear(screen.getByLabelText(NEWCOMER_LABEL));
    await user.type(screen.getByLabelText(NEWCOMER_LABEL), 'Ире @irina_school');
    await user.type(screen.getByLabelText(NAME_LABEL), 'Дмитрий');

    // Ответ на сохранение адреса: новый updatedAt, и заодно с сервера пришло
    // время напоминания о занятии — по нему видно, что сверка с сохранённым
    // прошла, а не пропустила ответ.
    mockSchoolApi(
      makeSettings({
        schoolSiteUrl: 'https://xuanxue.su',
        lessonReminderMinutes: 25,
        updatedAt: '2026-01-02T00:00:00Z',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить адрес' }));

    await waitFor(() => expect(screen.getByLabelText(REMINDER_LABEL)).toHaveValue('25'));
    expect(screen.getByLabelText('Время')).toHaveValue('09:30');
    expect(screen.getByRole('button', { name: 'Сохранить напоминание' })).toBeEnabled();
    expect(screen.getByLabelText(NEWCOMER_LABEL)).toHaveValue('Ире @irina_school');
    expect(screen.getByRole('button', { name: 'Сохранить контакт' })).toBeEnabled();
    expect(screen.getByLabelText(NAME_LABEL)).toHaveValue('Дмитрий');
    expect(
      screen.getByRole('button', { name: 'Сохранить ответственного' }),
    ).toBeEnabled();
    // Сам адрес сохранён и больше не черновик.
    expect(screen.getByRole('button', { name: 'Сохранить адрес' })).toBeDisabled();
  });

  it('сохранение напоминания об оплате не стирает набранный адрес сайта', async () => {
    const user = userEvent.setup();
    mockSchoolApi();
    renderSchoolScreen();

    await user.type(await screen.findByLabelText(SITE_LABEL), 'https://xuanxue.su');
    fireEvent.change(screen.getByLabelText('Время'), { target: { value: '09:30' } });

    mockSchoolApi(
      makeSettings({
        paymentReminder: { ...DEFAULT_PAYMENT_REMINDER, time: '09:30' },
        lessonReminderMinutes: 25,
        updatedAt: '2026-01-02T00:00:00Z',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить напоминание' }));

    await waitFor(() => expect(screen.getByLabelText(REMINDER_LABEL)).toHaveValue('25'));
    expect(screen.getByLabelText(SITE_LABEL)).toHaveValue('https://xuanxue.su');
    expect(screen.getByRole('button', { name: 'Сохранить адрес' })).toBeEnabled();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: { paymentReminder: { time: '09:30' } },
      }),
    );
  });

  it('сохранение напоминания о занятии не стирает набранный контакт для новичков', async () => {
    const user = userEvent.setup();
    mockSchoolApi();
    renderSchoolScreen();

    const newcomer = await screen.findByLabelText(NEWCOMER_LABEL);
    await user.clear(newcomer);
    await user.type(newcomer, 'Ире @irina_school');
    const reminder = screen.getByLabelText(REMINDER_LABEL);
    await user.clear(reminder);
    await user.type(reminder, '45');

    mockSchoolApi(
      makeSettings({ lessonReminderMinutes: 45, updatedAt: '2026-01-02T00:00:00Z' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Сохранить напоминание о занятии' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Сохранить напоминание о занятии' }),
      ).toBeDisabled(),
    );
    expect(screen.getByLabelText(NEWCOMER_LABEL)).toHaveValue('Ире @irina_school');
    expect(screen.getByRole('button', { name: 'Сохранить контакт' })).toBeEnabled();
  });
});
