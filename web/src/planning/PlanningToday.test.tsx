// «Сегодня» считается от текущего дня, поэтому время фиксировано (CLAUDE.md
// «Детерминизм»): CI гоняет vitest ещё и под TZ=Australia/Sydney, где сдвиг
// в «плюс семь часов» переносит занятие на другой календарный день. Момент
// занятия — ровно NOW, не «NOW плюс сколько-то часов».
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import { PlanningToday } from './PlanningToday';

const NOW = new Date('2026-09-08T09:00:00.000Z');
const NEXT_MONTH_ISO = '2026-10-08T09:00:00.000Z';
const CLASS_TITLES = new Map([['c1', 'Тайцзицюань, средняя группа']]);

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: NOW.toISOString(),
    durationMin: 60,
    topic: 'Пятое занятие',
    status: 'scheduled',
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderToday(lessons: LessonDto[] | null, onOpenLesson = vi.fn()) {
  return render(
    <PlanningToday
      lessons={lessons}
      classTitleById={CLASS_TITLES}
      onOpenLesson={onOpenLesson}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PlanningToday — загрузка', () => {
  it('список ещё не пришёл — скелетон', () => {
    const { container } = renderToday(null);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('PlanningToday — занятие сегодня', () => {
  it('карточка со временем, классом и темой; клик зовёт onOpenLesson', async () => {
    const user = userEvent.setup();
    const onOpenLesson = vi.fn();
    renderToday([makeLesson()], onOpenLesson);

    expect(screen.getByText('Сегодня')).toBeInTheDocument();
    expect(screen.getByText(/Тайцзицюань, средняя группа/)).toBeInTheDocument();
    expect(screen.getByText(/Пятое занятие/)).toBeInTheDocument();

    await user.click(screen.getByText(/Пятое занятие/));
    expect(onOpenLesson).toHaveBeenCalledWith('l1');
  });

  it('класс занятия не найден в classTitleById — «—» вместо пустого места', () => {
    renderToday([makeLesson({ classId: 'неизвестный' })]);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('PlanningToday — сегодня пусто', () => {
  it('занятие другого дня в окне — сегодня его нет', () => {
    renderToday([makeLesson({ startsAt: NEXT_MONTH_ISO })]);

    expect(screen.getByText('Сегодня занятий нет.')).toBeInTheDocument();
  });

  it('есть ближайшее занятие — карточка с ним, клик зовёт onOpenLesson', async () => {
    const user = userEvent.setup();
    const onOpenLesson = vi.fn();
    renderToday([makeLesson({ id: 'l9', startsAt: NEXT_MONTH_ISO })], onOpenLesson);

    expect(screen.getByText('Сегодня занятий нет.')).toBeInTheDocument();
    const card = screen.getByText(/Пятое занятие/);
    expect(card).toBeInTheDocument();

    await user.click(card);
    expect(onOpenLesson).toHaveBeenCalledWith('l9');
  });

  it('класс ближайшего занятия не найден — «—» вместо пустого места', () => {
    renderToday([
      makeLesson({ id: 'l9', startsAt: NEXT_MONTH_ISO, classId: 'неизвестный' }),
    ]);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('ни сегодня, ни ближайшего — только честный текст', () => {
    renderToday([]);

    expect(screen.getByText('Сегодня занятий нет.')).toBeInTheDocument();
  });
});
