// Строка занятия в архиве ученика (ТЗ docs/PLAN.md §14 слой 3.3) — своя
// проверка на каждый случай, без сети и без DI. По образцу
// StudentLessonCard.test.tsx: время — с фиксированным поясом, не поясом
// машины (CI гоняет vitest ещё и под TZ=Australia/Sydney).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MyArchivedLessonDto } from '@xuanxue/shared';
import { ArchivedLessonCard } from './ArchivedLessonCard';

const TZ = 'Asia/Jerusalem';

function makeLesson(overrides: Partial<MyArchivedLessonDto> = {}): MyArchivedLessonDto {
  return {
    id: 'l1',
    startsAt: '2026-09-08T16:00:00.000Z',
    classTitle: 'Тайцзицюань',
    groupLabel: 'Средняя группа',
    topic: 'Форма 24',
    status: 'scheduled',
    tags: [],
    recordings: [],
    ...overrides,
  };
}

function renderCard(overrides: Partial<MyArchivedLessonDto> = {}) {
  return render(<ArchivedLessonCard lesson={makeLesson(overrides)} timeZone={TZ} />);
}

describe('ArchivedLessonCard — название, дата, тема', () => {
  it('заголовок строки — название занятия; дата в заданном поясе, группа и тема', () => {
    renderCard();
    expect(screen.getByText('Тайцзицюань')).toBeInTheDocument();
    expect(screen.getByText('Вт, 8 сентября, 19:00')).toBeInTheDocument();
    expect(screen.getByText('Средняя группа · Форма 24')).toBeInTheDocument();
  });

  it('ни группы, ни темы — строки метаданных нет вовсе', () => {
    renderCard({ groupLabel: '', topic: '' });
    expect(screen.getByText('Тайцзицюань')).toBeInTheDocument();
    expect(screen.queryByText('·')).not.toBeInTheDocument();
  });
});

describe('ArchivedLessonCard — записи', () => {
  it('без записей — честная строка «Записи нет», без ссылок', () => {
    renderCard({ recordings: [] });
    expect(screen.getByText('Записи нет')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('запись со ссылкой — «Открыть запись» ведёт по адресу в новой вкладке', () => {
    renderCard({
      recordings: [{ title: 'Занятие целиком', url: 'https://cloud.example/rec' }],
    });
    const link = screen.getByRole('link', { name: 'Открыть запись' });
    expect(link).toHaveAttribute('href', 'https://cloud.example/rec');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByText('Занятие целиком')).toBeInTheDocument();
  });

  it('запись без своего title — только «Открыть запись», без пустой подписи', () => {
    renderCard({ recordings: [{ url: 'https://cloud.example/rec' }] });
    expect(screen.getByRole('link', { name: 'Открыть запись' })).toBeInTheDocument();
  });

  it('запись inTelegramOnly — не кнопка, а объяснение, мёртвой ссылки нет', () => {
    renderCard({ recordings: [{ title: 'В канале', inTelegramOnly: true }] });
    expect(
      screen.getByText('Запись ушла в канал школы — ищите её там под датой занятия.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('несколько записей — каждая своей строкой', () => {
    renderCard({
      recordings: [
        { title: 'Занятие целиком', url: 'https://cloud.example/rec-1' },
        { title: 'В канале', inTelegramOnly: true },
      ],
    });
    expect(screen.getByRole('link', { name: 'Открыть запись' })).toHaveAttribute(
      'href',
      'https://cloud.example/rec-1',
    );
    expect(
      screen.getByText('Запись ушла в канал школы — ищите её там под датой занятия.'),
    ).toBeInTheDocument();
  });
});

describe('ArchivedLessonCard — отменено', () => {
  it('прошедшее отменённое занятие помечено «Занятие отменено»', () => {
    renderCard({ status: 'cancelled' });
    expect(screen.getByText('Занятие отменено')).toBeInTheDocument();
  });

  it('не отменённое — без пометки', () => {
    renderCard({ status: 'scheduled' });
    expect(screen.queryByText('Занятие отменено')).not.toBeInTheDocument();
  });
});
