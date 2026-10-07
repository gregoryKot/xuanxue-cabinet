// Число для школы к меню уведомлений (ADR-0162, п. 5): сколько учеников
// выбрали свои занятия и своё время напоминания. Строка живёт на «Шаблонах»
// рядом со школьным «за сколько минут напомнить» (LessonPrefsStats.tsx): штат
// видит, насколько школьная настройка вообще работает для учеников
// (CLAUDE.md «Продуктовая фича = число в своём разделе», ADR-0025).
// Чистая функция без DOM: на пустой базе и «никто не выбирал» — честная фраза,
// а не «0 из 0» и не NaN. Факты выделены `**` (ADR-0124), рисует RichText.
// pluralRu — общий примитив склонения (shared/src/plural-ru.ts).
import { pluralRu, type LessonPrefsStatsDto } from '@xuanxue/shared';

export const LESSON_PREFS_NOBODY_TEXT =
  'Пока никто из учеников не выбирал свои занятия и время напоминания.';

// После «из N» существительное стоит в родительном: «из 21 ученика», «из 40 учеников».
const STUDENT_FORMS = {
  one: 'ученика',
  few: 'учеников',
  many: 'учеников',
  other: 'учеников',
};
// Глагол согласуется с числом выбравших: «выбрал 1 из 40», «выбрали 5 из 40».
const CHOSE_FORMS = { one: 'выбрал', few: 'выбрали', many: 'выбрали', other: 'выбрали' };

function share(count: number, total: number): string {
  return `**${count} из ${total}** ${pluralRu(total, STUDENT_FORMS)}`;
}

function chose(count: number): string {
  return pluralRu(count, CHOSE_FORMS);
}

export function formatLessonPrefsStats(stats: LessonPrefsStatsDto): string {
  const { activeStudents, chosenClasses, ownReminder } = stats;
  if (activeStudents <= 0 || (chosenClasses <= 0 && ownReminder <= 0)) {
    return LESSON_PREFS_NOBODY_TEXT;
  }
  if (ownReminder <= 0) {
    return (
      `Свои занятия ${chose(chosenClasses)} ${share(chosenClasses, activeStudents)}, ` +
      'своё время напоминания не выбирал никто.'
    );
  }
  if (chosenClasses <= 0) {
    return (
      `Своё время напоминания ${chose(ownReminder)} ${share(ownReminder, activeStudents)}, ` +
      'свои занятия не выбирал никто.'
    );
  }
  return (
    `Свои занятия ${chose(chosenClasses)} ${share(chosenClasses, activeStudents)}, ` +
    `своё время напоминания — **${ownReminder}**.`
  );
}
