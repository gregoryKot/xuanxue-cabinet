import { describe, expect, it } from 'vitest';
import { formatLessonPrefsStats, LESSON_PREFS_NOBODY_TEXT } from './lessonPrefsStatsText';

function stats(activeStudents: number, withReminders: number, ownReminder: number) {
  return { activeStudents, withReminders, ownReminder };
}

describe('formatLessonPrefsStats', () => {
  it('пустая база — честная фраза, не «0 из 0» и не NaN', () => {
    const text = formatLessonPrefsStats(stats(0, 0, 0));

    expect(text).toBe(LESSON_PREFS_NOBODY_TEXT);
    expect(text).not.toMatch(/NaN|0 из 0/);
  });

  it('ученики есть, никто не выбирал — та же честная фраза, без «0 из 40»', () => {
    expect(formatLessonPrefsStats(stats(40, 0, 0))).toBe(LESSON_PREFS_NOBODY_TEXT);
  });

  it('отметили и занятия, и время — обе цифры, факты в акцентах', () => {
    expect(formatLessonPrefsStats(stats(40, 5, 3))).toBe(
      'Занятия для напоминаний отметили **5 из 40** учеников, своё время напоминания — **3**.',
    );
  });

  it('только занятия — про время сказано честно, что не выбирал никто', () => {
    expect(formatLessonPrefsStats(stats(40, 5, 0))).toBe(
      'Занятия для напоминаний отметили **5 из 40** учеников, своё время напоминания не выбирал никто.',
    );
  });

  it('только время — про занятия сказано, что не отмечал никто', () => {
    expect(formatLessonPrefsStats(stats(40, 0, 3))).toBe(
      'Своё время напоминания выбрали **3 из 40** учеников, занятия для напоминаний не отмечал никто.',
    );
  });

  it('единственное число: «отметил 1 из 21 ученика»', () => {
    expect(formatLessonPrefsStats(stats(21, 1, 0))).toBe(
      'Занятия для напоминаний отметил **1 из 21** ученика, своё время напоминания не выбирал никто.',
    );
  });

  it('склонение «ученика/учеников» и глагола по числам: 1, 2–4, 11, 12, 21', () => {
    const students = (total: number) =>
      formatLessonPrefsStats(stats(total, 1, 1)).match(/из \d+\*\* ([а-яё]+)/)?.[1];
    const verb = (marked: number) =>
      formatLessonPrefsStats(stats(100, marked, 1)).match(/напоминаний (\S+) /)?.[1];

    expect(students(1)).toBe('ученика');
    expect(students(2)).toBe('учеников');
    expect(students(11)).toBe('учеников');
    expect(students(12)).toBe('учеников');
    expect(students(21)).toBe('ученика');
    expect(verb(1)).toBe('отметил');
    expect(verb(3)).toBe('отметили');
    expect(verb(11)).toBe('отметили');
    expect(verb(21)).toBe('отметил');
  });

  it('все ответили — «40 из 40» без сюрпризов', () => {
    expect(formatLessonPrefsStats(stats(40, 40, 40))).toBe(
      'Занятия для напоминаний отметили **40 из 40** учеников, своё время напоминания — **40**.',
    );
  });
});
