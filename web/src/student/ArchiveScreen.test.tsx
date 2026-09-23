// Экран «Записи занятий» — состояния загрузки списка (ТЗ docs/PLAN.md §14
// слой 3.3, критерий этапа: ученик находит запись без вопроса в чат).
// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// MaterialsScreen.test.tsx/StudentLessonsScreen.test.tsx.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MyArchivedLessonDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import ArchiveScreen from './ArchiveScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeLesson(overrides: Partial<MyArchivedLessonDto> = {}): MyArchivedLessonDto {
  return {
    id: 'l1',
    startsAt: '2026-09-08T16:00:00.000Z',
    classTitle: 'Тайцзицюань',
    groupLabel: 'Средняя группа',
    topic: 'Форма 24',
    status: 'scheduled',
    tags: [],
    recordings: [{ title: 'Занятие целиком', url: 'https://cloud.example/rec' }],
    materials: [],
    ...overrides,
  };
}

describe('ArchiveScreen — заголовок и объяснение', () => {
  it('заголовок и строка объяснения — понятно, что это и зачем, до списка', async () => {
    mockApiByPath({ '/me/lessons/archive': [] });
    render(<ArchiveScreen />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Записи занятий' }),
    ).toBeInTheDocument();
    // ADR-0124: условие показа занятия выделено акцентом — RichText рисует
    // его отдельным <strong>, полный текст проверяем через textContent
    // абзаца.
    const explanation = screen.getByText(/Прошедшие занятия,/);
    expect(explanation).toHaveTextContent(
      'Прошедшие занятия, у которых есть запись. Пока учитель не выложил её, ' +
        'занятия в списке нет.',
    );
    expect(screen.getByText('у которых есть запись').tagName).toBe('STRONG');
  });
});

describe('ArchiveScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    const { container } = render(<ArchiveScreen />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('ArchiveScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Обновить», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/me/lessons/archive': new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    render(<ArchiveScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    const retry = screen.getByRole('button', { name: 'Обновить' });

    mockApiByPath({ '/me/lessons/archive': [] });
    await user.click(retry);

    expect(
      await screen.findByText(/Записей пока нет\. Появятся, когда учитель/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ArchiveScreen — пустой список', () => {
  // Пусто здесь не значит «занятий не было» — только что записи к ним ещё
  // нет (ADR-0114): сервер уже отфильтровал занятия без записи, список может
  // быть пуст и на школе, где занятия идут каждую неделю.
  it('честное объяснение вместо пустого места', async () => {
    mockApiByPath({ '/me/lessons/archive': [] });
    render(<ArchiveScreen />);

    expect(
      await screen.findByText(/Записей пока нет\. Появятся, когда учитель/),
    ).toBeInTheDocument();
    // ADR-0124: что случится — выделено акцентом, RichText рисует его
    // отдельным <strong>.
    expect(screen.getByText('выложит первую').tagName).toBe('STRONG');
  });
});

describe('ArchiveScreen — список занятий', () => {
  it('рендерит карточку по каждому занятию, запись открывается ссылкой', async () => {
    mockApiByPath({
      '/me/lessons/archive': [
        makeLesson({ id: 'l1', classTitle: 'Тайцзицюань' }),
        makeLesson({
          id: 'l2',
          classTitle: 'Цигун',
          recordings: [{ title: 'Занятие целиком', url: 'https://cloud.example/rec-2' }],
        }),
      ],
    });

    render(<ArchiveScreen />);

    expect(await screen.findByText('Тайцзицюань')).toBeInTheDocument();
    expect(screen.getByText('Цигун')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Открыть запись' });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://cloud.example/rec');
    expect(links[1]).toHaveAttribute('href', 'https://cloud.example/rec-2');
  });
});
