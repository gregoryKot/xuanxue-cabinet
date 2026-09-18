// Экран «Библиотека» ученика — состояния загрузки списка (ТЗ docs/PLAN.md
// §14 слой 3.2, ADR-0047, ADR-0048). Мокаем apiFetch (CLAUDE.md «Сеть только
// через http.ts»), по образцу ArchiveScreen.test.tsx.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MyMaterialDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import LibraryScreen from './LibraryScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeMaterial(overrides: Partial<MyMaterialDto> = {}): MyMaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
    kind: 'book',
    classTitles: [],
    url: 'https://example.com/book',
    ...overrides,
  };
}

describe('LibraryScreen — заголовок и объяснение', () => {
  it('заголовок и строка объяснения — понятно, что это и зачем, до списка', async () => {
    mockApiByPath({ '/me/materials': [] });
    render(<LibraryScreen />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Библиотека' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Книги, статьи и видео, которыми делится школа. Открывается в новой вкладке.',
      ),
    ).toBeInTheDocument();
  });
});

describe('LibraryScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    const { container } = render(<LibraryScreen />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('LibraryScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Обновить», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/me/materials': new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    render(<LibraryScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    const retry = screen.getByRole('button', { name: 'Обновить' });

    mockApiByPath({ '/me/materials': [] });
    await user.click(retry);

    expect(await screen.findByText('Библиотека пока пустая.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('LibraryScreen — пустой список', () => {
  it('честное объяснение вместо пустого места', async () => {
    mockApiByPath({ '/me/materials': [] });
    render(<LibraryScreen />);

    expect(await screen.findByText('Библиотека пока пустая.')).toBeInTheDocument();
  });
});

describe('LibraryScreen — список материалов', () => {
  it('рендерит карточку по каждому материалу', async () => {
    mockApiByPath({
      '/me/materials': [
        makeMaterial({ id: 'm1', title: 'Ван Пэйшэн, «Ба-гуа-чжан»' }),
        makeMaterial({ id: 'm2', title: 'Разбор формы 24', kind: 'video' }),
      ],
    });

    render(<LibraryScreen />);

    expect(await screen.findByText('Ван Пэйшэн, «Ба-гуа-чжан»')).toBeInTheDocument();
    expect(screen.getByText('Разбор формы 24')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Открыть' })).toHaveLength(2);
  });
});
