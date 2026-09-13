// Чистая функция без Mongo и DI (CLAUDE.md «Тесты» — уровень «чистая
// логика»): собранные из cls/lesson значения на примерах постов из
// docs/PLAN.md §1 — проверяет откуда берётся каждое значение, не сам
// синтаксис renderTemplate (тот уже покрыт shared/src/templates.spec.ts), и
// форма части примеров (например, {минут} — фактический остаток времени, а
// не буквальная копия текста канала) от §1 намеренно отличается.
import { DateTime } from 'luxon';
import { DEFAULT_TEMPLATES } from '@xuanxue/shared';
import { renderLessonPost, type RenderLessonPostParams } from './post-renderer';

const TEMPLATES = DEFAULT_TEMPLATES;

const DEFAULT_CLS = {
  title: 'цигун для глаз',
  groupLabel: '',
  zoomLink: 'https://us02web.zoom.us/j/1',
  zoomPassword: '11111',
  tz: 'Asia/Jerusalem',
  leadMinutes: 10,
};

const DEFAULT_LESSON = {
  topic: '',
  startsAt: new Date('2026-09-06T16:00:00.000Z'),
  durationMin: 60,
};

function baseParams(
  overrides: Partial<RenderLessonPostParams> = {},
): RenderLessonPostParams {
  const cls = overrides.cls ?? DEFAULT_CLS;
  const lesson = overrides.lesson ?? DEFAULT_LESSON;
  // По умолчанию «сейчас» — ровно leadMinutes до начала: так рассылка и
  // создаётся в штатном случае (planLesson шлёт в момент входа в окно), и
  // {минут} совпадает с прежними буквальными примерами постов.
  const now = DateTime.fromJSDate(lesson.startsAt, { zone: 'utc' }).minus({
    minutes: cls.leadMinutes,
  });
  return { cls, lesson, templates: TEMPLATES, now, ...overrides };
}

