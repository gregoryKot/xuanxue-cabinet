// Неделя расписания: день — карточка с полным названием, занятия — строки в
// ней (DaySlots.tsx тоже проверяется здесь: отдельно он не живёт).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WEEKDAYS, type Weekday } from '@xuanxue/shared';
import { ScheduleDayList } from './ScheduleDayList';
import type { ScheduleGrid, ScheduleSlot } from './scheduleGrid';

function emptyGrid(): ScheduleGrid {
  const grid = {} as ScheduleGrid;
  for (const day of WEEKDAYS) grid[day] = [];
  return grid;
}

function makeSlot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
  return {
    classId: 'c1',
    ruleId: 'r1',
    title: 'Тайцзицюань',
    groupLabel: '',
    format: 'online',
    startTime: '19:00',
    endTime: '20:00',
    startMinutes: 1140,
    active: true,
    linkMissing: false,
    channelCount: 1,
    tags: [],
    ...overrides,
  };
}

const FULL_DAY_NAMES = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
];

describe('ScheduleDayList — какие дни показываются', () => {
  it('пустые дни не рендерятся вовсе: один день с занятием — один заголовок', () => {
    const grid = emptyGrid();
    grid[2 as Weekday] = [makeSlot()];

    render(<ScheduleDayList grid={grid} onSelectSlot={vi.fn()} />);

    expect(screen.getByText('Тайцзицюань', { exact: false })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(['Вторник']);
    expect(screen.queryByText('Занятий нет')).not.toBeInTheDocument();
  });

  it('полностью пустая сетка — ни заголовков, ни списков, ни кнопок', () => {
    const { container } = render(
      <ScheduleDayList grid={emptyGrid()} onSelectSlot={vi.fn()} />,
    );

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('section')).toHaveLength(0);
    expect(container.querySelectorAll('ul')).toHaveLength(0);
  });

  it('дни идут от воскресенья до субботы, как в WEEKDAYS, а не по порядку заполнения', () => {
    const grid = emptyGrid();
    // Заполняем с конца: порядок в экране задаёт WEEKDAYS, а не сетка.
    for (const day of [...WEEKDAYS].reverse()) {
      grid[day] = [makeSlot({ classId: `c${day}`, ruleId: `r${day}` })];
    }

    render(<ScheduleDayList grid={grid} onSelectSlot={vi.fn()} />);

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(FULL_DAY_NAMES);
  });

  it('заголовок — полное название дня, а не «Вс/Пн/Вт»', () => {
    const grid = emptyGrid();
    for (const day of WEEKDAYS) grid[day] = [makeSlot({ ruleId: `r${day}` })];

    render(<ScheduleDayList grid={grid} onSelectSlot={vi.fn()} />);

    expect(screen.queryByText(/^(Вс|Пн|Вт|Ср|Чт|Пт|Сб)$/)).not.toBeInTheDocument();
    for (const name of FULL_DAY_NAMES) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });
});

