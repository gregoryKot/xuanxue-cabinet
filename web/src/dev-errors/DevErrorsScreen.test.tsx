import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppErrorDto, AppErrorListDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import DevErrorsScreen from './DevErrorsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
stubViewerTimeZone('Asia/Jerusalem');

afterEach(() => {
  mockedApiFetch.mockReset();
});

function makeError(overrides: Partial<AppErrorDto> = {}): AppErrorDto {
  return {
    id: 'e1',
    source: 'browser',
    kind: 'render',
    path: '/schedule',
    text: 'TypeError: cannot read foo',
    occurredAt: '2026-09-27T11:03:00Z',
    ...overrides,
  };
}

function renderScreen(initialEntries: string[] = ['/dev/errors']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/dev/errors" element={<DevErrorsScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DevErrorsScreen — шапка и число за сутки', () => {
  it('заголовок, объяснение с акцентом и число за сутки', async () => {
    const list: AppErrorListDto = { items: [], last24h: 3 };
    mockedApiFetch.mockResolvedValue(list);

    renderScreen();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Сбои' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/приходит сообщение в Telegram/)).toBeInTheDocument();
    expect(screen.getByText('30 дней').tagName).toBe('STRONG');
    expect(await screen.findByText(/За последние сутки/)).toBeInTheDocument();
    expect(screen.getByText('3 сбоя').tagName).toBe('STRONG');
  });
});

describe('DevErrorsScreen — пустые состояния', () => {
  it('без кода и без записей — «Пока сбоев нет»', async () => {
    mockedApiFetch.mockResolvedValue({ items: [], last24h: 0 });

    renderScreen();

    expect(await screen.findByText('Пока сбоев нет.')).toBeInTheDocument();
  });

  it('код обращения из адреса задан — сразу отправлен запрос с этим кодом', async () => {
    mockedApiFetch.mockResolvedValue({ items: [], last24h: 0 });

    renderScreen(['/dev/errors?requestId=req-9']);

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/dev/errors?requestId=req-9',
        expect.anything(),
      ),
    );
    expect(await screen.findByDisplayValue('req-9')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Сбоя с таким кодом нет. Код обращения — из сообщения в Telegram.',
      ),
    ).toBeInTheDocument();
  });
});

describe('DevErrorsScreen — поиск по коду', () => {
  it('ввод в поле поиска перечитывает список с новым requestId', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue({ items: [], last24h: 0 });
    renderScreen();

    const field = await screen.findByLabelText('Код обращения');
    await user.type(field, 'req-1');

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenLastCalledWith(
        '/dev/errors?requestId=req-1',
        expect.anything(),
      ),
    );
  });
});

describe('DevErrorsScreen — список и «недогруженный код экрана»', () => {
  it('карточки видов render/server — время, вид, источник, текст', async () => {
    const list: AppErrorListDto = {
      items: [
        makeError({ id: 'e1', kind: 'render' }),
        makeError({
          id: 'e2',
          source: 'server',
          kind: 'server',
          method: 'POST',
          path: '/exams',
          text: 'Error: boom',
        }),
      ],
      last24h: 2,
    };
    mockedApiFetch.mockResolvedValue(list);

    renderScreen();

    expect(await screen.findByText(/Экран не нарисовался/)).toBeInTheDocument();
    expect(screen.getByText(/Ошибка сервера/)).toBeInTheDocument();
    expect(screen.getByText('POST /exams')).toBeInTheDocument();
    expect(screen.getByText('Error: boom')).toBeInTheDocument();
    // Вид `chunk` в списке не участвует — кнопки переключения нет.
    expect(
      screen.queryByRole('button', { name: /недогруженный код экрана/ }),
    ).not.toBeInTheDocument();
  });

  it('chunk скрыт по умолчанию, кнопка показывает и обратно прячет', async () => {
    const user = userEvent.setup();
    const list: AppErrorListDto = {
      items: [
        makeError({ id: 'e1', kind: 'render' }),
        makeError({ id: 'e2', kind: 'chunk', text: 'ChunkLoadError' }),
      ],
      last24h: 2,
    };
    mockedApiFetch.mockResolvedValue(list);

    renderScreen();

    await screen.findByText(/Экран не нарисовался/);
    expect(screen.queryByText('ChunkLoadError')).not.toBeInTheDocument();

    const showButton = screen.getByRole('button', {
      name: 'Показать недогруженный код экрана (1)',
    });
    await user.click(showButton);

    expect(await screen.findByText('ChunkLoadError')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Скрыть недогруженный код экрана (1)' }),
    ).toBeInTheDocument();
  });
});

describe('DevErrorsScreen — только скрытый chunk', () => {
  it('пишет «Пока сбоев нет» и оставляет кнопку показать chunk', async () => {
    const list: AppErrorListDto = {
      items: [makeError({ id: 'e1', kind: 'chunk', text: 'ChunkLoadError' })],
      last24h: 0,
    };
    mockedApiFetch.mockResolvedValue(list);

    renderScreen();

    expect(await screen.findByText('Пока сбоев нет.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Показать недогруженный код экрана (1)' }),
    ).toBeInTheDocument();
  });
});

describe('DevErrorsScreen — ошибка загрузки', () => {
  it('баннер с кнопкой повтора, повтор перечитывает список', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    renderScreen();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Не удалось загрузить журнал сбоев. Попробуйте ещё раз.',
    );

    mockedApiFetch.mockResolvedValue({ items: [], last24h: 0 });
    screen.getByRole('button', { name: 'Обновить' }).click();

    expect(await screen.findByText('Пока сбоев нет.')).toBeInTheDocument();
  });
});
