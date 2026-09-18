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
    recordings: [{ title: 'Занятие целиком', url: 'https://cloud.example/rec' }],
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
    expect(
      screen.getByText(
        'Занятия, которые уже прошли. Пропустили — посмотрите запись здесь.',
      ),
    ).toBeInTheDocument();
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

    expect(await screen.findByText('Прошедших занятий пока нет.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ArchiveScreen — пустой список', () => {
  it('честное объяснение вместо пустого места', async () => {
    mockApiByPath({ '/me/lessons/archive': [] });
    render(<ArchiveScreen />);

    expect(await screen.findByText('Прошедших занятий пока нет.')).toBeInTheDocument();
  });
});

describe('ArchiveScreen — список занятий', () => {
  it('рендерит карточку по каждому занятию, самая свежая запись открывается ссылкой', async () => {
    mockApiByPath({
      '/me/lessons/archive': [
        makeLesson({ id: 'l1', classTitle: 'Тайцзицюань' }),
        makeLesson({ id: 'l2', classTitle: 'Цигун', recordings: [] }),
      ],
    });

    render(<ArchiveScreen />);

    expect(await screen.findByText('Тайцзицюань')).toBeInTheDocument();
    expect(screen.getByText('Цигун')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть запись' })).toHaveAttribute(
      'href',
      'https://cloud.example/rec',
    );
    expect(screen.getByText('Записи нет')).toBeInTheDocument();
  });
});
