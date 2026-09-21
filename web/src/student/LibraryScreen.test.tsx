// Экран «Библиотека» ученика — состояния загрузки списка (ТЗ docs/PLAN.md
// §14 слой 3.2, ADR-0047). Мокаем apiFetch (CLAUDE.md «Сеть только
// через http.ts»), по образцу ArchiveScreen.test.tsx.
import { render, screen, within } from '@testing-library/react';
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
    tags: [],
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

describe('LibraryScreen — пилюли тегов (ADR-0058)', () => {
  it('тегов у материалов нет — строки пилюль нет вовсе', async () => {
    mockApiByPath({ '/me/materials': [makeMaterial({ tags: [] })] });
    render(<LibraryScreen />);

    await screen.findByText('Ван Пэйшэн, «Ба-гуа-чжан»');
    expect(screen.queryByRole('group', { name: 'Теги' })).not.toBeInTheDocument();
  });

  it('клик по тегу сужает список, повторный клик по «Все» возвращает всё', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/me/materials': [
        makeMaterial({ id: 'm1', title: 'Ван Пэйшэн, «Ба-гуа-чжан»', tags: ['старшая'] }),
        makeMaterial({ id: 'm2', title: 'Разбор формы 24', tags: ['база'] }),
      ],
    });

    render(<LibraryScreen />);
    await screen.findByText('Ван Пэйшэн, «Ба-гуа-чжан»');

    // Тег «старшая» теперь есть и на пилюле фильтра, и на пилюле в строке
    // материала (ADR-0068) — без scope до группы фильтра запрос неоднозначен.
    const filterGroup = within(screen.getByRole('group', { name: 'Теги' }));
    await user.click(filterGroup.getByRole('button', { name: 'старшая' }));

    expect(screen.getByText('Ван Пэйшэн, «Ба-гуа-чжан»')).toBeInTheDocument();
    expect(screen.queryByText('Разбор формы 24')).not.toBeInTheDocument();

    await user.click(filterGroup.getByRole('button', { name: 'Все' }));

    expect(screen.getByText('Ван Пэйшэн, «Ба-гуа-чжан»')).toBeInTheDocument();
    expect(screen.getByText('Разбор формы 24')).toBeInTheDocument();
  });

  // ADR-0068: тег в строке материала — то же действие, что пилюля фильтра
  // наверху, с одним состоянием на двоих (не второй источник правды).
  it('клик по тегу в строке материала сужает список и отмечает пилюлю фильтра наверху', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/me/materials': [
        makeMaterial({ id: 'm1', title: 'Ван Пэйшэн, «Ба-гуа-чжан»', tags: ['старшая'] }),
        makeMaterial({ id: 'm2', title: 'Разбор формы 24', tags: [] }),
      ],
    });

    render(<LibraryScreen />);
    await screen.findByText('Ван Пэйшэн, «Ба-гуа-чжан»');

    // У m2 тегов нет, поэтому группа «Теги материала» на экране одна — она
    // принадлежит карточке m1.
    const cardTags = within(screen.getByRole('group', { name: 'Теги материала' }));
    await user.click(cardTags.getByRole('button', { name: 'старшая' }));

    expect(screen.getByText('Ван Пэйшэн, «Ба-гуа-чжан»')).toBeInTheDocument();
    expect(screen.queryByText('Разбор формы 24')).not.toBeInTheDocument();

    const filterGroup = within(screen.getByRole('group', { name: 'Теги' }));
    expect(filterGroup.getByRole('button', { name: 'старшая' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
