// Кому нужны настройки напоминаний и когда лента зовёт отметить занятия
// (lessonReminderVisibility.ts, ADR-0185).
import { describe, expect, it } from 'vitest';
import {
  REMINDER_SYNC_VERSION,
  type NotificationKind,
  type ReminderSyncSnapshot,
} from '@xuanxue/shared';
import { makeMe } from '../test-support/meFixture';
import { hasLessonSettings, isReminderHintDue } from './lessonReminderVisibility';

describe('hasLessonSettings', () => {
  it('пока `me` не пришёл — нет', () => {
    expect(hasLessonSettings(null)).toBe(false);
  });

  it('ученик без ролей — да', () => {
    expect(hasLessonSettings(makeMe({ roles: [] }))).toBe(true);
  });

  it.each(['teacher', 'assistant', 'admin', 'accountant'] as const)(
    'штат (%s) — нет: вида про занятие у него нет',
    (role) => {
      expect(hasLessonSettings(makeMe({ roles: [role] }))).toBe(false);
    },
  );
});

const SOON: NotificationKind = 'lesson_soon';

const snapshot = (over: Partial<ReminderSyncSnapshot> = {}): ReminderSyncSnapshot => ({
  version: REMINDER_SYNC_VERSION,
  accountId: 'u1',
  revision: '0',
  classIds: [],
  lessonIds: [],
  leadMinutes: null,
  schoolMinutes: 60,
  classes: [
    {
      id: 'c1',
      title: 'Утро',
      groupLabel: '',
      tz: 'Asia/Jerusalem',
      slots: [{ weekday: 1, time: '07:00', durationMin: 60 }],
    },
  ],
  ...over,
});

const due = (over: Partial<Parameters<typeof isReminderHintDue>[0]> = {}) =>
  isReminderHintDue({
    kinds: [SOON],
    enabled: [SOON],
    snapshot: snapshot(),
    ...over,
  });

describe('isReminderHintDue', () => {
  it('напоминания включены, выбора нет, занятия в школе есть — зовём', () => {
    expect(due()).toBe(true);
  });

  it('выбрано занятие расписания — не зовём', () => {
    expect(due({ snapshot: snapshot({ classIds: ['c1'] }) })).toBe(false);
  });

  it('выбрано отдельное занятие — не зовём', () => {
    expect(due({ snapshot: snapshot({ lessonIds: ['l1'] }) })).toBe(false);
  });

  it('в расписании школы нет занятий — отмечать нечего, не зовём', () => {
    expect(due({ snapshot: snapshot({ classes: [] }) })).toBe(false);
  });

  it('человек выключил «Занятие скоро» — не зовём', () => {
    expect(due({ enabled: [] })).toBe(false);
  });

  it('вид недоступен по роли — не зовём', () => {
    expect(due({ kinds: [] })).toBe(false);
  });

  it('нет данных о включённых видах или снимка — не зовём', () => {
    expect(due({ enabled: null })).toBe(false);
    expect(due({ snapshot: null })).toBe(false);
  });
});
