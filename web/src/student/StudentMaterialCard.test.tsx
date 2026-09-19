// Строка материала в библиотеке ученика (docs/PLAN.md §14 слои 3.2/3.4) —
// своя проверка на каждый случай, без сети и без DI. По образцу
// ArchivedLessonCard.test.tsx.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MyMaterialDto } from '@xuanxue/shared';
import { StudentMaterialCard } from './StudentMaterialCard';

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

describe('StudentMaterialCard — название и вид', () => {
  it('название материала и подпись вида', () => {
    render(<StudentMaterialCard material={makeMaterial()} />);
    expect(screen.getByText('Ван Пэйшэн, «Ба-гуа-чжан»')).toBeInTheDocument();
    expect(screen.getByText('Книга')).toBeInTheDocument();
  });

  it('вид «видео» подписан «Видео»', () => {
    render(<StudentMaterialCard material={makeMaterial({ kind: 'video' })} />);
    expect(screen.getByText('Видео')).toBeInTheDocument();
  });

  // Занятие приезжает названием с сервера (MaterialsService.listForStudent):
  // `GET /classes` ученику закрыт ролью, подписать id было бы нечем (ADR-0047).
  it('привязанные занятия стоят в подписи рядом с видом', () => {
    render(
      <StudentMaterialCard
        material={makeMaterial({ classTitles: ['Тайцзицюань, средняя группа'] })}
      />,
    );
    expect(screen.getByText('Книга · Тайцзицюань, средняя группа')).toBeInTheDocument();
  });
});

describe('StudentMaterialCard — открытая ссылка', () => {
  it('ссылка «Открыть» ведёт по адресу в новой вкладке', () => {
    render(
      <StudentMaterialCard
        material={makeMaterial({ url: 'https://example.com/article' })}
      />,
    );
    const link = screen.getByRole('link', { name: 'Открыть' });
    expect(link).toHaveAttribute('href', 'https://example.com/article');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});

describe('StudentMaterialCard — закрытый материал (ADR-0048)', () => {
  it('locked: true — вместо ссылки объяснение, мёртвой ссылки нет', () => {
    // Сервер сегодня locked не отдаёт (слой 3.1) — DTO собран руками, чтобы
    // проверить контракт заранее, до появления рубильника (слой 3.4).
    render(
      <StudentMaterialCard material={makeMaterial({ url: undefined, locked: true })} />,
    );
    expect(
      screen.getByText(
        'Этот материал школа открывает после оплаты месяца. Напишите в чат школы — там подскажут, как оплатить.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
