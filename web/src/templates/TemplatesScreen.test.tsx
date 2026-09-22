// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// broadcasts/BroadcastsScreen.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWCOMER_CONTACT,
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
    newcomerContact: DEFAULT_NEWCOMER_CONTACT,
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
      await screen.findByRole('heading', { name: 'Шаблоны постов', level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Рассылка собирает пост из двух шаблонов/),
    ).toBeInTheDocument();
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

    // SchoolSiteField синхронизирует поле своим эффектом на кадр позже
    // заголовка выше (useSchoolSiteField.ts) — без ожидания «Очистить» могло
    // бы сработать раньше синхронизации, и эффект тут же вернул бы старое
    // значение обратно поверх правки учителя.
    const field = await screen.findByDisplayValue('https://xuanxue.su');
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

    expect(await screen.findByLabelText(LABEL)).toHaveValue(DEFAULT_NEWCOMER_CONTACT);
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
    mockByPath({ '/settings': makeSettings(), '/lessons': [] });

    renderScreen();
    await screen.findByRole('heading', { name: 'Анонс занятия' });

    const field = await screen.findByLabelText(LABEL);
    await user.clear(field);
    await user.type(field, 'Ире @irina_school');
    // Поле предзаполнено дефолтом школы — в отличие от «Адреса сайта», где
    // набирают в пустое. Под нагрузкой CI очистка и набор успевают разъехаться,
    // и в PATCH уходило «Диме @Dmitry_DeitchИре @irina_school»: userEvent
    // считает новое значение по DOM, а контролируемый input к этому моменту
    // ещё не получил пустую строку. Ждём значение явно, а не надеемся на
    // порядок обновлений.
    expect(field).toHaveValue('Ире @irina_school');

    mockByPath({
      '/settings': makeSettings({
        newcomerContact: 'Ире @irina_school',
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
