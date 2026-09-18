// Строка занятия ученика (ТЗ student-screen.md, п.2/п. «Тесты») — своя
// проверка на каждый случай, без сети и без DI: чистый рендер по MyLessonDto.
// Время — с фиксированным поясом (Asia/Jerusalem), не поясом машины: CI
// гоняет vitest ещё и под TZ=Australia/Sydney (CLAUDE.md «Время»).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MyLessonDto } from '@xuanxue/shared';
import { StudentLessonCard } from './StudentLessonCard';

const TZ = 'Asia/Jerusalem';

function makeLesson(overrides: Partial<MyLessonDto> = {}): MyLessonDto {
  return {
    id: 'l1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    classTitle: 'Тайцзицюань',
    groupLabel: 'Средняя группа',
    format: 'online',
    topic: 'Пятое занятие цикла',
    status: 'scheduled',
    ...overrides,
  };
}

function renderCard(overrides: Partial<MyLessonDto> = {}) {
  return render(<StudentLessonCard lesson={makeLesson(overrides)} timeZone={TZ} />);
}

describe('StudentLessonCard — название, день, время', () => {
  it('заголовок строки — название занятия; дата в заданном поясе, группа и тема', () => {
    renderCard();
    expect(screen.getByText('Тайцзицюань')).toBeInTheDocument();
    expect(screen.getByText('Вт, 8 сентября, 19:00')).toBeInTheDocument();
    expect(screen.getByText('Средняя группа · Пятое занятие цикла')).toBeInTheDocument();
  });

  it('без темы — строка группы без пустого «·»', () => {
    renderCard({ topic: '' });
    expect(screen.getByText('Средняя группа')).toBeInTheDocument();
  });

  it('ни группы, ни темы — строки метаданных нет вовсе', () => {
    renderCard({ groupLabel: '', topic: '' });
    expect(screen.getByText('Тайцзицюань')).toBeInTheDocument();
    expect(screen.queryByText('·')).not.toBeInTheDocument();
  });
});

describe('StudentLessonCard — онлайн', () => {
  it('со ссылкой и паролем — ссылка «Подключиться» и пароль рядом', () => {
    renderCard({
      format: 'online',
      zoomLink: 'https://zoom.us/j/123',
      zoomPassword: '4321',
    });
    const link = screen.getByRole('link', { name: 'Подключиться' });
    expect(link).toHaveAttribute('href', 'https://zoom.us/j/123');
    expect(screen.getByText('Пароль: 4321')).toBeInTheDocument();
  });

  it('без пароля — ссылка без строки пароля', () => {
    renderCard({ format: 'online', zoomLink: 'https://zoom.us/j/123' });
    expect(screen.getByRole('link', { name: 'Подключиться' })).toBeInTheDocument();
    expect(screen.queryByText(/Пароль/)).not.toBeInTheDocument();
  });

  it('без ссылки — честная строка вместо ссылки', () => {
    renderCard({ format: 'online', zoomLink: undefined });
    expect(screen.queryByRole('link', { name: 'Подключиться' })).not.toBeInTheDocument();
    expect(screen.getByText('Ссылку пришлём в канал.')).toBeInTheDocument();
  });
});

describe('StudentLessonCard — офлайн', () => {
  it('с адресом — строка адреса', () => {
    renderCard({ format: 'offline', location: 'Зал на Ротшильда, 12' });
    expect(screen.getByText('Зал на Ротшильда, 12')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('без адреса — честная строка вместо пустоты', () => {
    renderCard({ format: 'offline', location: undefined });
    expect(screen.getByText('Адрес пришлём в канал.')).toBeInTheDocument();
  });
});

describe('StudentLessonCard — офлайн + онлайн', () => {
  it('оба блока сразу — ссылка на Zoom и адрес', () => {
    renderCard({
      format: 'both',
      zoomLink: 'https://zoom.us/j/123',
      location: 'Зал на Ротшильда, 12',
    });
    expect(screen.getByRole('link', { name: 'Подключиться' })).toBeInTheDocument();
    expect(screen.getByText('Зал на Ротшильда, 12')).toBeInTheDocument();
  });
});

describe('StudentLessonCard — отменено', () => {
  it('помечено «Занятие отменено», ссылки на встречу не предлагает', () => {
    renderCard({
      status: 'cancelled',
      format: 'online',
      zoomLink: 'https://zoom.us/j/123',
    });
    expect(screen.getByText('Занятие отменено')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Подключиться' })).not.toBeInTheDocument();
  });
});
