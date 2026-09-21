// Строка материала в списке: вид, привязанные занятия, отметка «только
// преподаватели» и переход по нажатию (docs/PLAN.md §14, ADR-0047, ADR-0058),
// по образцу channels/ChannelCard.test.tsx. <MemoryRouter> обязателен —
// строка тегов рисует <Link> на экран тега (TagPillLinks.tsx, ADR-0075).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialDto } from '@xuanxue/shared';
import { MaterialCard } from './MaterialCard';

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

function renderCard(
  overrides: Partial<MaterialDto> = {},
  classTitleById: Map<string, string> = new Map(),
) {
  const onSelect = vi.fn();
  render(
    <MemoryRouter>
      <ul>
        <MaterialCard
          material={makeMaterial(overrides)}
          classTitleById={classTitleById}
          onSelect={onSelect}
        />
      </ul>
    </MemoryRouter>,
  );
  return { onSelect };
}

describe('MaterialCard', () => {
  it('название и вид — открывает страницу материала по нажатию', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderCard();

    expect(screen.getByText('Ван Пэйшэн — форма 24')).toBeInTheDocument();
    expect(screen.getByText('Книга')).toBeInTheDocument();

    await user.click(screen.getByText('Ван Пэйшэн — форма 24'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('вид подписан по-русски для каждого значения', () => {
    renderCard({ kind: 'video' });
    expect(screen.getByText('Видео')).toBeInTheDocument();
  });

  it('привязанное занятие — название рядом с видом', () => {
    renderCard({ classIds: ['c1'] }, new Map([['c1', 'Тайцзицюань, средняя группа']]));

    expect(screen.getByText('Книга · Тайцзицюань, средняя группа')).toBeInTheDocument();
  });

  it('несколько занятий — имена через «·»', () => {
    renderCard(
      { classIds: ['c1', 'c2'] },
      new Map([
        ['c1', 'Тайцзицюань, средняя группа'],
        ['c2', 'Цигун, начинающие'],
      ]),
    );

    expect(
      screen.getByText('Книга · Тайцзицюань, средняя группа · Цигун, начинающие'),
    ).toBeInTheDocument();
  });

  it('материал школы без привязки — только вид, без занятий', () => {
    renderCard({ classIds: [] });
    expect(screen.getByText('Книга')).toBeInTheDocument();
  });

  // ADR-0075: тег переехал из подписи в свою строку пилюль-ссылок под ней
  // (TagPillLinks.tsx) — подпись остаётся вид+занятия, без тега.
  it('теги — пилюли-ссылки на экран тега, не часть подписи', () => {
    renderCard(
      { classIds: ['c1'], tags: ['старшая', 'база'] },
      new Map([['c1', 'Тайцзицюань, средняя группа']]),
    );

    expect(screen.getByText('Книга · Тайцзицюань, средняя группа')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Теги материала' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'старшая' })).toHaveAttribute(
      'href',
      `/materials/tags?tag=${encodeURIComponent('старшая')}`,
    );
    expect(screen.getByRole('link', { name: 'база' })).toBeInTheDocument();
  });

  it('отметка «только преподаватели» — сразу после вида, тег в подпись не подмешивается', () => {
    renderCard({ tags: ['старшая'], access: 'staff' });
    expect(screen.getByText('Книга · Только преподаватели')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'старшая' })).toBeInTheDocument();
  });

  it('материал без тегов — подпись как раньше, пилюль нет вовсе', () => {
    renderCard({ tags: [] });
    expect(screen.getByText('Книга')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('access: all — пометки «Только преподаватели» нет', () => {
    renderCard({ access: 'all' });
    expect(screen.queryByText(/Только преподаватели/)).not.toBeInTheDocument();
  });

  // ADR-0058: второе значение access — своя короткая пометка, не тег.
  it('access: staff — пометка «Только преподаватели»', () => {
    renderCard({ access: 'staff' });
    expect(screen.getByText('Книга · Только преподаватели')).toBeInTheDocument();
  });

  // Список материалов — одна карточка (docs/adr/0043): волосяную линию между
  // строками красит сама строка, у последней строки её быть не должно.
  it('последняя строка — без нижней волосяной линии, у остальных линия есть', () => {
    render(
      <MemoryRouter>
        <ul>
          <MaterialCard
            material={makeMaterial({ id: 'm1', title: 'Первый материал' })}
            classTitleById={new Map()}
            onSelect={vi.fn()}
          />
          <MaterialCard
            material={makeMaterial({ id: 'm2', title: 'Второй материал' })}
            classTitleById={new Map()}
            onSelect={vi.fn()}
            isLast
          />
        </ul>
      </MemoryRouter>,
    );

    const firstRow = screen.getByText('Первый материал').closest('li');
    const lastRow = screen.getByText('Второй материал').closest('li');

    expect(firstRow?.style.borderBottom).toBe('1px solid var(--panel)');
    expect(lastRow?.style.borderBottomStyle).toBe('none');
  });
});
