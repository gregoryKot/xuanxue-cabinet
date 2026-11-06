// Страница «Тема недели» (ADR-0197): начальные галочки, запись одним запросом,
// проверка до запроса и ошибка сервера. Сеть — mockApiByPath, без очередей.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { mockApiByPath } from '../test-support/apiFetchMock';
import { makeClass, makeLesson } from '../test-support/planningFixtures';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import WeekTopicScreen from './WeekTopicScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const PLANNING_MARKER = 'Здесь список занятий';
const LESSONS = [
  makeLesson({ id: 'a', startsAt: '2026-11-10T17:00:00.000Z' }),
  makeLesson({ id: 'b', startsAt: '2026-11-11T17:00:00.000Z' }),
  // Другая неделя — на странице её быть не должно.
  makeLesson({ id: 'z', startsAt: '2026-11-17T17:00:00.000Z' }),
];

stubViewerTimeZone('Asia/Jerusalem');

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/planning/week-topic/2026-11-08']}>
      <Routes>
        <Route path="/planning/week-topic/:weekKey" element={<WeekTopicScreen />} />
        <Route path="/schedule" element={<p>{PLANNING_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function stubLoad(extra: Record<string, unknown> = {}) {
  mockApiByPath({
    '/lessons/topic': [],
    '/lessons': LESSONS,
    '/classes': [makeClass()],
    ...extra,
  });
}

function lessonsListCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path.split('?')[0] === '/lessons');
}

function topicCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path.startsWith('/lessons/topic'));
}

describe('WeekTopicScreen', () => {
  it('подсказки у галочек: отменённое не отмечено и помечено, своя тема — «Сейчас: …», класс не найден — «—»', async () => {
    stubLoad({
      '/lessons': [
        makeLesson({
          id: 'a',
          startsAt: '2026-11-10T17:00:00.000Z',
          status: 'cancelled',
        }),
        makeLesson({
          id: 'b',
          startsAt: '2026-11-11T17:00:00.000Z',
          topic: 'Шаги назад',
        }),
        makeLesson({
          id: 'c',
          startsAt: '2026-11-12T17:00:00.000Z',
          classId: 'нет-такого',
        }),
      ],
    });
    renderScreen();
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    // Тема недели уже есть («Шаги назад» у одного) — отмечено только занятие с ней.
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([
      false,
      true,
      false,
    ]);
    expect(screen.getByLabelText('Тема')).toHaveValue('Шаги назад');
    expect(screen.getByText('отменено')).toBeInTheDocument();
    expect(screen.getByText('Сейчас: Шаги назад')).toBeInTheDocument();
    expect(screen.getByText(/· —$/)).toBeInTheDocument();
  });

  it('сбой списка — текст ошибки, «Попробовать ещё раз» повторяет запрос занятий', async () => {
    const user = userEvent.setup();
    stubLoad({ '/lessons': new ApiError('Список не пришёл.', 500, 'internal_error') });
    renderScreen();
    expect(await screen.findByText('Список не пришёл.')).toBeInTheDocument();
    const before = lessonsListCalls().length;

    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    await waitFor(() => expect(lessonsListCalls().length).toBeGreaterThan(before));
  });

  it('занятия недели отмечены, поле пустое, чужой недели в списке нет', async () => {
    stubLoad();
    renderScreen();
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    boxes.forEach((box) => expect(box).toBeChecked());
    expect(screen.getByLabelText('Тема')).toHaveValue('');
  });

  it('тема и «Сохранить» — один запрос со всеми отмеченными и переход на «Занятия»', async () => {
    const user = userEvent.setup();
    stubLoad();
    renderScreen();
    await user.type(await screen.findByLabelText('Тема'), 'Шаги назад');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(PLANNING_MARKER)).toBeInTheDocument();
    const [call] = topicCalls();
    expect(call?.[0]).toBe('/lessons/topic');
    expect((call?.[1] as { body: unknown }).body).toEqual({
      topic: 'Шаги назад',
      lessonIds: ['a', 'b'],
    });
  });

  it('без отмеченных занятий запроса нет, у списка ошибка', async () => {
    const user = userEvent.setup();
    stubLoad();
    renderScreen();
    for (const box of await screen.findAllByRole('checkbox')) await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Отметьте хотя бы одно занятие.')).toBeInTheDocument();
    expect(topicCalls()).toHaveLength(0);
  });

  it('ошибка сервера — текст на экране, со страницы не уходим', async () => {
    const user = userEvent.setup();
    stubLoad({
      '/lessons/topic': new ApiError('Сервер не справился.', 500, 'internal_error'),
    });
    renderScreen();
    await user.type(await screen.findByLabelText('Тема'), 'Тема');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Сервер не справился.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(PLANNING_MARKER)).toBeNull());
  });
});
