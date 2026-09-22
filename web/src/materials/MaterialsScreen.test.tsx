// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// exam-items/ExamItemsScreen.test.tsx. Экран грузит материалы и занятия
// расписания (рубрикация строки) — оба пути мокаются mockApiByPath, тем же
// приёмом, что и planning/PlanningScreen.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialDto, TagSummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeClass } from '../test-support/planningFixtures';
import MaterialsScreen from './MaterialsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const NEW_MARKER = 'Здесь страница нового материала';
const EDITOR_MARKER = 'Здесь страница материала';

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    lessonIds: [],
    access: 'all',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTagSummary(overrides: Partial<TagSummaryDto> = {}): TagSummaryDto {
  return {
    tag: 'старшая',
    lessonCount: 0,
    materialCount: 0,
    channelCount: 0,
    examItemCount: 0,
    ...overrides,
  };
}

const TAGS_MARKER = 'Здесь экран тега';

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/materials']}>
      <Routes>
        <Route path="/materials" element={<MaterialsScreen />} />
        <Route path="/materials/new" element={<p>{NEW_MARKER}</p>} />
        <Route path="/materials/tags" element={<p>{TAGS_MARKER}</p>} />
        <Route path="/materials/:materialId" element={<p>{EDITOR_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MaterialsScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('MaterialsScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и кнопка повтора, клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/materials': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({
      '/materials': [makeMaterial()],
      '/classes': [makeClass()],
    });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Ван Пэйшэн — форма 24')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Названия занятий — рубрикация строки (ADR-0047), не условие списка:
  // сбой `/classes` не прячет уже загруженные материалы (MaterialsScreen.tsx).
  it('сбой /classes — материалы на месте, отдельная строка с повтором', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/materials': [makeMaterial({ classIds: ['c1'] })],
      '/classes': new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    renderScreen();

    expect(await screen.findByText('Ван Пэйшэн — форма 24')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    mockApiByPath({
      '/materials': [makeMaterial({ classIds: ['c1'] })],
      '/classes': [makeClass()],
    });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByText('Книга · Тайцзицюань, средняя группа'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('MaterialsScreen — пустой список', () => {
  it('честное объяснение вместо пустого места', async () => {
    mockApiByPath({ '/materials': [], '/classes': [makeClass()] });

    renderScreen();

    expect(
      await screen.findByText(
        'Пока ни одного материала. Добавьте первый — ученики увидят его сразу.',
      ),
    ).toBeInTheDocument();
  });
});

describe('MaterialsScreen — список материалов', () => {
  it('материал с привязанным занятием — карточка ведёт на страницу материала', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/materials': [makeMaterial({ classIds: ['c1'] })],
      '/classes': [makeClass()],
    });

    renderScreen();

    const card = await screen.findByText('Ван Пэйшэн — форма 24');
    expect(screen.getByText('Книга · Тайцзицюань, средняя группа')).toBeInTheDocument();

    await user.click(card);
    expect(await screen.findByText(EDITOR_MARKER)).toBeInTheDocument();
  });

  it('«Новый материал» ведёт на страницу создания', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': [], '/classes': [makeClass()] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Новый материал' }));

    expect(await screen.findByText(NEW_MARKER)).toBeInTheDocument();
  });

  // ADR-0075: вход в подэкран «Теги» — карточка-переход, как «Библиотека» у
  // LessonsScreen.tsx.
  it('карточка «Теги» ведёт на экран тега', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': [], '/classes': [makeClass()] });

    renderScreen();
    await user.click(await screen.findByText('Теги'));

    expect(await screen.findByText(TAGS_MARKER)).toBeInTheDocument();
  });

  it('фильтр по виду — список видов и пустой ответ с фильтром', async () => {
    mockApiByPath({
      '/materials': [makeMaterial({ kind: 'book' })],
      '/classes': [makeClass()],
    });

    renderScreen();
    await screen.findByText('Ван Пэйшэн — форма 24');

    mockApiByPath({ '/materials': [], '/classes': [makeClass()] });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Видео' }));

    expect(
      await screen.findByText('С таким фильтром материалов нет.'),
    ).toBeInTheDocument();
  });
});

describe('MaterialsScreen — пилюли тегов (ADR-0058, useTagOptions.ts)', () => {
  it('тегов у школы нет — строки пилюль нет вовсе', async () => {
    mockApiByPath({
      '/materials': [makeMaterial({ tags: [] })],
      '/classes': [makeClass()],
      '/tags': [],
    });

    renderScreen();
    await screen.findByText('Ван Пэйшэн — форма 24');

    expect(screen.queryByRole('group', { name: 'Теги' })).not.toBeInTheDocument();
  });

  // Тег без материалов дал бы клику пустую библиотеку — сводка школы
  // (GET /api/tags) знает про все пять мест, пилюли фильтра берут только
  // те, у которых materialCount > 0 (useTagOptions.ts, withMaterialsOnly).
  it('пилюля только на тег с материалами — тег без материалов в фильтр не попадает', async () => {
    mockApiByPath({
      '/materials': [makeMaterial({ tags: ['старшая'] })],
      '/classes': [makeClass()],
      '/tags': [
        makeTagSummary({ tag: 'старшая', materialCount: 1 }),
        makeTagSummary({ tag: 'дракон', materialCount: 0, lessonCount: 3 }),
      ],
    });

    renderScreen();
    await screen.findByText('Ван Пэйшэн — форма 24');

    expect(await screen.findByRole('button', { name: 'старшая' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'дракон' })).not.toBeInTheDocument();
  });

  it('клик по пилюле тега уходит в запрос материалов с tag=', async () => {
    mockApiByPath({
      '/materials': [makeMaterial({ tags: ['старшая'] })],
      '/classes': [makeClass()],
      '/tags': [makeTagSummary({ tag: 'старшая', materialCount: 1 })],
    });

    renderScreen();
    await screen.findByText('Ван Пэйшэн — форма 24');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'старшая' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('tag=%D1%81%D1%82%D0%B0%D1%80%D1%88%D0%B0%D1%8F'),
        expect.anything(),
      ),
    );
  });

  it('пустой ответ по тегу — тот же честный текст, что у фильтра по виду', async () => {
    mockApiByPath({
      '/materials': [makeMaterial({ tags: ['старшая'] })],
      '/classes': [makeClass()],
      '/tags': [makeTagSummary({ tag: 'старшая', materialCount: 1 })],
    });

    renderScreen();
    await screen.findByText('Ван Пэйшэн — форма 24');

    mockApiByPath({
      '/materials': [],
      '/classes': [makeClass()],
      '/tags': [makeTagSummary({ tag: 'старшая', materialCount: 1 })],
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'старшая' }));

    expect(
      await screen.findByText('С таким фильтром материалов нет.'),
    ).toBeInTheDocument();
  });
});
