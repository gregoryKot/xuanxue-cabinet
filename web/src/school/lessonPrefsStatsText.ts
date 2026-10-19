// Число для школы к меню уведомлений (ADR-0185): сколько учеников отметили занятия
// для напоминаний и сколько выбрали своё время. Строка живёт на «Шаблонах»
// рядом со школьным «за сколько минут напомнить» (LessonPrefsStats.tsx): штат
// видит, насколько школьная настройка вообще работает для учеников
// (CLAUDE.md «Продуктовая фича = число в своём разделе», ADR-0025).
// Чистая функция без DOM: на пустой базе и «никто не выбирал» — честная фраза,
// а не «0 из 0» и не NaN. Факты выделены `**` (ADR-0124), рисует RichText.
// pluralRu — общий примитив склонения (shared/src/plural-ru.ts).
import { pluralRu, type LessonPrefsStatsDto } from '@xuanxue/shared';

export const LESSON_PREFS_NOBODY_TEXT =
  'Пока никто из учеников не отметил занятия и не выбрал своё время.';

// После «из N» существительное стоит в родительном: «из 21 ученика», «из 40 учеников».
const STUDENT_FORMS = {
  one: 'ученика',
  few: 'учеников',
  many: 'учеников',
  other: 'учеников',
};
// Глагол согласуется с числом ответивших: «отметил 1 из 40», «отметили 5 из 40».
const MARKED_FORMS = {
  one: 'отметил',
  few: 'отметили',
  many: 'отметили',
  other: 'отметили',
};
const CHOSE_FORMS = { one: 'выбрал', few: 'выбрали', many: 'выбрали', other: 'выбрали' };

function share(count: number, total: number): string {
  return `**${count} из ${total}** ${pluralRu(total, STUDENT_FORMS)}`;
}

function marked(count: number): string {
  return pluralRu(count, MARKED_FORMS);
}

function chose(count: number): string {
  return pluralRu(count, CHOSE_FORMS);
}

export function formatLessonPrefsStats(stats: LessonPrefsStatsDto): string {
  const { activeStudents, withReminders, ownReminder } = stats;
  if (activeStudents <= 0 || (withReminders <= 0 && ownReminder <= 0)) {
    return LESSON_PREFS_NOBODY_TEXT;
  }
  if (ownReminder <= 0) {
    return (
      `Занятия для напоминаний ${marked(withReminders)} ${share(withReminders, activeStudents)}, ` +
      'своё время напоминания не выбирал никто.'
    );
  }
  if (withReminders <= 0) {
    return (
      `Своё время напоминания ${chose(ownReminder)} ${share(ownReminder, activeStudents)}, ` +
      'занятия для напоминаний не отмечал никто.'
    );
  }
  return (
    `Занятия для напоминаний ${marked(withReminders)} ${share(withReminders, activeStudents)}, ` +
    `своё время напоминания — **${ownReminder}**.`
  );
}
