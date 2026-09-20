// Страница занятия целиком: загрузка по адресу, поля, отмена и возврат в
// расписание, «Отправить ссылку сейчас», записи (ADR-0033). Мок сети — по
// префиксу пути (test-support/apiFetchMock.ts); `/lessons/l1/recording`
// стоит раньше `/lessons/l1`, mockApiByPath матчит первым подходящим
// префиксом.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ClassDto, LessonDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import LessonEditorScreen from './LessonEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const LIST_MARKER = 'Здесь список занятий';

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань, средняя группа',
    groupLabel: '',
    format: 'online',
    rules: [],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    topic: 'Пятое занятие цикла',
    status: 'scheduled',
    tags: [],
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/planning" element={<p>{LIST_MARKER}</p>} />
        <Route path="/planning/new" element={<LessonEditorScreen />} />
        <Route path="/planning/:lessonId" element={<LessonEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Занятие, расписание и учителя — три запроса монтирования. Мок отвечает
 * на все: тест, которому нужен свой ответ, передаёт его вместе с ними. */
function mockLesson(lesson: LessonDto, classes: ClassDto[] = [makeClass()]) {
  mockApiByPath({
    '/lessons/l1': lesson,
    '/classes': classes,
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
 * сохранению. Ждём имя учителя в списке — значит, все запросы монтирования
 * уже ушли. */
async function waitForMounted() {
  await screen.findByRole('option', { name: 'Дмитрий' });
}

describe('LessonEditorScreen — загрузка', () => {
  it('занятие ещё грузится — скелетон, а не пустой экран', () => {
    mockApiByPath({ '/lessons/l1': new Promise(() => {}) });

    const { container } = renderAt('/planning/l1');

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('сбой загрузки занятия — текст ошибки и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/lessons/l1': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/classes': [makeClass()],
      '/users/teachers': [],
    });

    renderAt('/planning/l1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockLesson(makeLesson());
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByLabelText('Тема')).toHaveValue('Пятое занятие цикла');
  });

  it('открытое по адресу занятие — дата в заголовке, поля из ответа сервера', async () => {
    mockLesson(makeLesson({ note: 'Взять плейлист' }));

    renderAt('/planning/l1');

    // Заголовок — день, число и время в поясе браузера (formatDateTime):
    // проверяем форму строки, а не конкретный час — CI гоняет vitest ещё и
    // под TZ=Australia/Sydney (CLAUDE.md «Время»).
    expect(
      await screen.findByRole('heading', {
        name: /^(Вс|Пн|Вт|Ср|Чт|Пт|Сб), \d+ \S+, \d{2}:\d{2}$/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Длительность, минут')).toHaveValue('60');
    expect(screen.getByLabelText('Заметка')).toHaveValue('Взять плейлист');
  });

  it('/planning/new — заголовок «Разовое занятие», за занятием сервер не спрашивают', async () => {
    mockApiByPath({ '/classes': [makeClass()], '/users/teachers': [] });

    renderAt('/planning/new');

    expect(
      await screen.findByRole('heading', { name: 'Разовое занятие' }),
    ).toBeInTheDocument();
    expect(
      mockedApiFetch.mock.calls.filter(([p]) => String(p).startsWith('/lessons')),
    ).toHaveLength(0);
  });

  it('/planning/new без занятий в расписании — объяснение и ссылка, без «Сохранить»', async () => {
    mockApiByPath({ '/classes': [], '/users/teachers': [] });

    renderAt('/planning/new');

    expect(
      await screen.findByText(/Сначала добавьте занятие в расписании/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Расписание/ })).toHaveAttribute(
      'href',
      '/schedule',
    );
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  });
});

describe('LessonEditorScreen — сохранение', () => {
  it('правка темы уходит в PATCH, страница возвращается к списку', async () => {
    const user = userEvent.setup();
    mockLesson(makeLesson());

    renderAt('/planning/l1');
    await user.clear(await screen.findByLabelText('Тема'));
    await user.type(screen.getByLabelText('Тема'), 'Шаги назад');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const [path, options] = callsWithMethod('PATCH')[0] as [
      string,
      { body: { topic: string } },
    ];
    expect(path).toBe('/lessons/l1');
    expect(options.body.topic).toBe('Шаги назад');
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('новое занятие — POST с выбранным занятием расписания и датой', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/classes': [makeClass(), makeClass({ id: 'c2', title: 'Цигун для глаз' })],
      '/users/teachers': [],
      '/lessons': makeLesson(),
    });

    renderAt('/planning/new');
    await user.selectOptions(await screen.findByLabelText('Занятие расписания'), 'c2');
    await user.type(screen.getByLabelText('Дата и время начала'), '2026-09-08T19:00');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    const options = callsWithMethod('POST')[0]?.[1] as { body: { classId: string } };
    expect(options.body.classId).toBe('c2');
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('длительность, ссылка и пароль Zoom, заметка и ведущий уходят в PATCH', async () => {
    const user = userEvent.setup();
    mockLesson(makeLesson());

    renderAt('/planning/l1');
    const duration = await screen.findByLabelText('Длительность, минут');
    await user.clear(duration);
    await user.type(duration, '90');
    await user.type(
      screen.getByLabelText('Ссылка Zoom на это занятие'),
      'https://zoom.example/once',
    );
    await user.type(screen.getByLabelText('Пароль Zoom на это занятие'), '9999');
    await user.type(screen.getByLabelText('Заметка'), 'Взять новый плейлист');
    await user.selectOptions(screen.getByLabelText('Ведущий'), 't1');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const options = callsWithMethod('PATCH')[0]?.[1] as {
      body: {
        durationMin: number;
        zoomLinkOverride: string;
        zoomPasswordOverride: string;
        note: string;
        leaderId: string;
      };
    };
    expect(options.body).toMatchObject({
      durationMin: 90,
      zoomLinkOverride: 'https://zoom.example/once',
      zoomPasswordOverride: '9999',
      note: 'Взять новый плейлист',
      leaderId: 't1',
    });
  });

  it('пустая дата у нового занятия — ошибка формы, запроса нет', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': [makeClass()], '/users/teachers': [] });

    renderAt('/planning/new');
    await user.click(await screen.findByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(/дату и время/)).toBeInTheDocument();
    expect(callsWithMethod('POST')).toHaveLength(0);
  });

  it('ошибка сервера показывается как есть, страница остаётся', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockLesson(makeLesson());

    renderAt('/planning/l1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Проверьте поля.', 400, 'invalid_input'),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Проверьте поля.')).toBeInTheDocument();
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });

  it('«К занятиям» — ссылка наверху страницы', async () => {
    const user = userEvent.setup();
    mockLesson(makeLesson());

    renderAt('/planning/l1');
    await user.click(await screen.findByRole('link', { name: 'К занятиям' }));

    expect(screen.getByText(LIST_MARKER)).toBeInTheDocument();
  });
});

describe('LessonEditorScreen — отмена и возврат в расписание', () => {
  it('«Отменить занятие» спрашивает подтверждение, отмена в диалоге ничего не шлёт', async () => {
    const user = userEvent.setup();
    mockLesson(makeLesson());

    renderAt('/planning/l1');
    await user.click(await screen.findByRole('button', { name: 'Отменить занятие' }));

    expect(screen.getByRole('dialog', { name: 'Отменить занятие?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(callsWithMethod('PATCH')).toHaveLength(0);
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });

  it('подтверждение — PATCH status=cancelled и возврат к списку', async () => {
    const user = userEvent.setup();
    mockLesson(makeLesson());

    renderAt('/planning/l1');
    await user.click(await screen.findByRole('button', { name: 'Отменить занятие' }));
    await user.click(
      screen.getAllByRole('button', { name: 'Отменить занятие' })[1] as HTMLElement,
    );

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const options = callsWithMethod('PATCH')[0]?.[1] as { body: { status: string } };
    expect(options.body.status).toBe('cancelled');
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('сбой при отмене — текст сервера остаётся на странице', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockLesson(makeLesson());

    renderAt('/planning/l1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Занятие уже отменено.', 409, 'conflict'),
    );
    await user.click(screen.getByRole('button', { name: 'Отменить занятие' }));
    await user.click(
      screen.getAllByRole('button', { name: 'Отменить занятие' })[1] as HTMLElement,
    );

    expect(await screen.findByText('Занятие уже отменено.')).toBeInTheDocument();
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });

  it('отменённое занятие — «Вернуть в расписание» шлёт PATCH status=scheduled', async () => {
    const user = userEvent.setup();
    mockLesson(makeLesson({ status: 'cancelled' }));

    renderAt('/planning/l1');

    expect(
      await screen.findByRole('button', { name: 'Вернуть в расписание' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Отменить занятие' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Вернуть в расписание' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const options = callsWithMethod('PATCH')[0]?.[1] as { body: { status: string } };
    expect(options.body.status).toBe('scheduled');
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('сбой возврата в расписание — страница остаётся с текстом сервера', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockLesson(makeLesson({ status: 'cancelled' }));

    renderAt('/planning/l1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Занятие уже идёт.', 409, 'conflict'),
    );
    await user.click(screen.getByRole('button', { name: 'Вернуть в расписание' }));

    expect(await screen.findByText('Занятие уже идёт.')).toBeInTheDocument();
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });
});

describe('LessonEditorScreen — ссылка сейчас и записи', () => {
  it('«Отправить ссылку сейчас» после подтверждения шлёт POST send-now', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/lessons/l1/send-now': { id: 'b1' },
      '/lessons/l1': makeLesson(),
      '/classes': [makeClass()],
      '/users/teachers': [{ id: 't1', name: 'Дмитрий' }],
    });

    renderAt('/planning/l1');
    await user.click(
      await screen.findByRole('button', { name: 'Отправить ссылку сейчас' }),
    );
    await user.click(screen.getByRole('button', { name: 'Отправить сейчас' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/lessons/l1/send-now',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      await screen.findByText('Ссылка уйдёт в ближайшую минуту'),
    ).toBeInTheDocument();
  });

  it('добавленная запись сразу видна в списке записей', async () => {
    const user = userEvent.setup();
    const withRecording = makeLesson({
      recordings: [{ id: 'r1', title: 'Часть 1', url: 'https://youtu.be/1' }],
    });
    mockApiByPath({
      '/lessons/l1/recording': withRecording,
      '/lessons/l1': makeLesson(),
      '/classes': [makeClass()],
      '/users/teachers': [{ id: 't1', name: 'Дмитрий' }],
    });

    renderAt('/planning/l1');
    await user.type(
      await screen.findByLabelText('Ссылка на запись'),
      'https://youtu.be/1',
    );
    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    expect(await screen.findByRole('link', { name: 'Часть 1' })).toHaveAttribute(
      'href',
      'https://youtu.be/1',
    );
  });

  it('новое занятие — ни записей, ни отправки ссылки: отправлять пока нечего', async () => {
    mockApiByPath({ '/classes': [makeClass()], '/users/teachers': [] });

    renderAt('/planning/new');
    await screen.findByLabelText('Тема');

    expect(screen.queryByText('Запись')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Отправить ссылку сейчас' }),
    ).not.toBeInTheDocument();
  });

  it('отменённое занятие — отправлять ссылку некуда, кнопки нет', async () => {
    mockLesson(makeLesson({ status: 'cancelled' }));

    renderAt('/planning/l1');
    await screen.findByLabelText('Тема');

    expect(
      screen.queryByRole('button', { name: 'Отправить ссылку сейчас' }),
    ).not.toBeInTheDocument();
  });
});