describe('ScheduleDayList — день как карточка', () => {
  it('день — раздел с названием, занятия — строки <li> одного списка <ul>', () => {
    const grid = emptyGrid();
    grid[2 as Weekday] = [
      makeSlot({ ruleId: 'r1', title: 'Утро' }),
      makeSlot({ ruleId: 'r2', title: 'Вечер' }),
    ];
    grid[4 as Weekday] = [makeSlot({ ruleId: 'r3', title: 'Четверг-занятие' })];

    render(<ScheduleDayList grid={grid} onSelectSlot={vi.fn()} />);

    const tuesday = screen.getByRole('region', { name: 'Вторник' });
    const items = within(tuesday).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(tuesday).getAllByRole('list')).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Утро');
    expect(items[1]).toHaveTextContent('Вечер');
    // В карточке вторника нет строки четверга.
    expect(within(tuesday).queryByText('Четверг-занятие')).not.toBeInTheDocument();
    // Каждая строка — одна кнопка внутри своего <li>.
    for (const item of items) {
      expect(within(item).getAllByRole('button')).toHaveLength(1);
    }
  });

  it('строки дня идут в порядке сетки (она уже отсортирована по началу)', () => {
    const grid = emptyGrid();
    grid[1 as Weekday] = [
      makeSlot({ ruleId: 'r1', title: 'Первое', startTime: '08:00' }),
      makeSlot({ ruleId: 'r2', title: 'Второе', startTime: '12:00' }),
      makeSlot({ ruleId: 'r3', title: 'Третье', startTime: '19:00' }),
    ];

    render(<ScheduleDayList grid={grid} onSelectSlot={vi.fn()} />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Первое'),
      expect.stringContaining('Второе'),
      expect.stringContaining('Третье'),
    ]);
  });

  // Линия делит строки одной карточки: без неё занятия дня сливаются в сплошной
  // текст, а линия после последней рисовала бы лишний шов у края карточки
  // (ADR-0043, oneCardListStyle).
  it('линия под каждой строкой, кроме последней', () => {
    const grid = emptyGrid();
    grid[3 as Weekday] = [
      makeSlot({ ruleId: 'r1' }),
      makeSlot({ ruleId: 'r2' }),
      makeSlot({ ruleId: 'r3' }),
    ];

    render(<ScheduleDayList grid={grid} onSelectSlot={vi.fn()} />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]?.style.borderBottom).toBe('1px solid var(--line-soft)');
    expect(items[1]?.style.borderBottom).toBe('1px solid var(--line-soft)');
    // jsdom приводит `none` к своему «medium», поэтому у последней строки
    // проверяется отсутствие линии, а не буква значения.
    expect(items[2]?.style.borderBottom).not.toContain('var(--line-soft)');
  });

  it('единственное занятие дня — без линии', () => {
    const grid = emptyGrid();
    grid[3 as Weekday] = [makeSlot()];

    render(<ScheduleDayList grid={grid} onSelectSlot={vi.fn()} />);

    expect(screen.getByRole('listitem').style.borderBottom).not.toContain(
      'var(--line-soft)',
    );
  });

  it('строка показывает начало и конец занятия и место', () => {
    const grid = emptyGrid();
    grid[2 as Weekday] = [
      makeSlot({
        startTime: '08:00',
        endTime: '09:30',
        format: 'offline',
        location: 'Парк Яркон',
      }),
    ];

    render(<ScheduleDayList grid={grid} onSelectSlot={vi.fn()} />);

    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('09:30')).toBeInTheDocument();
    expect(screen.getByText('Парк Яркон')).toBeInTheDocument();
  });
});

describe('ScheduleDayList — выбор занятия', () => {
  it('клик по строке вызывает onSelectSlot с classId', async () => {
    const user = userEvent.setup();
    const grid = emptyGrid();
    grid[2 as Weekday] = [makeSlot({ classId: 'c42' })];
    const onSelectSlot = vi.fn();

    render(<ScheduleDayList grid={grid} onSelectSlot={onSelectSlot} />);
    await user.click(screen.getByRole('button'));

    expect(onSelectSlot).toHaveBeenCalledTimes(1);
    expect(onSelectSlot).toHaveBeenCalledWith('c42');
  });

  it('из нескольких строк открывается именно та, по которой кликнули', async () => {
    const user = userEvent.setup();
    const grid = emptyGrid();
    grid[2 as Weekday] = [
      makeSlot({ classId: 'a', ruleId: 'r1', title: 'Первое' }),
      makeSlot({ classId: 'b', ruleId: 'r2', title: 'Второе' }),
    ];
    grid[5 as Weekday] = [makeSlot({ classId: 'c', ruleId: 'r3', title: 'Третье' })];
    const onSelectSlot = vi.fn();

    render(<ScheduleDayList grid={grid} onSelectSlot={onSelectSlot} />);
    await user.click(screen.getByRole('button', { name: /Второе/ }));
    await user.click(screen.getByRole('button', { name: /Третье/ }));

    expect(onSelectSlot).toHaveBeenNthCalledWith(1, 'b');
    expect(onSelectSlot).toHaveBeenNthCalledWith(2, 'c');
  });
});
