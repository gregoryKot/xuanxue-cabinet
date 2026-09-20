// Бейдж статуса рассылки-ссылки на карточке (docs/PLAN.md §6 п.3) — по
// одному кейсу на статус плюс «без рассылки — ничего», не «0»/мусор
// (CLAUDE.md «Данные пользователя — только из API»).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import { LessonCard } from './LessonCard';

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    topic: 'Пятое занятие',
    status: 'scheduled',
    recordings: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(lesson: LessonDto) {
  return render(
    <MemoryRouter>
      <LessonCard lesson={lesson} className="Тайцзицюань" onSelect={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('LessonCard', () => {
  it('время, класс и тема на своих местах', () => {
    renderCard(makeLesson());
    expect(screen.getByText('Тайцзицюань')).toBeInTheDocument();
    expect(screen.getByText(/Пятое занятие/)).toBeInTheDocument();
  });

  it('класс не найден — «—» вместо пустого места', () => {
    render(
      <MemoryRouter>
        <LessonCard lesson={makeLesson()} className="—" onSelect={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('без рассылки — бейджа нет вовсе', () => {
    renderCard(makeLesson());
    expect(screen.queryByText(/Ссылка/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ошибка отправки/)).not.toBeInTheDocument();
  });

  it('scheduled — «Ссылка ждёт отправки»', () => {
    renderCard(makeLesson({ broadcast: { status: 'scheduled', kind: 'lesson_link' } }));
    expect(screen.getByText('Ссылка ждёт отправки')).toBeInTheDocument();
  });

  it('sent — «Ссылка ушла»', () => {
    renderCard(makeLesson({ broadcast: { status: 'sent', kind: 'lesson_link' } }));
    expect(screen.getByText('Ссылка ушла')).toBeInTheDocument();
  });

  it('failed — «Ошибка отправки»', () => {
    renderCard(makeLesson({ broadcast: { status: 'failed', kind: 'lesson_link' } }));
    expect(screen.getByText('Ошибка отправки')).toBeInTheDocument();
  });

  it('cancelled — «Отменена» и ссылка на «Рассылки», клик по ссылке не всплывает до кнопки', () => {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <LessonCard
          lesson={makeLesson({ broadcast: { status: 'cancelled', kind: 'lesson_link' } })}
          className="Тайцзицюань"
          onSelect={onSelect}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Отменена')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /почему.*Рассылках/ });
    expect(link).toHaveAttribute('href', '/broadcasts');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
