// Экран тега (ADR-0075/0078) — сводка школы всегда видна, выбор тега
// открывает обе секции, три честных пустых случая, тег со слэшем переживает
// путь query-параметр → экран → запросы к двум спискам.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialDto, TagSummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeClass, makeLesson } from '../test-support/planningFixtures';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import MaterialsTagsScreen from './MaterialsTagsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const SLASH_TAG = 'ушу/тайцзи';

function makeTagSummary(overrides: Partial<TagSummaryDto> = {}): TagSummaryDto {
  return {
    tag: 'дракон',
    lessonCount: 3,
    materialCount: 2,
    channelCount: 0,
    ...overrides,
  };
}

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

function renderScreen(initialEntries: string[] = ['/materials/tags']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/materials/tags" element={<MaterialsTagsScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MaterialsTagsScreen — сводка тегов школы', () => {
  it('каждый тег со своими двумя числами, разделы ещё не открыты', async () => {
    mockApiByPath({
      '/tags': [
        makeTagSummary({ tag: 'дракон', lessonCount: 3, materialCount: 2 }),
        makeTagSummary({ tag: 'начинающие', lessonCount: 0, materialCount: 5 }),
      ],
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByText('дракон')).toBeInTheDocument();
    expect(screen.getByText('3 занятия · 2 материала')).toBeInTheDocument();
    expect(screen.getByText('начинающие')).toBeInTheDocument();
    expect(screen.getByText('занятий нет · 5 материалов')).toBeInTheDocument();
    expect(screen.queryByText('Даты занятий')).not.toBeInTheDocument();
    expect(screen.queryByText('Материалы')).not.toBeInTheDocument();
  });

  it('пустая база — честное «нет тегов», не «0»', async () => {
    mockApiByPath({ '/tags': [], '/classes': [] });

    renderScreen();

    expect(await screen.findByText('У школы пока нет тегов.')).toBeInTheDocument();
  });

  it('сбой загрузки сводки — баннер и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/tags': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/classes': [],
    });

    renderScreen();
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({ '/tags': [makeTagSummary()], '/classes': [] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('дракон')).toBeInTheDocument();
  });

  // Названия занятий — рубрикация строк лессонов/материалов, не условие
  // экрана: сбой /classes не должен прятать уже загруженный список тегов,
  // только предупреждать отдельной строкой (тот же приём, что у
  // MaterialsScreen.tsx/PlanningScreen.tsx с ошибкой классов).
  it('сбой /classes — список тегов на месте, отдельная строка с повтором', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/tags': [makeTagSummary()],
      '/classes': new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    renderScreen();
    expect(await screen.findByText('дракон')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({ '/tags': [makeTagSummary()], '/classes': [makeClass()] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('MaterialsTagsScreen — выбор тега открывает обе секции', () => {
  it('клик по тегу — «Даты занятий» и «Материалы» с этим тегом', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/tags': [makeTagSummary({ tag: 'дракон' })],
      '/classes': [makeClass({ id: 'c1', title: 'Тайцзицюань, средняя' })],
      '/lessons': [
        makeLesson({ id: 'l1', classId: 'c1', topic: 'Разбор толчка', tags: ['дракон'] }),
      ],
      '/materials': [makeMaterial({ classIds: ['c1'] })],
    });

    renderScreen();
    await user.click(await screen.findByText('дракон'));

    expect(screen.getByRole('heading', { name: 'Даты занятий' })).toBeInTheDocument();
    expect(await screen.findByText(/Разбор толчка/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Материалы' })).toBeInTheDocument();
    expect(await screen.findByText('Ван Пэйшэн — форма 24')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /дракон/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('открыт по ссылке ?tag= сразу — пилюля на карточке привела бы именно сюда', async () => {
    mockApiByPath({
      '/tags': [makeTagSummary({ tag: 'дракон' })],
      '/classes': [makeClass()],
      '/lessons': [makeLesson({ tags: ['дракон'] })],
      '/materials': [makeMaterial()],
    });

    renderScreen([`/materials/tags?tag=${encodeURIComponent('дракон')}`]);

    expect(
      await screen.findByRole('heading', { name: 'Даты занятий' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Ван Пэйшэн — форма 24')).toBeInTheDocument();
  });
});

describe('MaterialsTagsScreen — три честных пустых случая (ADR-0075)', () => {
  it('у тега нет занятий — секция «Материалы» при этом полна', async () => {
    mockApiByPath({
      '/tags': [makeTagSummary({ tag: 'дракон', lessonCount: 0 })],
      '/classes': [makeClass()],
      '/lessons': [],
      '/materials': [makeMaterial()],
    });

    renderScreen([`/materials/tags?tag=${encodeURIComponent('дракон')}`]);

    expect(
      await screen.findByText('Занятий с тегом «дракон» пока нет.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Ван Пэйшэн — форма 24')).toBeInTheDocument();
  });

  it('у тега нет материалов — секция «Даты занятий» при этом полна', async () => {
    mockApiByPath({
      '/tags': [makeTagSummary({ tag: 'дракон', materialCount: 0 })],
      '/classes': [makeClass()],
      '/lessons': [makeLesson({ topic: 'Разбор толчка', tags: ['дракон'] })],
      '/materials': [],
    });

    renderScreen([`/materials/tags?tag=${encodeURIComponent('дракон')}`]);

    expect(await screen.findByText(/Разбор толчка/)).toBeInTheDocument();
    expect(
      await screen.findByText('Материалов с тегом «дракон» пока нет.'),
    ).toBeInTheDocument();
  });
});

describe('MaterialsTagsScreen — тег со слэшем переживает путь целиком (ADR-0078)', () => {
  it('выбор из списка кодирует тег в query и обе секции запрашивают его декодированным', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/tags': [makeTagSummary({ tag: SLASH_TAG, lessonCount: 1, materialCount: 1 })],
      '/classes': [makeClass()],
      '/lessons': [makeLesson({ tags: [SLASH_TAG] })],
      '/materials': [makeMaterial({ tags: [SLASH_TAG] })],
    });

    renderScreen();
    await user.click(await screen.findByText(SLASH_TAG));

    // Обе секции нашли своё содержимое по декодированному тегу — если бы
    // «/» осталась сегментом пути или не раскодировалась обратно, запрос
    // (mockApiByPath, префикс «/lessons»/«/materials») не совпал бы вовсе, и
    // экран показал бы честную пустоту вместо карточек.
    expect(screen.getByRole('heading', { name: 'Даты занятий' })).toBeInTheDocument();
    await screen.findByText('Ван Пэйшэн — форма 24');
    expect(screen.queryByText(/пока нет/)).not.toBeInTheDocument();

    await waitFor(() => {
      const calledWithSlashTag = mockedApiFetch.mock.calls.some(([path]) =>
        path.includes(`tag=${encodeURIComponent(SLASH_TAG)}`),
      );
      expect(calledWithSlashTag).toBe(true);
    });
  });

  it('открыт напрямую по ?tag= с закодированным слэшем — тот же результат', async () => {
    mockApiByPath({
      '/tags': [makeTagSummary({ tag: SLASH_TAG, lessonCount: 1, materialCount: 1 })],
      '/classes': [makeClass()],
      '/lessons': [makeLesson({ tags: [SLASH_TAG] })],
      '/materials': [makeMaterial({ tags: [SLASH_TAG] })],
    });

    renderScreen([`/materials/tags?tag=${encodeURIComponent(SLASH_TAG)}`]);

    const row = await screen.findByRole('button', { name: new RegExp(SLASH_TAG) });
    expect(within(row).getByText(SLASH_TAG)).toBeInTheDocument();
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Ван Пэйшэн — форма 24')).toBeInTheDocument();
  });
});
