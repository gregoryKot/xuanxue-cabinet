// Текст письма учителю/помощнику «ученик сдал работу» (слой 4.7, PLAN §11,
// ADR-0039) — почтовый резерв TelegramExamNotifier.notifyAttemptSubmitted:
// то же сообщение, что в боте (attempt-submitted-message.ts), но с
// приветствием и темой письма — жанр другой (docs/VOICE.md), смысл тот же.
// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
export interface ExamMail {
  subject: string;
  text: string;
}

export function attemptSubmittedMail(
  studentName: string,
  examTitle: string,
  attemptId: string,
  publicUrl: string | undefined,
): ExamMail {
  const lines = [
    'Здравствуйте!',
    '',
    `Работа от ${studentName} по «${examTitle}» — ждёт вашей проверки.`,
  ];
  if (publicUrl) lines.push('', `Проверить: ${publicUrl}/grading/${attemptId}`);
  return { subject: `Сдана работа: ${examTitle}`, text: lines.join('\n') };
}
