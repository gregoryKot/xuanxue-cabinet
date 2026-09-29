// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// broadcasts/BroadcastsScreen.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  DEFAULT_LESSON_REMINDER_MINUTES,
  DEFAULT_PREVIEW_MINUTES,
  type SettingsDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import TemplatesScreen from './TemplatesScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function makeSettings(overrides: Partial<SettingsDto> = {}): SettingsDto {
  return {
    templates: { lesson_link: 'Анонс {название}', recording: 'Запись {название}' },
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

// Отдаёт одно и то же тело и на GET, и на PATCH того же адреса — так же, как
// настоящий контроллер (ADR-0087: PATCH /settings возвращает полный
// SettingsDto, и экран кладёт этот ответ прямо на себя). Раньше перед
// mockByPath стояла заглушка `mockResolvedValueOnce({})` на сам PATCH: ответ
// записи всё равно выбрасывался, и пустое тело ничему не мешало. Теперь оно
// уронило бы экран на `settings.templates`, поэтому заглушки нет — PATCH
// обслуживает тот же полный DTO, что и GET.
function mockByPath(handlers: Record<string, unknown>) {
  mockedApiFetch.mockImplementation((path: string) => {
    for (const [prefix, value] of Object.entries(handlers)) {
      if (path.startsWith(prefix)) {
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
      }
    }
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
}

function renderScreen() {
  return render(<TemplatesScreen />);
}

describe('TemplatesScreen — загрузка', () => {
  it('показывает скелетон, пока настройки не пришли', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('TemplatesScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Попробовать ещё раз»', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({
      '/settings': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/lessons': [],
    });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockByPath({ '/settings': makeSettings(), '/lessons': [] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('heading', { name: 'Анонс занятия' }),
    ).toBeInTheDocument();
  });
});

describe('TemplatesScreen — шапка раздела', () => {
  it('заголовок раздела и объяснение, зачем эти тексты', async () => {
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();

    expect(
      await screen.findByRole('heading', { name: 'Шаблоны', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/посты в канал и напоминание об оплате/)).toBeInTheDocument();
  });
});

describe('TemplatesScreen — сбой загрузки занятий (pr-k3-fixes.md п.2)', () => {
  it('LoadErrorBanner под выбором занятия, «Попробовать ещё раз» перечитывает', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({
      '/settings': makeSettings(),
      '/lessons': new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    expect(screen.getAllByText('Сервис недоступен').length).toBeGreaterThan(0);

    mockByPath({ '/settings': makeSettings(), '/lessons': [] });
    const [retryButton] = screen.getAllByRole('button', { name: 'Попробовать ещё раз' });
    await user.click(retryButton as HTMLElement);

    await waitFor(() =>
      expect(screen.queryByText('Сервис недоступен')).not.toBeInTheDocument(),
    );
  });
});

describe('TemplatesScreen — оба редактора', () => {
  it('показывает анонс и запись с сохранённым текстом', async () => {
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();

    expect(
      await screen.findByRole('heading', { name: 'Анонс занятия' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Пост с записью' })).toBeInTheDocument();
    const textareas = screen.getAllByLabelText<HTMLTextAreaElement>('Текст шаблона');
    expect(textareas.map((el) => el.value)).toEqual([
      'Анонс {название}',
      'Запись {название}',
    ]);
  });

  it('ничего не менялось — «Сохранить» неактивна, запроса нет', async () => {
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('«Сохранить» — PATCH /settings только с изменённым шаблоном (pr-k3-fixes.md п.4)', async () => {
    const user = userEvent.setup();
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const textareas = screen.getAllByLabelText('Текст шаблона');
    await user.type(textareas[0] as HTMLElement, ' — обновлено');

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();

    mockByPath({
      '/settings': makeSettings({ updatedAt: '2026-01-02T00:00:00Z' }),
      '/lessons': [],
    });

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({
          method: 'PATCH',
          body: { templates: { lesson_link: 'Анонс {название} — обновлено' } },
        }),
      ),
    );
  });

  it('невалидный текст — «Сохранить» блокируется, ошибка под своей textarea', async () => {
    const user = userEvent.setup();
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const textareas = screen.getAllByLabelText('Текст шаблона');
    // userEvent.type трактует `{`/`}` как спецсимволы клавиатуры — `{{`/`}}`
    // печатает их буквально (см. документацию user-event по keyboard-синтаксису).
    await user.type(textareas[0] as HTMLElement, ' {{дата}}');

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('{дата}');
  });

  it('сбой сохранения с ключом шаблона в тексте — ошибка под своим редактором', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const textareas = screen.getAllByLabelText('Текст шаблона');
    await user.type(textareas[0] as HTMLElement, ' —');

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(
        'В шаблоне «lesson_link» неизвестные подстановки: {дата}.',
        400,
        'invalid_input',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(
      await screen.findByText(
        'В шаблоне «Анонс занятия» неизвестные подстановки: {дата}.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Анонс занятия' })).toBeInTheDocument();
  });

  it('сбой сохранения без узнаваемого ключа — общая ошибка под формой', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const textareas = screen.getAllByLabelText('Текст шаблона');
    await user.type(textareas[0] as HTMLElement, ' —');

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Сервис недоступен')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Анонс занятия' })).toBeInTheDocument();
  });
});

// Секция «Школа» (В6 аудита, docs/adr/0009-domain-xuanxue-su.md дополнение) —
// та же PATCH-механика, что у шаблонов (useSettings.ts), отдельная кнопка
// «Сохранить адрес» не мешает «Сохранить» у шаблонов рядом (SchoolSiteField.tsx).
describe('TemplatesScreen — адрес сайта школы', () => {
  it('поле пустое, пока учитель не заполнил — «Сохранить адрес» неактивна', async () => {
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    expect(screen.getByLabelText('Адрес сайта школы')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Сохранить адрес' })).toBeDisabled();
  });

  it('сохранённый адрес показан в поле', async () => {
    mockByPath({
      '/settings': makeSettings({ schoolSiteUrl: 'https://xuanxue.su' }),
      '/lessons': [],
    });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    // SchoolSiteField синхронизирует значение своим отдельным эффектом
    // (useSchoolSiteField.ts) — на кадр позже, чем появляется заголовок
    // выше; findByDisplayValue дожидается его, а не проверяет DOM сразу.
    expect(await screen.findByDisplayValue('https://xuanxue.su')).toHaveAccessibleName(
      'Адрес сайта школы',
    );
  });

  it('«Сохранить адрес» — PATCH /settings с { schoolSiteUrl }', async () => {
    const user = userEvent.setup();
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    await user.type(screen.getByLabelText('Адрес сайта школы'), 'https://xuanxue.su');

    mockByPath({
      '/settings': makeSettings({
        schoolSiteUrl: 'https://xuanxue.su',
        updatedAt: '2026-01-02T00:00:00Z',
      }),
      '/lessons': [],
    });

    await user.click(screen.getByRole('button', { name: 'Сохранить адрес' }));

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
    mockByPath({
      '/settings': makeSettings({ schoolSiteUrl: 'https://xuanxue.su' }),
      '/lessons': [],
    });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    // Сохранённое значение стоит в поле с первого рендера секции
    // (useSavedDraft.ts), ждать эффекта синхронизации не нужно.
    const field = screen.getByDisplayValue('https://xuanxue.su');
    await user.clear(field);

    mockByPath({
      '/settings': makeSettings({ updatedAt: '2026-01-02T00:00:00Z' }),
      '/lessons': [],
    });

    await user.click(screen.getByRole('button', { name: 'Сохранить адрес' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({ method: 'PATCH', body: { schoolSiteUrl: null } }),
      ),
    );
  });

  it('сбой сохранения — ошибка сервера видна под полем', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    await user.type(screen.getByLabelText('Адрес сайта школы'), 'http://xuanxue.su');

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(
        'Адрес сайта школы: должна начинаться с https://.',
        400,
        'invalid_input',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Сохранить адрес' }));

    expect(
      await screen.findByText('Адрес сайта школы: должна начинаться с https://.'),
    ).toBeInTheDocument();
  });
});

// Поле «За сколько минут показывать черновик» (ТЗ preview-minutes.md) — та же
// PATCH-механика и та же секция «Школа», что у адреса сайта выше, отдельная
// кнопка «Сохранить время предпросмотра» (SchoolSiteField.tsx).
describe('TemplatesScreen — время предпросмотра', () => {
  it('дефолт школы без документа настроек — поле показывает 5', async () => {
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    expect(
      await screen.findByLabelText('За сколько минут показывать черновик'),
    ).toHaveValue('5');
  });

  it('сохранённое значение показано в поле', async () => {
    mockByPath({
      '/settings': makeSettings({ previewMinutes: 15 }),
      '/lessons': [],
    });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    expect(await screen.findByDisplayValue('15')).toHaveAccessibleName(
      'За сколько минут показывать черновик',
    );
  });

  it('«Сохранить время предпросмотра» — PATCH /settings с { previewMinutes }', async () => {
    const user = userEvent.setup();
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const field = await screen.findByLabelText('За сколько минут показывать черновик');
    await user.clear(field);
    await user.type(field, '10');

    mockByPath({
      '/settings': makeSettings({
        previewMinutes: 10,
        updatedAt: '2026-01-02T00:00:00Z',
      }),
      '/lessons': [],
    });

    await user.click(
      screen.getByRole('button', { name: 'Сохранить время предпросмотра' }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({ method: 'PATCH', body: { previewMinutes: 10 } }),
      ),
    );
  });

  it('вне диапазона (1441) — кнопка неактивна, PATCH не уходит', async () => {
    const user = userEvent.setup();
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const field = await screen.findByLabelText('За сколько минут показывать черновик');
    await user.clear(field);
    await user.type(field, '1441');

    expect(
      screen.getByRole('button', { name: 'Сохранить время предпросмотра' }),
    ).toBeDisabled();
  });
});

// Поле «За сколько минут напомнить ученикам о занятии» (ADR-0135) — та же
// механика, что у времени предпросмотра выше, обобщённая в useMinutesField.ts.
describe('TemplatesScreen — напоминание ученикам о занятии', () => {
  const LABEL = 'За сколько минут напомнить ученикам о занятии';

  it('дефолт школы без документа настроек — поле показывает 60', async () => {
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    // Секция «Школа» рисуется уже с сохранённым значением (useSavedDraft.ts),
    // а не пустой с догрузкой эффектом.
    expect(screen.getByLabelText(LABEL)).toHaveValue('60');
  });

  it('сохранённое значение показано в поле', async () => {
    mockByPath({
      '/settings': makeSettings({ lessonReminderMinutes: 30 }),
      '/lessons': [],
    });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    expect(await screen.findByDisplayValue('30')).toHaveAccessibleName(LABEL);
  });

  it('«Сохранить напоминание о занятии» — PATCH /settings с { lessonReminderMinutes }', async () => {
    const user = userEvent.setup();
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const field = await screen.findByLabelText(LABEL);
    await user.clear(field);
    await user.type(field, '45');

    mockByPath({
      '/settings': makeSettings({
        lessonReminderMinutes: 45,
        updatedAt: '2026-01-02T00:00:00Z',
      }),
      '/lessons': [],
    });

    await user.click(
      screen.getByRole('button', { name: 'Сохранить напоминание о занятии' }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({ method: 'PATCH', body: { lessonReminderMinutes: 45 } }),
      ),
    );
  });

  it('вне диапазона (1441) — кнопка неактивна, PATCH не уходит', async () => {
    const user = userEvent.setup();
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const field = await screen.findByLabelText(LABEL);
    await user.clear(field);
    await user.type(field, '1441');

    expect(
      screen.getByRole('button', { name: 'Сохранить напоминание о занятии' }),
    ).toBeDisabled();
  });
});

// Поле «Кому писать, если человек ещё не в школе» (ADR-0115) — та же
// PATCH-механика, что у адреса сайта и времени предпросмотра выше
// (NewcomerContactField.tsx), отдельная кнопка «Сохранить контакт». В
// отличие от адреса сайта поле нельзя очистить: пустое значение не проходит
// на сервере (UpdateSettingsInput.newcomerContact, shared/src/settings.ts).
describe('TemplatesScreen — контакт для новичков', () => {
  const LABEL = 'Кому писать, если человек ещё не в школе';

  it('дефолт школы без документа настроек — поле показывает контакт по умолчанию', async () => {
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    // Та же гонка, что у «напоминания» выше: под нагрузкой CI ответ /settings
    // приезжал позже, чем находилось поле (web-coverage, PR #442, 2026-09-27).
    await waitFor(() =>
      expect(screen.getByLabelText(LABEL)).toHaveValue(DEFAULT_NEWCOMER_CONTACT),
    );
  });

  it('сохранённый контакт показан в поле', async () => {
    mockByPath({
      '/settings': makeSettings({ newcomerContact: 'Ире @irina_school' }),
      '/lessons': [],
    });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    expect(await screen.findByDisplayValue('Ире @irina_school')).toHaveAccessibleName(
      LABEL,
    );
  });

  it('«Сохранить контакт» — PATCH /settings с { newcomerContact }', async () => {
    const user = userEvent.setup();
    mockByPath({
      '/settings': makeSettings({ newcomerContact: 'Старый контакт' }),
      '/lessons': [],
    });

    renderScreen();
    // До ответа /settings поле уже показывает дефолт школы, а приход настроек
    // перезаписывает его (useSettingsTextField, эффект по updatedAt). Под
    // нагрузкой ответ приезжал между очисткой и набором, и в поле оказывалось
    // «Диме @Dmitry_DeitchИре @irina_school» (снова 2026-09-27, прошлое
    // «ждём значение после набора» причину не убирало). Поэтому сначала ждём
    // значение, которого без ответа сервера быть не может, и только потом
    // печатаем.
    const field = await screen.findByDisplayValue('Старый контакт');
    await user.clear(field);
    await user.type(field, 'Ире @irina_school');
    expect(field).toHaveValue('Ире @irina_school');

    mockByPath({
      '/settings': makeSettings({
        newcomerContact: 'Ире @irina_school',
        paymentContact: DEFAULT_PAYMENT_CONTACT,
        updatedAt: '2026-01-02T00:00:00Z',
      }),
      '/lessons': [],
    });

    await user.click(screen.getByRole('button', { name: 'Сохранить контакт' }));

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
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const field = await screen.findByLabelText(LABEL);
    await user.clear(field);

    expect(screen.getByRole('button', { name: 'Сохранить контакт' })).toBeDisabled();

    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('сбой сохранения — ошибка сервера видна под полем', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const field = await screen.findByLabelText(LABEL);
    await user.clear(field);
    await user.type(field, 'Ире @irina_school');

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Контакт для новичков: заполните поле.', 400, 'invalid_input'),
    );

    await user.click(screen.getByRole('button', { name: 'Сохранить контакт' }));

    expect(
      await screen.findByText('Контакт для новичков: заполните поле.'),
    ).toBeInTheDocument();
  });
});

// Поле «Кому присылать скриншот перевода» (ADR-0159) — сам компонент и его
// сохранение проверены в PaymentContactField.test.tsx; здесь только то, что
// экран «Шаблоны» его рисует и кладёт в него контакт из /settings.
describe('TemplatesScreen — контакт для оплаты', () => {
  it('поле показывает сохранённый контакт бухгалтера', async () => {
    mockByPath({
      '/settings': makeSettings({ paymentContact: 'Кате @katya_books' }),
      '/lessons': [],
    });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    expect(await screen.findByDisplayValue('Кате @katya_books')).toHaveAccessibleName(
      'Кому присылать скриншот перевода',
    );
  });
});
