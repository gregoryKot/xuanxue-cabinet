// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// exam-items/ExamItemsScreen.test.tsx. Экран грузит материалы, занятия
// расписания (рубрикация строки) и настройки школы (рубильник ADR-0048) —
// все три пути мокаются mockApiByPath, тем же приёмом, что и
// planning/PlanningScreen.test.tsx. Сам рубильник (загрузка, PATCH, ошибка
// сохранения) — MaterialsPaidAccessSection.test.tsx, здесь только чтобы
// /settings не падал «неожиданным путём» и не плодил второй `alert`.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MATERIALS_PAID_ACCESS,
  DEFAULT_PREVIEW_MINUTES,
  type MaterialDto,
  type SettingsDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { makeClass } from '../test-support/planningFixtures';
import MaterialsScreen from './MaterialsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const NEW_MARKER = 'Здесь страница нового материала';
const EDITOR_MARKER = 'Здесь страница материала';

const SETTINGS: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: DEFAULT_PREVIEW_MINUTES,
  materialsPaidAccess: DEFAULT_MATERIALS_PAID_ACCESS,
  updatedAt: '2026-01-01T00:00:00Z',
};

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    access: 'all',
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/materials']}>
      <Routes>
        <Route path="/materials" element={<MaterialsScreen />} />
        <Route path="/materials/new" element={<p>{NEW_MARKER}</p>} />
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
      '/settings': SETTINGS,
      '/materials': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({
      '/settings': SETTINGS,
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
      '/settings': SETTINGS,
      '/materials': [makeMaterial({ classIds: ['c1'] })],
      '/classes': new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    renderScreen();

    expect(await screen.findByText('Ван Пэйшэн — форма 24')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    mockApiByPath({
      '/settings': SETTINGS,
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
    mockApiByPath({ '/settings': SETTINGS, '/materials': [], '/classes': [makeClass()] });

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
      '/settings': SETTINGS,
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
    mockApiByPath({ '/settings': SETTINGS, '/materials': [], '/classes': [makeClass()] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Новый материал' }));

    expect(await screen.findByText(NEW_MARKER)).toBeInTheDocument();
  });

  it('фильтр по виду — список видов и пустой ответ с фильтром', async () => {
    mockApiByPath({
      '/settings': SETTINGS,
      '/materials': [makeMaterial({ kind: 'book' })],
      '/classes': [makeClass()],
    });

    renderScreen();
    await screen.findByText('Ван Пэйшэн — форма 24');

    mockApiByPath({ '/settings': SETTINGS, '/materials': [], '/classes': [makeClass()] });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Видео' }));

    expect(
      await screen.findByText('С таким фильтром материалов нет.'),
    ).toBeInTheDocument();
  });
});
