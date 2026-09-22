// Страница занятия расписания целиком: загрузка по адресу, поля, дни и
// время, каналы, сохранение и удаление (ADR-0033). Удаление — через
// подтверждение (ConfirmDialog), не с одного касания. Мок сети — по префиксу
// пути (test-support/apiFetchMock.ts).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto, ClassDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import ClassEditorScreen from './ClassEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const SCHEDULE_MARKER = 'Здесь сетка расписания';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '777',
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань',
    groupLabel: 'средняя группа',
    format: 'online',
    zoomLink: 'https://zoom.example/1',
    zoomPassword: '1234',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/schedule" element={<p>{SCHEDULE_MARKER}</p>} />
        <Route path="/schedule/new" element={<ClassEditorScreen />} />
        <Route path="/schedule/:classId" element={<ClassEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockClass(classDto: ClassDto, channels: ChannelDto[] = []) {
  mockApiByPath({
    '/classes/c1': classDto,
    '/channels': channels,
    '/users/teachers': [{ id: 't1', name: 'Дмитрий' }],
  });
}

function callsWithMethod(method: string) {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
}

/** Форма появляется раньше, чем уйдёт запрос учителей (эффект после
 * коммита): отказ, поставленный в очередь сразу после формы, достался бы не
 * сохранению. Ждём имя учителя в списке — значит, запросы монтирования уже
 * ушли. */
async function waitForMounted() {
  await screen.findByRole('option', { name: 'Дмитрий' });
}

describe('ClassEditorScreen — загрузка', () => {
  it('занятие ещё грузится — скелетон, а не пустой экран', () => {
    mockApiByPath({ '/classes/c1': new Promise(() => {}) });

    const { container } = renderAt('/schedule/c1');

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('сбой загрузки — текст ошибки и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/classes/c1': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/channels': [],
      '/users/teachers': [],
    });

    renderAt('/schedule/c1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockClass(makeClass());
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('heading', { name: 'Тайцзицюань' }),
    ).toBeInTheDocument();
  });

  it('открытое по адресу занятие — название в заголовке, поля из ответа сервера', async () => {
    mockClass(makeClass());

    renderAt('/schedule/c1');

    expect(await screen.findByLabelText('Подпись группы')).toHaveValue('средняя группа');
    expect(screen.getByLabelText('Ссылка Zoom')).toHaveValue('https://zoom.example/1');
    expect(screen.getByLabelText('За сколько минут слать ссылку')).toHaveValue('30');
    expect(screen.getByLabelText('День недели')).toHaveValue('2');
  });

  it('/schedule/new — заголовок «Новое занятие в расписании», за занятием сервер не спрашивают', async () => {
    mockApiByPath({ '/channels': [], '/users/teachers': [] });

    renderAt('/schedule/new');

    expect(
      await screen.findByRole('heading', { name: 'Новое занятие в расписании' }),
    ).toBeInTheDocument();
    expect(
      mockedApiFetch.mock.calls.filter(([p]) => String(p).startsWith('/classes')),
    ).toHaveLength(0);
  });
});

