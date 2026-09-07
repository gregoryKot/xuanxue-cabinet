// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// broadcasts/BroadcastsScreen.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsDto } from '@xuanxue/shared';
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
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

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

    mockedApiFetch.mockResolvedValueOnce({});
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
