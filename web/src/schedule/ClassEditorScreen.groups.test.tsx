// Группы школы на странице занятия (ADR-0193): галочки, «Новая группа» прямо
// под ними и сбой загрузки списка. Отдельный файл — ClassEditorScreen.test.tsx
// уже за 300 строк (CLAUDE.md «Файлы»). Сеть — mockApiByPath по пути запроса:
// ответ на действие ставится вторым вызовом, не очередью `…Once` (ADR-0116).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ClassDto, GroupDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
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

function makeGroup(id: string, name: string): GroupDto {
  return {
    id,
    name,
    classCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const BEGINNERS = makeGroup('g1', 'Начинающие');
const MIDDLE = makeGroup('g2', 'Средние');

const CLASS: ClassDto = {
  id: 'c1',
  title: 'Тайцзицюань',
  groupLabel: 'Начинающие',
  groupIds: ['g1'],
  format: 'online',
  rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
  tz: 'Asia/Jerusalem',
  channelIds: [],
  leadMinutes: 30,
  active: true,
  tags: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/** `groups` — ответ на любой запрос по `/groups`: список при открытии страницы
 * или один из ответов на запись (путь у GET и POST один). */
function mockEditor(groups: unknown) {
  mockApiByPath({
    '/classes/c1': CLASS,
    '/channels': [],
    '/groups': groups,
    '/users/teachers': [],
  });
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/schedule/c1']}>
      <Routes>
        <Route path="/schedule" element={<p>Здесь сетка расписания</p>} />
        <Route path="/schedule/:classId" element={<ClassEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function callsWithMethod(method: string) {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
}

describe('ClassEditorScreen — группы школы', () => {
  it('занятие без групп в школе: подсказка, что групп нет, и поле «Новая группа»', async () => {
    mockEditor([]);

    renderEditor();

    expect(await screen.findByText(/Групп пока нет/)).toBeInTheDocument();
    expect(screen.getByLabelText('Новая группа')).toBeInTheDocument();
  });

  it('галочки по группам школы, отмеченные — группы занятия; снятие уходит в PATCH', async () => {
    const user = userEvent.setup();
    mockEditor([BEGINNERS, MIDDLE]);

    renderEditor();
    expect(await screen.findByLabelText('Начинающие')).toBeChecked();
    await user.click(screen.getByLabelText('Начинающие'));
    await user.click(screen.getByLabelText('Средние'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const options = callsWithMethod('PATCH')[0]?.[1] as {
      body: { groupIds: string[]; groupLabel?: string };
    };
    expect(options.body.groupIds).toEqual(['g2']);
    expect(options.body).not.toHaveProperty('groupLabel');
  });

  it('«Добавить» заводит группу POST-ом и сразу отмечает её; поле очищается', async () => {
    const user = userEvent.setup();
    mockEditor([BEGINNERS]);

    renderEditor();
    await screen.findByLabelText('Начинающие');
    // Ответ на действие — отдельным вызовом, путь POST тот же, что у списка.
    mockEditor(makeGroup('g9', 'Вечерние'));
    await user.type(screen.getByLabelText('Новая группа'), '  Вечерние ');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByLabelText('Вечерние')).toBeChecked();
    expect(screen.getByLabelText('Новая группа')).toHaveValue('');
    const [path, options] = callsWithMethod('POST')[0] as [
      string,
      { body: { name: string } },
    ];
    expect(path).toBe('/groups');
    expect(options.body).toEqual({ name: 'Вечерние' });

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const patch = callsWithMethod('PATCH')[0]?.[1] as { body: { groupIds: string[] } };
    expect(patch.body.groupIds).toEqual(['g1', 'g9']);
  });

  it('Enter в поле «Новая группа» добавляет группу, а не сохраняет всё занятие', async () => {
    const user = userEvent.setup();
    mockEditor([BEGINNERS]);

    renderEditor();
    await screen.findByLabelText('Начинающие');
    mockEditor(makeGroup('g9', 'Вечерние'));
    await user.type(screen.getByLabelText('Новая группа'), 'Вечерние{Enter}');

    expect(await screen.findByLabelText('Вечерние')).toBeChecked();
    expect(callsWithMethod('PATCH')).toHaveLength(0);
  });

  it('название уже занято — текст сервера под полем, отметки не меняются', async () => {
    const user = userEvent.setup();
    mockEditor([BEGINNERS]);

    renderEditor();
    await screen.findByLabelText('Начинающие');
    mockEditor(
      new ApiError(
        'Группа «Начинающие» уже есть. Отметьте её в списке.',
        409,
        'conflict',
      ),
    );
    await user.type(screen.getByLabelText('Новая группа'), 'начинающие');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Группа «Начинающие» уже есть',
    );
    expect(screen.getByLabelText('Начинающие')).toBeChecked();
    expect(screen.getByLabelText('Новая группа')).toHaveValue('начинающие');
  });

  it('пустое название — подсказка, запрос не уходит', async () => {
    const user = userEvent.setup();
    mockEditor([BEGINNERS]);

    renderEditor();
    await screen.findByLabelText('Начинающие');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Впишите название группы.',
    );
    expect(callsWithMethod('POST')).toHaveLength(0);
  });

  it('список групп не загрузился — форма открыта, у списка баннер с повтором', async () => {
    const user = userEvent.setup();
    mockEditor(
      new ApiError('Не удалось загрузить группы. Попробуйте ещё раз.', 503, 'unknown'),
    );

    renderEditor();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить группы',
    );
    expect(screen.getByLabelText('Название')).toHaveValue('Тайцзицюань');

    mockEditor([BEGINNERS, MIDDLE]);
    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    expect(await screen.findByLabelText('Средние')).not.toBeChecked();
    // Повтор не прячет форму скелетоном: название на месте.
    expect(screen.getByLabelText('Название')).toHaveValue('Тайцзицюань');
  });
});
