// Карточка «Сегодня» (docs/PLAN.md §6 п.3) — рубрика день+время+статус
// времени, название, тема, статус рассылки; по одному кейсу на статус плюс
// «без рассылки — ничего» (по образцу LessonCard.test.tsx).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import { TodayLessonCard } from './TodayLessonCard';

const TZ = 'Asia/Jerusalem';
const NOW = '2026-09-20T12:00:00.000Z'; // 15:00 в Иерусалиме

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-20T16:00:00.000Z', // 19:00 в Иерусалиме, через 4 часа
    durationMin: 60,
    topic: 'Одиночное толкание',
    status: 'scheduled',
    tags: [],
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(lesson: LessonDto) {
  return render(
    <MemoryRouter>
      <TodayLessonCard
        lesson={lesson}
        className="Туйшоу, группа 2"
        onSelect={vi.fn()}
        timeZone={TZ}
        nowIso={NOW}
      />
    </MemoryRouter>,
  );
}

describe('TodayLessonCard', () => {
  it('рубрика — день, время и статус времени; название и тема видны', () => {
    renderCard(makeLesson());

    expect(screen.getByText('Сегодня, 19:00 · через 4 часа')).toBeInTheDocument();
    expect(screen.getByText('Туйшоу, группа 2')).toBeInTheDocument();
    expect(screen.getByText(/Одиночное толкание/)).toBeInTheDocument();
  });

  it('занятие уже прошло сегодня — статус времени «прошло»', () => {
    renderCard(makeLesson({ startsAt: '2026-09-20T03:30:00.000Z' })); // 06:30 в Иерусалиме

    expect(screen.getByText('Сегодня, 06:30 · прошло')).toBeInTheDocument();
  });

  it('клик по карточке зовёт onSelect', () => {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <TodayLessonCard
          lesson={makeLesson()}
          className="Туйшоу, группа 2"
          onSelect={onSelect}
          timeZone={TZ}
          nowIso={NOW}
        />
      </MemoryRouter>,
    );

    screen.getByRole('button').click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('без рассылки — статуса нет вовсе', () => {
    renderCard(makeLesson());
    expect(screen.queryByText(/Ссылка/)).not.toBeInTheDocument();
  });

  it('sent — «Ссылка ушла»', () => {
    renderCard(makeLesson({ broadcast: { status: 'sent', kind: 'lesson_link' } }));
    expect(screen.getByText('Ссылка ушла')).toBeInTheDocument();
  });

  it('failed — «Ошибка отправки»', () => {
    renderCard(makeLesson({ broadcast: { status: 'failed', kind: 'lesson_link' } }));
    expect(screen.getByText('Ошибка отправки')).toBeInTheDocument();
  });

  it('cancelled — «Отменена» и ссылка на «Рассылки»', () => {
    renderCard(makeLesson({ broadcast: { status: 'cancelled', kind: 'lesson_link' } }));

    expect(screen.getByText('Отменена')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /почему.*Рассылках/ })).toHaveAttribute(
      'href',
      '/broadcasts',
    );
  });

  it('тема не задана — заглушка; отменённое занятие — пометка «Отменено»', () => {
    renderCard(makeLesson({ topic: '', status: 'cancelled' }));

    expect(screen.getByText(/Тема не задана/)).toBeInTheDocument();
    expect(screen.getByText(/Отменено/)).toBeInTheDocument();
  });

  it('есть запись — пометка «запись есть»', () => {
    renderCard(
      makeLesson({
        recordings: [{ id: 'r1', title: 'Часть 1', url: 'https://youtu.be/1' }],
      }),
    );

    expect(screen.getByText(/запись есть/)).toBeInTheDocument();
  });
});
