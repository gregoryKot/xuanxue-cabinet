// Страница события школы целиком (ADR-0177): создание, правка, удаление,
// ошибки формы и сервера. События приходят общим списком GET /events (одиночного
// GET нет) — экран находит нужное по адресу. Сеть — mockApiByPath по префиксу
// пути, ответы на действия ставятся по пути, не очередью `…Once` (ADR-0116).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeSchoolEvent } from '../test-support/schoolEventFixture';
import { fromDatetimeLocalValue } from '../lib/formatDate';
import EventEditorScreen from './EventEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const BOARD_MARKER = 'Здесь доска';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/board" element={<p>{BOARD_MARKER}</p>} />
        <Route path="/events/new" element={<EventEditorScreen />} />
        <Route path="/events/:eventId" element={<EventEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function callsWithMethod(method: string) {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
}

function bodyOf(call: unknown[] | undefined): unknown {
  return (call?.[1] as { body?: unknown } | undefined)?.body;
}

async function typeInto(label: string, text: string) {
  const user = userEvent.setup();
  const field = await screen.findByLabelText(label);
  await user.clear(field);
  await user.type(field, text);
}

const EXISTING = makeSchoolEvent({
  id: 'ev1',
  title: 'Ретрит в Галилее',
  startsAt: '2030-11-14T08:00:00.000Z',
  endsAt: '2030-11-16T15:00:00.000Z',
  place: 'Кибуц Амиад',
  description: 'Взять **спальник**',
});

describe('EventEditorScreen — создание', () => {
  it('пустая форма, запрос за событием не уходит; подсказки говорят, что писать', async () => {
    mockApiByPath({});
    renderAt('/events/new');

    expect(
      await screen.findByRole('heading', { name: 'Новое событие' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Для ретрита на несколько дней')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить событие' })).toBeNull();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('«Сохранить» отправляет POST с телом в ISO UTC и уводит на доску', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/events': makeSchoolEvent() });
    renderAt('/events/new');

    await typeInto('Название', 'Ретрит в Галилее');
    await typeInto('Начало', '2030-11-14T10:00');
    await typeInto('Конец', '2030-11-16T15:00');
    await typeInto('Место', 'Кибуц Амиад');
    await typeInto('Подробности', 'Взять спальник');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(BOARD_MARKER)).toBeInTheDocument();
    const [post] = callsWithMethod('POST');
    expect(post?.[0]).toBe('/events');
    expect(bodyOf(post)).toEqual({
      title: 'Ретрит в Галилее',
      startsAt: fromDatetimeLocalValue('2030-11-14T10:00'),
      endsAt: fromDatetimeLocalValue('2030-11-16T15:00'),
      place: 'Кибуц Амиад',
      description: 'Взять спальник',
    });
  });

  it('без названия — ошибка под полем, запрос не уходит', async () => {
    const user = userEvent.setup();
    mockApiByPath({});
    renderAt('/events/new');

    await typeInto('Начало', '2030-11-14T10:00');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Впишите название события.',
    );
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('без начала — ошибка под полем «Начало», запрос не уходит', async () => {
    const user = userEvent.setup();
    mockApiByPath({});
    renderAt('/events/new');

    await typeInto('Название', 'Ретрит');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Укажите, когда событие начинается.',
    );
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('конец раньше начала — ошибка у конца, запрос не уходит', async () => {
    const user = userEvent.setup();
    mockApiByPath({});
    renderAt('/events/new');

    await typeInto('Название', 'Ретрит');
    await typeInto('Начало', '2030-11-14T10:00');
    await typeInto('Конец', '2030-11-13T10:00');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
    );
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('ответ сервера с ошибкой — текст на странице, остаёмся на форме', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockRejectedValue(
      new ApiError('Название слишком длинное.', 400, 'invalid_input'),
    );
    renderAt('/events/new');

    await typeInto('Название', 'Ретрит');
    await typeInto('Начало', '2030-11-14T10:00');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(/Название слишком длинное/)).toBeInTheDocument();
    expect(screen.queryByText(BOARD_MARKER)).toBeNull();
  });
});

describe('EventEditorScreen — правка', () => {
  it('форма заполнена событием из списка, заголовок — его название', async () => {
    mockApiByPath({ '/events': [makeSchoolEvent({ id: 'other' }), EXISTING] });
    renderAt('/events/ev1');

    expect(
      await screen.findByRole('heading', { name: 'Ретрит в Галилее' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue('Ретрит в Галилее');
    expect(screen.getByLabelText('Место')).toHaveValue('Кибуц Амиад');
    expect(screen.getByLabelText('Подробности')).toHaveValue('Взять **спальник**');
    expect(screen.getByLabelText('Конец')).not.toHaveValue('');
  });

  it('очистили место — PATCH уходит с place: null и ведёт на доску', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/events/ev1': { ...EXISTING, place: undefined },
      '/events': [EXISTING],
    });
    renderAt('/events/ev1');

    await user.clear(await screen.findByLabelText('Место'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(BOARD_MARKER)).toBeInTheDocument();
    const [patch] = callsWithMethod('PATCH');
    expect(patch?.[0]).toBe('/events/ev1');
    expect(bodyOf(patch)).toMatchObject({
      title: 'Ретрит в Галилее',
      place: null,
      description: 'Взять **спальник**',
      endsAt: EXISTING.endsAt,
    });
  });

  it('очистили конец — endsAt: null', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/events/ev1': EXISTING, '/events': [EXISTING] });
    renderAt('/events/ev1');

    await user.clear(await screen.findByLabelText('Конец'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await screen.findByText(BOARD_MARKER);
    expect(bodyOf(callsWithMethod('PATCH')[0])).toMatchObject({ endsAt: null });
  });

  it('удаление идёт через подтверждение: «Отмена» не удаляет, «Удалить» удаляет и уводит на доску', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/events/ev1': undefined, '/events': [EXISTING] });
    renderAt('/events/ev1');

    await user.click(await screen.findByRole('button', { name: 'Удалить событие' }));
    expect(await screen.findByText('Удалить событие?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(callsWithMethod('DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Удалить событие' }));
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText(BOARD_MARKER)).toBeInTheDocument();
    expect(callsWithMethod('DELETE')[0]?.[0]).toBe('/events/ev1');
  });

  it('события нет в списке — понятный текст и «Попробовать ещё раз»', async () => {
    mockApiByPath({ '/events': [makeSchoolEvent({ id: 'other' })] });
    renderAt('/events/ev1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Это событие уже удалено. Вернитесь на главную.',
    );
    expect(
      screen.getByRole('button', { name: 'Попробовать ещё раз' }),
    ).toBeInTheDocument();
  });

  it('список не загрузился — баннер, повтор перечитывает список', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/events': new TypeError('Failed to fetch') });
    renderAt('/events/ev1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось открыть событие. Попробуйте ещё раз.',
    );

    mockApiByPath({ '/events': [EXISTING] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));
    await waitFor(() => expect(screen.getByLabelText('Название')).toBeInTheDocument());
  });
});
