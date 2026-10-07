// Экран «Школа» (ADR-0176): шапка, порядок разделов, адрес сайта и напоминание
// о занятии. Контакты — SchoolScreenContacts.test.tsx, черновики соседних
// разделов — SchoolScreenDrafts.test.tsx. Сеть — mockApiByPath по пути запроса,
// не очередь `…Once` (ADR-0116); общая обвязка — schoolTestSupport.tsx.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

const SITE_LABEL = 'Адрес сайта школы';
const SAVE_SITE = 'Сохранить адрес';

describe('SchoolScreen — загрузка', () => {
  it('показывает скелетон, пока настройки не пришли', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderSchoolScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Сайт школы' })).not.toBeInTheDocument();
  });

  it('ApiError — текст ошибки и «Попробовать ещё раз», повтор показывает разделы', async () => {
    const user = userEvent.setup();
    mockSchoolApi(new ApiError('Сервис недоступен', 503, 'unknown'));

    renderSchoolScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockSchoolApi();
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('heading', { name: 'Сайт школы' }),
    ).toBeInTheDocument();
  });
});

describe('SchoolScreen — шапка и разделы', () => {
  it('заголовок и объяснение, что здесь настраивается и зачем', async () => {
    mockSchoolApi();

    renderSchoolScreen();

    expect(
      await screen.findByRole('heading', { name: 'Школа', level: 1 }),
    ).toBeInTheDocument();
    // Акцент дошёл как <strong>, а не звёздочками (ADR-0124).
    expect(screen.getByText('кому платить').tagName).toBe('STRONG');
    expect(screen.getByText(/Что ученики знают о школе/)).toBeInTheDocument();
  });

  it('шесть разделов идут по тому, как часто их трогают (ADR-0176)', async () => {
    mockSchoolApi();

    renderSchoolScreen();
    await screen.findByRole('heading', { name: 'Сайт школы' });

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      'Контакт для оплаты',
      'Оплаты',
      'Контакт для новичков',
      'Напоминание о занятии',
      'Сайт школы',
      'Кто отвечает за данные',
    ]);
  });

  it('шаблонов постов и времени предпросмотра здесь нет — они на «Шаблонах»', async () => {
    mockSchoolApi();

    renderSchoolScreen();
    await screen.findByRole('heading', { name: 'Сайт школы' });

    expect(screen.queryByLabelText('Текст шаблона')).not.toBeInTheDocument();
    expect(screen.queryByText('Черновик поста')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('За сколько минут показывать черновик'),
    ).not.toBeInTheDocument();
  });
});