describe('ClassEditorScreen — сохранение', () => {
  it('правка полей уходит в PATCH, страница возвращается к расписанию', async () => {
    const user = userEvent.setup();
    mockClass(makeClass());

    renderAt('/schedule/c1');
    await user.clear(await screen.findByLabelText('Подпись группы'));
    await user.type(screen.getByLabelText('Подпись группы'), 'старшая группа');
    await user.selectOptions(screen.getByLabelText('Формат'), 'offline');
    await user.click(screen.getByLabelText('Занятие активно'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const [path, options] = callsWithMethod('PATCH')[0] as [
      string,
      { body: { groupLabel: string; format: string; active: boolean } },
    ];
    expect(path).toBe('/classes/c1');
    expect(options.body).toMatchObject({
      groupLabel: 'старшая группа',
      format: 'offline',
      active: false,
    });
    expect(await screen.findByText(SCHEDULE_MARKER)).toBeInTheDocument();
  });

  it('ввод в поле «Теги» уходит в тело запроса как массив (ADR-0072)', async () => {
    const user = userEvent.setup();
    mockClass(makeClass());

    renderAt('/schedule/c1');
    await user.type(await screen.findByLabelText('Теги'), 'начинающие, медитация');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const options = callsWithMethod('PATCH')[0]?.[1] as { body: { tags: string[] } };
    expect(options.body.tags).toEqual(['начинающие', 'медитация']);
  });

  it('новое занятие — POST с названием и добавленным днём', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/channels': [],
      '/users/teachers': [],
      '/classes': makeClass(),
    });

    renderAt('/schedule/new');
    await user.type(await screen.findByLabelText('Название'), 'Цигун для глаз');
    await user.click(screen.getByRole('button', { name: 'Добавить время' }));
    fireEvent.change(screen.getByLabelText('Время начала'), {
      target: { value: '10:00' },
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    const options = callsWithMethod('POST')[0]?.[1] as {
      body: { title: string; rules: { time: string }[] };
    };
    expect(options.body.title).toBe('Цигун для глаз');
    expect(options.body.rules[0]?.time).toBe('10:00');
    expect(await screen.findByText(SCHEDULE_MARKER)).toBeInTheDocument();
  });

  it('очистка ссылки и пароля Zoom — PATCH с null, минуты уходят числом', async () => {
    const user = userEvent.setup();
    mockClass(makeClass());

    renderAt('/schedule/c1');
    await user.clear(await screen.findByLabelText('Ссылка Zoom'));
    await user.clear(screen.getByLabelText('Пароль Zoom'));
    const lead = screen.getByLabelText('За сколько минут слать ссылку');
    await user.clear(lead);
    await user.type(lead, '15');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const options = callsWithMethod('PATCH')[0]?.[1] as {
      body: { zoomLink: string | null; zoomPassword: string | null; leadMinutes: number };
    };
    expect(options.body).toMatchObject({
      zoomLink: null,
      zoomPassword: null,
      leadMinutes: 15,
    });
  });

  it('без единого дня — «Сохранить» недоступна', async () => {
    mockClass(makeClass({ rules: [] }));

    renderAt('/schedule/c1');

    expect(await screen.findByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.getByText(/хотя бы один день/)).toBeInTheDocument();
  });

  it('ошибка сервера показывается как есть, страница остаётся', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockClass(makeClass());

    renderAt('/schedule/c1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Проверьте поля.', 400, 'invalid_input', ['title: обязательное поле']),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Проверьте поля.');
    expect(alert).toHaveTextContent('title: обязательное поле');
    expect(screen.queryByText(SCHEDULE_MARKER)).not.toBeInTheDocument();
  });

  it('«К расписанию» — ссылка наверху страницы', async () => {
    const user = userEvent.setup();
    mockClass(makeClass());

    renderAt('/schedule/c1');
    await user.click(await screen.findByRole('link', { name: 'К расписанию' }));

    expect(screen.getByText(SCHEDULE_MARKER)).toBeInTheDocument();
  });
});

