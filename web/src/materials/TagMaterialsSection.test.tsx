// Секция «Материалы» экрана тега (ADR-0075) — тот же фильтр, что у
// «Материалов» (useMaterials.ts), честная пустота, карточка ведёт на
// страницу материала.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeClass } from '../test-support/planningFixtures';
import { TagMaterialsSection } from './TagMaterialsSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const MATERIAL_EDITOR_MARKER = 'Здесь страница материала';

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    lessonIds: [],
    access: 'all',
    tags: ['дракон'],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderSection(tag = 'дракон', classes = [makeClass()]) {
  return render(
    <MemoryRouter initialEntries={['/materials/tags']}>
      <Routes>
        <Route
          path="/materials/tags"
          element={<TagMaterialsSection tag={tag} classes={classes} />}
        />
        <Route path="/materials/:materialId" element={<p>{MATERIAL_EDITOR_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TagMaterialsSection — загрузка', () => {
  it('скелетон, пока список не пришёл', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    const { container } = renderSection();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('TagMaterialsSection — пустой список (честная пустота, ADR-0075)', () => {
  it('нет материалов с этим тегом — текст с именем тега, не «0»', async () => {
    mockApiByPath({ '/materials': [] });

    renderSection('дракон');

    expect(
      await screen.findByText('Материалов с тегом «дракон» пока нет.'),
    ).toBeInTheDocument();
  });
});

describe('TagMaterialsSection — список', () => {
  it('материал рендерится карточкой MaterialCard и ведёт на страницу материала', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': [makeMaterial({ classIds: ['c1'] })] });

    renderSection('дракон', [makeClass({ id: 'c1', title: 'Тайцзицюань, средняя' })]);

    const card = await screen.findByText('Ван Пэйшэн — форма 24');
    expect(screen.getByText('Книга · Тайцзицюань, средняя')).toBeInTheDocument();

    await user.click(card);
    expect(await screen.findByText(MATERIAL_EDITOR_MARKER)).toBeInTheDocument();
  });

  it('запрос — фильтр по тегу, тот же путь, что у useMaterials.ts', async () => {
    mockApiByPath({ '/materials': [] });
    renderSection('дракон');

    await screen.findByText('Материалов с тегом «дракон» пока нет.');

    const [path] = mockedApiFetch.mock.calls[0] as [string];
    expect(path).toContain('tag=');
  });

  it('сбой загрузки — баннер и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({ '/materials': new ApiError('Сервис недоступен', 503, 'unknown') });

    renderSection('дракон');
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({ '/materials': [] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByText('Материалов с тегом «дракон» пока нет.'),
    ).toBeInTheDocument();
  });
});
