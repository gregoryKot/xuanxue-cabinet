import { describe, expect, it } from 'vitest';
import { formatLessonPrefsStats, LESSON_PREFS_NOBODY_TEXT } from './lessonPrefsStatsText';

function stats(activeStudents: number, chosenClasses: number, ownReminder: number) {
  return { activeStudents, chosenClasses, ownReminder };
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

  it('выбрали и занятия, и время — обе цифры, факты в акцентах', () => {
    expect(formatLessonPrefsStats(stats(40, 5, 3))).toBe(
      'Свои занятия выбрали **5 из 40** учеников, своё время напоминания — **3**.',
    );
  });

  it('только занятия — про время сказано честно, что не выбирал никто', () => {
    expect(formatLessonPrefsStats(stats(40, 5, 0))).toBe(
      'Свои занятия выбрали **5 из 40** учеников, своё время напоминания не выбирал никто.',
    );
  });

  it('только время — про занятия сказано, что не выбирал никто', () => {
    expect(formatLessonPrefsStats(stats(40, 0, 3))).toBe(
      'Своё время напоминания выбрали **3 из 40** учеников, свои занятия не выбирал никто.',
    );
  });

  it('единственное число: «выбрал 1 из 21 ученика»', () => {
    expect(formatLessonPrefsStats(stats(21, 1, 0))).toBe(
      'Свои занятия выбрал **1 из 21** ученика, своё время напоминания не выбирал никто.',
    );
  });

  it('склонение «ученика/учеников» и глагола по числам: 1, 2–4, 11, 12, 21', () => {
    const students = (total: number) =>
      formatLessonPrefsStats(stats(total, 1, 1)).match(/из \d+\*\* ([а-яё]+)/)?.[1];
    const verb = (chosen: number) =>
      formatLessonPrefsStats(stats(100, chosen, 1)).match(/занятия (\S+) /)?.[1];

    expect(students(1)).toBe('ученика');
    expect(students(2)).toBe('учеников');
    expect(students(11)).toBe('учеников');
    expect(students(12)).toBe('учеников');
    expect(students(21)).toBe('ученика');
    expect(verb(1)).toBe('выбрал');
    expect(verb(3)).toBe('выбрали');
    expect(verb(11)).toBe('выбрали');
    expect(verb(21)).toBe('выбрал');
  });

  it('все выбрали — «40 из 40» без сюрпризов', () => {
    expect(formatLessonPrefsStats(stats(40, 40, 40))).toBe(
      'Свои занятия выбрали **40 из 40** учеников, своё время напоминания — **40**.',
    );
  });
});