describe('ClassEditorScreen — дни и время (RuleFields)', () => {
  it('добавленная строка меняется по дню, времени и длительности и уходит в PATCH', async () => {
    const user = userEvent.setup();
    mockClass(makeClass({ rules: [] }));

    renderAt('/schedule/c1');
    await user.click(await screen.findByRole('button', { name: 'Добавить время' }));
    await user.selectOptions(screen.getByLabelText('День недели'), '4');
    fireEvent.change(screen.getByLabelText('Время начала'), {
      target: { value: '20:00' },
    });
    const duration = screen.getByLabelText(/Длительность, минут/);
    await user.clear(duration);
    await user.type(duration, '45');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const options = callsWithMethod('PATCH')[0]?.[1] as {
      body: { rules: { weekday: number; time: string; durationMin: number }[] };
    };
    expect(options.body.rules).toEqual([
      expect.objectContaining({ weekday: 4, time: '20:00', durationMin: 45 }),
    ]);
  });

  it('правка второй строки не трогает первую', async () => {
    const user = userEvent.setup();
    mockClass(makeClass());

    renderAt('/schedule/c1');
    await user.click(await screen.findByRole('button', { name: 'Добавить время' }));
    await user.selectOptions(
      screen.getAllByLabelText('День недели')[1] as HTMLElement,
      '5',
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const options = callsWithMethod('PATCH')[0]?.[1] as {
      body: { rules: { id?: string; weekday: number }[] };
    };
    expect(options.body.rules).toEqual([
      expect.objectContaining({ id: 'r1', weekday: 2 }),
      expect.objectContaining({ weekday: 5 }),
    ]);
  });

  it('«Убрать» снимает строку — «Сохранить» снова недоступна', async () => {
    const user = userEvent.setup();
    mockClass(makeClass());

    renderAt('/schedule/c1');
    await user.click(await screen.findByRole('button', { name: 'Убрать' }));

    expect(screen.queryByLabelText('День недели')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});

describe('ClassEditorScreen — каналы рассылки', () => {
  it('отметка канала уходит в channelIds при сохранении', async () => {
    const user = userEvent.setup();
    mockClass(makeClass({ channelIds: [] }), [makeChannel()]);

    renderAt('/schedule/c1');
    await user.click(await screen.findByLabelText('ВК · ВК школы'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const options = callsWithMethod('PATCH')[0]?.[1] as {
      body: { channelIds: string[] };
    };
    expect(options.body.channelIds).toEqual(['ch1']);
  });

  it('каналы не загрузились — форма открыта, отмечать пока нечего', async () => {
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/classes/c1': makeClass(),
      '/channels': new ApiError('Не удалось загрузить каналы.', 503, 'unknown'),
      '/users/teachers': [],
    });

    renderAt('/schedule/c1');

    expect(await screen.findByLabelText('Название')).toHaveValue('Тайцзицюань');
    expect(screen.getByText(/Каналов пока нет/)).toBeInTheDocument();
  });

  it('каналов нет — подсказка со ссылкой на «Каналы»', async () => {
    mockClass(makeClass());

    renderAt('/schedule/c1');

    expect(await screen.findByText(/Каналов пока нет/)).toBeInTheDocument();
  });
});

describe('ClassEditorScreen — удаление', () => {
  it('«Удалить из расписания» открывает подтверждение, «Отмена» — запроса нет', async () => {
    const user = userEvent.setup();
    mockClass(makeClass());

    renderAt('/schedule/c1');
    await user.click(
      await screen.findByRole('button', { name: 'Удалить из расписания' }),
    );

    expect(
      screen.getByRole('dialog', { name: 'Удалить из расписания?' }),
    ).toBeInTheDocument();
    expect(callsWithMethod('DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(callsWithMethod('DELETE')).toHaveLength(0);
    expect(screen.queryByText(SCHEDULE_MARKER)).not.toBeInTheDocument();
  });

  it('подтверждение — DELETE /classes/c1 и возврат к расписанию', async () => {
    const user = userEvent.setup();
    mockClass(makeClass());

    renderAt('/schedule/c1');
    await user.click(
      await screen.findByRole('button', { name: 'Удалить из расписания' }),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(callsWithMethod('DELETE')).toHaveLength(1));
    expect(callsWithMethod('DELETE')[0]?.[0]).toBe('/classes/c1');
    expect(await screen.findByText(SCHEDULE_MARKER)).toBeInTheDocument();
  });

  it('новое занятие — удалять нечего, кнопки нет', async () => {
    mockApiByPath({ '/channels': [], '/users/teachers': [] });

    renderAt('/schedule/new');
    await screen.findByLabelText('Название');

    expect(
      screen.queryByRole('button', { name: 'Удалить из расписания' }),
    ).not.toBeInTheDocument();
  });

  it('409 при удалении — текст сервера остаётся на странице', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockClass(makeClass());

    renderAt('/schedule/c1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Есть запланированные занятия.', 409, 'conflict'),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить из расписания' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText('Есть запланированные занятия.')).toBeInTheDocument();
    expect(screen.queryByText(SCHEDULE_MARKER)).not.toBeInTheDocument();
  });
});