// Секция «Сайт школы» (В6 аудита, docs/adr/0009-domain-xuanxue-su.md
// дополнение) — PATCH-механика useSettings.ts, своя кнопка «Сохранить адрес»
// (SchoolSiteField.tsx).
describe('SchoolScreen — адрес сайта школы', () => {
  it('поле пустое, пока учитель не заполнил — «Сохранить адрес» неактивна', async () => {
    mockSchoolApi();

    renderSchoolScreen();

    expect(await screen.findByLabelText(SITE_LABEL)).toHaveValue('');
    expect(screen.getByRole('button', { name: SAVE_SITE })).toBeDisabled();
  });

  it('сохранённый адрес показан в поле', async () => {
    mockSchoolApi(makeSettings({ schoolSiteUrl: 'https://xuanxue.su' }));

    renderSchoolScreen();

    // SchoolSiteField синхронизирует значение своим отдельным эффектом
    // (useSchoolSiteField.ts) — на кадр позже, чем появляется заголовок;
    // findByDisplayValue дожидается его, а не проверяет DOM сразу.
    expect(await screen.findByDisplayValue('https://xuanxue.su')).toHaveAccessibleName(
      SITE_LABEL,
    );
  });

  it('«Сохранить адрес» — PATCH /settings с { schoolSiteUrl }', async () => {
    const user = userEvent.setup();
    mockSchoolApi();

    renderSchoolScreen();
    await user.type(await screen.findByLabelText(SITE_LABEL), 'https://xuanxue.su');

    mockSchoolApi(
      makeSettings({
        schoolSiteUrl: 'https://xuanxue.su',
        updatedAt: '2026-01-02T00:00:00Z',
      }),
    );
    await user.click(screen.getByRole('button', { name: SAVE_SITE }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({
          method: 'PATCH',
          body: { schoolSiteUrl: 'https://xuanxue.su' },
        }),
      ),
    );
  });

  it('поле очищено — «Сохранить адрес» шлёт schoolSiteUrl: null (снятие)', async () => {
    const user = userEvent.setup();
    mockSchoolApi(makeSettings({ schoolSiteUrl: 'https://xuanxue.su' }));

    renderSchoolScreen();
    // Сохранённое значение стоит в поле с первого рендера секции
    // (useSavedDraft.ts), ждать эффекта синхронизации не нужно.
    await user.clear(await screen.findByDisplayValue('https://xuanxue.su'));

    mockSchoolApi(makeSettings({ updatedAt: '2026-01-02T00:00:00Z' }));
    await user.click(screen.getByRole('button', { name: SAVE_SITE }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({ method: 'PATCH', body: { schoolSiteUrl: null } }),
      ),
    );
  });

  it('сбой сохранения — ошибка сервера видна под полем', async () => {
    const user = userEvent.setup();
    mockSchoolApi();

    renderSchoolScreen();
    await user.type(await screen.findByLabelText(SITE_LABEL), 'http://xuanxue.su');

    mockSchoolSaveFailure(
      new ApiError(
        'Адрес сайта школы: должна начинаться с https://.',
        400,
        'invalid_input',
      ),
    );
    await user.click(screen.getByRole('button', { name: SAVE_SITE }));

    expect(
      await screen.findByText('Адрес сайта школы: должна начинаться с https://.'),
    ).toBeInTheDocument();
  });
});

// Поле «За сколько минут напомнить ученикам о занятии» (ADR-0135) — механика
// useMinutesField.ts, кнопка «Сохранить напоминание о занятии»; число «сколько
// учеников выбрали своё» под ним — LessonPrefsStats.test.tsx.
describe('SchoolScreen — напоминание ученикам о занятии', () => {
  const LABEL = 'За сколько минут напомнить ученикам о занятии';
  const SAVE = 'Сохранить напоминание о занятии';

  it('дефолт школы без документа настроек — поле показывает 60', async () => {
    mockSchoolApi();

    renderSchoolScreen();

    // Секция рисуется уже с сохранённым значением (useSavedDraft.ts), а не
    // пустой с догрузкой эффектом.
    expect(await screen.findByLabelText(LABEL)).toHaveValue('60');
  });

  it('сохранённое значение показано в поле', async () => {
    mockSchoolApi(makeSettings({ lessonReminderMinutes: 30 }));

    renderSchoolScreen();

    expect(await screen.findByDisplayValue('30')).toHaveAccessibleName(LABEL);
  });

  it('«Сохранить напоминание о занятии» — PATCH /settings с { lessonReminderMinutes }', async () => {
    const user = userEvent.setup();
    mockSchoolApi();

    renderSchoolScreen();
    const field = await screen.findByLabelText(LABEL);
    await user.clear(field);
    await user.type(field, '45');

    mockSchoolApi(
      makeSettings({ lessonReminderMinutes: 45, updatedAt: '2026-01-02T00:00:00Z' }),
    );
    await user.click(screen.getByRole('button', { name: SAVE }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({ method: 'PATCH', body: { lessonReminderMinutes: 45 } }),
      ),
    );
  });

  it('вне диапазона (1441) — кнопка неактивна, PATCH не уходит', async () => {
    const user = userEvent.setup();
    mockSchoolApi();

    renderSchoolScreen();
    const field = await screen.findByLabelText(LABEL);
    await user.clear(field);
    await user.type(field, '1441');

    expect(screen.getByRole('button', { name: SAVE })).toBeDisabled();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
