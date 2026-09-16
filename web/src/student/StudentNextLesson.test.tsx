// Ближайшее занятие крупно (макет Student.dc.html): время, день словами,
// одно главное действие. Пояс и «сейчас» задаются явно, не берутся у машины:
// CI гоняет vitest ещё и под TZ=Australia/Sydney (CLAUDE.md «Время»).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MyLessonDto } from '@xuanxue/shared';
import { StudentNextLesson } from './StudentNextLesson';

const TZ = 'Asia/Jerusalem';
const NOW = '2026-09-08T05:00:00.000Z';

function makeLesson(overrides: Partial<MyLessonDto> = {}): MyLessonDto {
  return {
    id: 'l1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    classTitle: 'Вечернее занятие',
    groupLabel: 'Средняя группа',
    format: 'online',
    zoomLink: 'https://zoom.us/j/123',
    topic: 'Пятое занятие цикла',
    status: 'scheduled',
    ...overrides,
  };
}

function renderNext(overrides: Partial<MyLessonDto> = {}) {
  return render(
    <StudentNextLesson lesson={makeLesson(overrides)} timeZone={TZ} nowIso={NOW} />,
  );
}

describe('StudentNextLesson', () => {
  it('время в поясе ученика, день словами, название и главное действие', () => {
    renderNext();

    expect(screen.getByText('19:00')).toBeInTheDocument();
    expect(screen.getByText('сегодня')).toBeInTheDocument();
    expect(screen.getByText('Вечернее занятие')).toBeInTheDocument();
    expect(screen.getByText('Средняя группа · Пятое занятие цикла')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Подключиться' })).toHaveAttribute(
      'href',
      'https://zoom.us/j/123',
    );
  });

  it('ни группы, ни темы — строки метаданных нет вовсе, а не пустое «·»', () => {
    renderNext({ groupLabel: '', topic: '' });

    expect(screen.getByText('Вечернее занятие')).toBeInTheDocument();
    expect(screen.queryByText('·')).not.toBeInTheDocument();
  });

  it('занятие завтра — так и подписано', () => {
    renderNext({ startsAt: '2026-09-09T16:00:00.000Z' });

    expect(screen.getByText('завтра')).toBeInTheDocument();
  });

  it('отменённое — сказано прямо, ссылки на встречу нет', () => {
    renderNext({ status: 'cancelled' });

    expect(screen.getByText('Занятие отменено')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
