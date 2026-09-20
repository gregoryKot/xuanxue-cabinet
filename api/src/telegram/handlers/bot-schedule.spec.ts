// Чистая логика форматирования, без Mongo (CLAUDE.md «Тесты»). Подбор занятий
// проверен отдельно, в my-lessons.service.spec.ts — здесь только текст экрана.
import type { MyLessonDto } from '@xuanxue/shared';
import { formatScheduleScreen } from './bot-schedule';

function lesson(overrides: Partial<MyLessonDto> = {}): MyLessonDto {
  return {
    id: 'l1',
    startsAt: '2026-09-10T17:00:00.000Z',
    durationMin: 60,
    classTitle: 'Цигун для глаз',
    groupLabel: 'группа А',
    format: 'online',
    topic: '',
    status: 'scheduled',
    tags: [],
    ...overrides,
  };
}

describe('formatScheduleScreen', () => {
  it('нет занятий — честная фраза, кнопка «Назад»', () => {
    const screen = formatScheduleScreen([]);
    expect(screen.text).toBe('Ближайших занятий нет.');
    expect(screen.buttons).toEqual([[{ text: 'В меню', callback_data: 'menu:back' }]]);
  });

  it('онлайн-занятие со ссылкой — ссылка и пароль в тексте', () => {
    const screen = formatScheduleScreen([
      lesson({ zoomLink: 'https://zoom.us/j/1', zoomPassword: '4321' }),
    ]);
    expect(screen.text).toContain('Цигун для глаз, 10.09 20:00');
    expect(screen.text).toContain('Zoom: https://zoom.us/j/1 (пароль 4321)');
  });

  it('онлайн-занятие без ссылки — честная фраза, не пустота', () => {
    const screen = formatScheduleScreen([lesson({ zoomLink: undefined })]);
    expect(screen.text).toContain('Ссылку пришлём в канал.');
  });

  it('офлайн-занятие — адрес или честная фраза', () => {
    const withAddress = formatScheduleScreen([
      lesson({ format: 'offline', location: 'ул. Ленина, 1' }),
    ]);
    expect(withAddress.text).toContain('ул. Ленина, 1');

    const withoutAddress = formatScheduleScreen([lesson({ format: 'offline' })]);
    expect(withoutAddress.text).toContain('Адрес пришлём в канал.');
  });

  it('формат both — и ссылка, и адрес', () => {
    const screen = formatScheduleScreen([
      lesson({ format: 'both', zoomLink: 'https://zoom.us/j/1', location: 'зал 2' }),
    ]);
    expect(screen.text).toContain('Zoom: https://zoom.us/j/1');
    expect(screen.text).toContain('зал 2');
  });

  it('отменённое занятие — пометка, без ссылки/адреса', () => {
    const screen = formatScheduleScreen([
      lesson({ status: 'cancelled', zoomLink: 'https://zoom.us/j/1' }),
    ]);
    expect(screen.text).toContain('— отменено.');
    expect(screen.text).not.toContain('Zoom');
  });

  it('несколько занятий — каждое своим абзацем, в переданном порядке', () => {
    const screen = formatScheduleScreen([
      lesson({ classTitle: 'Первое' }),
      lesson({ classTitle: 'Второе', startsAt: '2026-09-11T17:00:00.000Z' }),
    ]);
    const [first, second] = screen.text.split('\n\n');
    expect(first).toContain('Первое');
    expect(second).toContain('Второе');
  });

  it('переход на летнее время Asia/Jerusalem — одно и то же время школы по обе стороны перехода', () => {
    const before = formatScheduleScreen([
      lesson({ startsAt: '2026-03-24T17:00:00.000Z' }),
    ]);
    const after = formatScheduleScreen([
      lesson({ startsAt: '2026-03-31T16:00:00.000Z' }),
    ]);
    expect(before.text).toContain('24.03 19:00');
    expect(after.text).toContain('31.03 19:00');
  });
});
