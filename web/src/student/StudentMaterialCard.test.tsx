// Строка материала в библиотеке ученика (docs/PLAN.md §14 слои 3.2/3.4,
// ADR-0068) — своя проверка на каждый случай, без сети и без DI. По образцу
// ArchivedLessonCard.test.tsx. `renderCard` подставляет selectedTag/onSelectTag
// по умолчанию, чтобы их не повторял каждый тест про библиотеку; отдельный
// блок ниже проверяет режим без них — карточка занятия архива
// (ArchivedLessonCard.tsx) их вовсе не передаёт (StudentMaterialCardTagProps).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

function renderCard(
  material: MyMaterialDto,
  overrides: { selectedTag?: string; onSelectTag?: (tag: string) => void } = {},
) {
  const onSelectTag = overrides.onSelectTag ?? vi.fn();
  render(
    <StudentMaterialCard
      material={material}
      selectedTag={overrides.selectedTag ?? ''}
      onSelectTag={onSelectTag}
    />,
  );
  return { onSelectTag };
}

describe('StudentMaterialCard — название и вид', () => {
  it('название материала и подпись вида', () => {
    renderCard(makeMaterial());
    expect(screen.getByText('Ван Пэйшэн, «Ба-гуа-чжан»')).toBeInTheDocument();
    expect(screen.getByText('Книга')).toBeInTheDocument();
  });

  it('вид «видео» подписан «Видео»', () => {
    renderCard(makeMaterial({ kind: 'video' }));
    expect(screen.getByText('Видео')).toBeInTheDocument();
  });

  // Занятие приезжает названием с сервера (MaterialsService.listForStudent):
  // `GET /classes` ученику закрыт ролью, подписать id было бы нечем (ADR-0047).
  it('привязанные занятия стоят в подписи рядом с видом', () => {
    renderCard(makeMaterial({ classTitles: ['Тайцзицюань, средняя группа'] }));
    expect(screen.getByText('Книга · Тайцзицюань, средняя группа')).toBeInTheDocument();
  });

  // ADR-0068: тег стал пилюлей под подписью и в склеенную строку не входит —
  // даже когда у материала есть теги, здесь только вид и занятия.
  it('подпись содержит только вид и занятия, даже когда у материала есть теги', () => {
    renderCard(
      makeMaterial({
        classTitles: ['Тайцзицюань, средняя группа'],
        tags: ['старшая', 'база'],
      }),
    );
    expect(screen.getByText('Книга · Тайцзицюань, средняя группа')).toBeInTheDocument();
  });

  it('материал без тегов — подпись как раньше', () => {
    renderCard(makeMaterial({ tags: [] }));
    expect(screen.getByText('Книга')).toBeInTheDocument();
  });
});

describe('StudentMaterialCard — тег как действие (ADR-0068)', () => {
  it('тег — кнопка с его подписью, не выбран — aria-pressed="false"', () => {
    renderCard(makeMaterial({ tags: ['старшая'] }));
    expect(screen.getByRole('button', { name: 'старшая' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('нажатие по тегу зовёт onSelectTag с этим тегом', async () => {
    const user = userEvent.setup();
    const { onSelectTag } = renderCard(makeMaterial({ tags: ['старшая'] }));

    await user.click(screen.getByRole('button', { name: 'старшая' }));

    expect(onSelectTag).toHaveBeenCalledWith('старшая');
  });

  it('выбранный тег — aria-pressed="true", повторное нажатие снимает фильтр', async () => {
    const user = userEvent.setup();
    const { onSelectTag } = renderCard(makeMaterial({ tags: ['старшая'] }), {
      selectedTag: 'старшая',
    });
    const tagButton = screen.getByRole('button', { name: 'старшая' });
    expect(tagButton).toHaveAttribute('aria-pressed', 'true');

    await user.click(tagButton);

    expect(onSelectTag).toHaveBeenCalledWith('');
  });

  it('тегов нет — группы «Теги материала» нет вовсе', () => {
    renderCard(makeMaterial({ tags: [] }));
    expect(
      screen.queryByRole('group', { name: 'Теги материала' }),
    ).not.toBeInTheDocument();
  });
});

describe('StudentMaterialCard — без onSelectTag (карточка занятия архива)', () => {
  it('без onSelectTag пилюль-тегов нет, а название, вид и ссылка на месте', () => {
    render(
      <StudentMaterialCard
        material={makeMaterial({
          title: 'Форма 24, разбор',
          tags: ['старшая'],
          url: 'https://example.com/article',
        })}
      />,
    );

    expect(screen.getByText('Форма 24, разбор')).toBeInTheDocument();
    expect(screen.getByText('Книга')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Теги материала' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'старшая' })).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Открыть' });
    expect(link).toHaveAttribute('href', 'https://example.com/article');
  });
});

describe('StudentMaterialCard — открытая ссылка', () => {
  it('ссылка «Открыть» ведёт по адресу в новой вкладке', () => {
    renderCard(makeMaterial({ url: 'https://example.com/article' }));
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
    renderCard(makeMaterial({ url: undefined, locked: true }));
    expect(
      screen.getByText(
        'Этот материал школа открывает после оплаты месяца. Напишите в чат школы — там подскажут, как оплатить.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