describe('renderLessonPost — подстановки на примерах постов (PLAN.md §1)', () => {
  it('анонс с паролем, без группы и темы', () => {
    expect(renderLessonPost('lesson_link', baseParams())).toBe(
      'Через 10 минут цигун для глаз. Запись будет выложена для всех, кто не может участвовать.\nhttps://us02web.zoom.us/j/1 пароль 11111',
    );
  });

  it('анонс с группой и темой, ссылка с паролем внутри — {пароль} не дублируется', () => {
    const params = baseParams({
      cls: {
        title: 'Тайцзицюань онлайн',
        groupLabel: 'СРЕДНЯЯ ГРУППА',
        zoomLink: 'https://us02web.zoom.us/j/2?pwd=x',
        tz: 'Asia/Jerusalem',
        leadMinutes: 30,
      },
      lesson: {
        topic: 'пятое занятие цикла «Шаги назад: стопы и позвоночник»',
        startsAt: new Date('2026-09-06T16:00:00.000Z'),
        durationMin: 90,
      },
    });

    expect(renderLessonPost('lesson_link', params)).toBe(
      'СРЕДНЯЯ ГРУППА\nЧерез 30 минут Тайцзицюань онлайн: пятое занятие цикла «Шаги назад: стопы и позвоночник». Запись будет выложена для всех, кто не может участвовать.\nhttps://us02web.zoom.us/j/2?pwd=x',
    );
  });

  it('запись со всеми полями', () => {
    const params = baseParams({
      recording: {
        title: 'Самомассаж (нижняя часть лица, МФР, сидя)',
        url: 'https://drive.google.com/file/d/x',
      },
      lesson: {
        topic: '',
        startsAt: new Date('2026-09-06T16:00:00.000Z'),
        durationMin: 30,
      },
      leaderName: 'Мария',
    });

    expect(renderLessonPost('recording', params)).toBe(
      'Самомассаж (нижняя часть лица, МФР, сидя), ведёт Мария — https://drive.google.com/file/d/x',
    );
  });

  it('переопределённая ссылка на занятие — свой пароль, не пароль класса', () => {
    const params = baseParams({
      lesson: {
        topic: '',
        startsAt: new Date('2026-09-06T16:00:00.000Z'),
        durationMin: 60,
        zoomLinkOverride: 'https://us02web.zoom.us/j/override',
        zoomPasswordOverride: '22222',
      },
    });

    const text = renderLessonPost('lesson_link', params);

    expect(text).toContain('https://us02web.zoom.us/j/override пароль 22222');
    expect(text).not.toContain('11111');
  });

  it('переопределена только ссылка, без своего пароля — пароль класса не подставляется', () => {
    const params = baseParams({
      lesson: {
        topic: '',
        startsAt: new Date('2026-09-06T16:00:00.000Z'),
        durationMin: 60,
        zoomLinkOverride: 'https://us02web.zoom.us/j/override',
      },
    });

    const text = renderLessonPost('lesson_link', params);

    expect(text).toBe(
      'Через 10 минут цигун для глаз. Запись будет выложена для всех, кто не может участвовать.\nhttps://us02web.zoom.us/j/override',
    );
  });

  it('{время} — startsAt в поясе класса, зимнее время Израиля (UTC+2)', () => {
    const params = baseParams({
      templates: { lesson_link: '{время}', recording: '' },
      cls: { ...DEFAULT_CLS, title: 'т', groupLabel: '' },
      lesson: {
        topic: '',
        startsAt: new Date('2026-03-20T17:30:00.000Z'), // 19:30 в Израиле (UTC+2 зимой)
        durationMin: 60,
      },
    });

    expect(renderLessonPost('lesson_link', params)).toBe('19:30');
  });

  it('{время} — летнее время Израиля (UTC+3)', () => {
    const params = baseParams({
      templates: { lesson_link: '{время}', recording: '' },
      cls: { ...DEFAULT_CLS, title: 'т', groupLabel: '' },
      lesson: {
        topic: '',
        startsAt: new Date('2026-07-15T16:00:00.000Z'), // 19:00 в Израиле (UTC+3 летом)
        durationMin: 60,
      },
    });

    expect(renderLessonPost('lesson_link', params)).toBe('19:00');
  });

  it('{время} — граница перехода на летнее время (март): час пропадает', () => {
    const before = baseParams({
      templates: { lesson_link: '{время}', recording: '' },
      cls: { ...DEFAULT_CLS, title: 'т', groupLabel: '' },
      lesson: {
        topic: '',
        startsAt: new Date('2026-03-26T23:30:00.000Z'), // 01:30 (+02:00), ещё зима
        durationMin: 60,
      },
    });
    const after = baseParams({
      templates: { lesson_link: '{время}', recording: '' },
      cls: { ...DEFAULT_CLS, title: 'т', groupLabel: '' },
      lesson: {
        topic: '',
        startsAt: new Date('2026-03-27T00:30:00.000Z'), // 03:30 (+03:00), уже лето — 02:xx не существует
        durationMin: 60,
      },
    });

    expect(renderLessonPost('lesson_link', before)).toBe('01:30');
    expect(renderLessonPost('lesson_link', after)).toBe('03:30');
  });

  it('{время} — граница перехода на зимнее время (октябрь): час повторяется', () => {
    const before = baseParams({
      templates: { lesson_link: '{время}', recording: '' },
      cls: { ...DEFAULT_CLS, title: 'т', groupLabel: '' },
      lesson: {
        topic: '',
        startsAt: new Date('2026-10-24T21:30:00.000Z'), // 00:30 (+03:00), ещё лето
        durationMin: 60,
      },
    });
    const after = baseParams({
      templates: { lesson_link: '{время}', recording: '' },
      cls: { ...DEFAULT_CLS, title: 'т', groupLabel: '' },
      lesson: {
        topic: '',
        startsAt: new Date('2026-10-25T00:30:00.000Z'), // 02:30 (+02:00), уже зима
        durationMin: 60,
      },
    });

    expect(renderLessonPost('lesson_link', before)).toBe('00:30');
    expect(renderLessonPost('lesson_link', after)).toBe('02:30');
  });

  it('{минут} — фактический остаток до начала, не classes.leadMinutes', () => {
    const startsAt = new Date('2026-09-06T16:00:00.000Z');
    const params = baseParams({
      templates: { lesson_link: '{минут}', recording: '' },
      cls: { ...DEFAULT_CLS, leadMinutes: 30 },
      lesson: { ...DEFAULT_LESSON, startsAt },
      // Тик опоздал: leadMinutes класса — 30, а реально осталось 27.
      now: DateTime.fromJSDate(startsAt, { zone: 'utc' }).minus({ minutes: 27 }),
    });

    expect(renderLessonPost('lesson_link', params)).toBe('27');
  });

  it('{минут} — тик опоздал за само занятие, но не больше DEFAULT_LEAD_MINUTES — минимум 1, не 0 и не минус', () => {
    const startsAt = new Date('2026-09-06T16:00:00.000Z');
    const params = baseParams({
      templates: { lesson_link: '{минут}', recording: '' },
      lesson: { ...DEFAULT_LESSON, startsAt },
      now: DateTime.fromJSDate(startsAt, { zone: 'utc' }).plus({ minutes: 5 }),
    });

    expect(renderLessonPost('lesson_link', params)).toBe('1');
  });
});
