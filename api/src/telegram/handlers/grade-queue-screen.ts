// Экран /проверка (ТЗ 4б.5, PLAN §12) — построчный список сданного и
// непроверенного, каждая строка кнопкой в ту же карточку проверки
// (gradeq:<attemptId>, handleGradeView в grade-callback.handler.ts). Чистая
// логика, без Mongo и без сети (CLAUDE.md «Тесты»), тем же приёмом, что
// buildExamListScreen (exam-list-screen.ts).
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';

const TITLE = 'Сдано, ждёт проверки:';
const EMPTY_TEXT = 'Пока нечего проверять.';
const BUTTON_TITLE_MAX = 40;
// Ученик — единственное поле, которого не бывает у студенческого DTO, но
// точно есть у штатного (ExamAttemptDto.userName, ExamAttemptsService.list) —
// защита в глубину на случай, если порт когда-нибудь примешает список без роли.
const UNKNOWN_STUDENT = 'Ученик';

function truncate(title: string): string {
  return title.length > BUTTON_TITLE_MAX
    ? `${title.slice(0, BUTTON_TITLE_MAX - 1)}…`
    : title;
}

export interface GradeQueueScreen {
  text: string;
  buttons: InlineKeyboardButton[][];
}

export function buildGradeQueueScreen(attempts: ExamAttemptDto[]): GradeQueueScreen {
  if (attempts.length === 0) return { text: EMPTY_TEXT, buttons: [] };

  const lines = attempts.map((attempt, index) => {
    const student = attempt.userName ?? UNKNOWN_STUDENT;
    return `${index + 1}. ${student} — «${attempt.examTitle}»`;
  });
  const buttons = attempts.map((attempt) => [
    inlineButton(
      `Открыть: ${truncate(attempt.userName ?? attempt.examTitle)}`,
      'gradeq',
      attempt.id,
    ),
  ]);
  return { text: `${TITLE}\n\n${lines.join('\n')}`, buttons };
}
