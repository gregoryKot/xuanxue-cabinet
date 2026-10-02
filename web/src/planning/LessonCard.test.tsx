// Бейдж статуса рассылки-ссылки на карточке (docs/PLAN.md §6 п.3) — по
// одному кейсу на статус плюс «без рассылки — ничего», не «0»/мусор
// (CLAUDE.md «Данные пользователя — только из API»).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import { LessonCard } from './LessonCard';

const ONLINE_CLASS = { title: 'Тайцзицюань', groupLabel: '', format: 'online' as const };

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    topic: 'Пятое занятие',
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
      <LessonCard lesson={lesson} cls={ONLINE_CLASS} onSelect={vi.fn()} />
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
        <LessonCard lesson={makeLesson()} cls={undefined} onSelect={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // Инцидент 2026-09-21 (снимок владельца): название и тема слипались в одну
  // строку — «Медитация чжи-гуаньТема не задана». Вертикальный отступ на
  // строчном <span> браузер игнорирует, поэтому зазор должна задавать
  // flex-колонка (тот же приём, что в TodayLessonCard.tsx). jsdom раскладку
  // не считает — проверяем механизм (display/flexDirection), а не пиксели.
  it('название и тема — колонка, а не одна строка (инцидент 2026-09-21)', () => {
    renderCard(makeLesson());
    const title = screen.getByText('Тайцзицюань');
    const container = title.parentElement;
    expect(container).not.toBeNull();
    const containerStyle = getComputedStyle(container as HTMLElement);
    expect(containerStyle.display).toBe('flex');
    expect(containerStyle.flexDirection).toBe('column');
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

  // ADR-0075: тег даты — пилюля-ссылка на экран тега, отдельной строкой под
  // кнопкой (TagPillLinks.tsx), не часть строки темы.
  it('без тегов — строки пилюль нет вовсе', () => {
    renderCard(makeLesson({ tags: [] }));
    expect(screen.queryByRole('group', { name: 'Теги занятия' })).not.toBeInTheDocument();
  });

  it('теги — пилюли-ссылки на экран тега с этим тегом', () => {
    renderCard(makeLesson({ tags: ['дракон', 'начинающие'] }));

    expect(screen.getByRole('group', { name: 'Теги занятия' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'дракон' })).toHaveAttribute(
      'href',
      `/materials/tags?tag=${encodeURIComponent('дракон')}`,
    );
    expect(screen.getByRole('link', { name: 'начинающие' })).toBeInTheDocument();
  });

  it('cancelled — «Отменена» и ссылка на «Рассылки», клик по ссылке не всплывает до кнопки', () => {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <LessonCard
          lesson={makeLesson({ broadcast: { status: 'cancelled', kind: 'lesson_link' } })}
          cls={ONLINE_CLASS}
          onSelect={onSelect}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Отменена')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /почему.*Рассылках/ });
    expect(link).toHaveAttribute('href', '/broadcasts');
    expect(onSelect).not.toHaveBeenCalled();
  });

  // Просьба владельца 2026-10-02: на «Занятиях» видно, где занятие и какой
  // группы — семь «Тайцзицюань» подряд без этого неотличимы.
  it('название с группой и место — парк, или «Онлайн»', () => {
    render(
      <ul>
        <LessonCard
          lesson={makeLesson()}
          cls={{
            title: 'Тайцзицюань',
            groupLabel: 'новички',
            format: 'offline',
            location: 'Парк Гонда, Тель-Авив',
          }}
          onSelect={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText('Тайцзицюань · новички')).toBeInTheDocument();
    expect(screen.getByText('Парк Гонда, Тель-Авив')).toBeInTheDocument();
  });

  it('класса нет — «—» и без строки места', () => {
    render(
      <ul>
        <LessonCard lesson={makeLesson()} cls={undefined} onSelect={vi.fn()} />
      </ul>,
    );

    expect(screen.queryByText('Онлайн')).not.toBeInTheDocument();
  });
});
