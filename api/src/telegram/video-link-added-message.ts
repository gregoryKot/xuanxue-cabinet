// Текст DM учителю/помощнику «ученик прислал ссылку на видео» (ADR-0084).
// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты», образец —
// attempt-submitted-message.ts). «Ссылка от {имя}», не «{имя} прислал(а)» —
// та же причина, что у attemptSubmittedMessage: глагол прошедшего времени
// требовал бы знать пол ученика, которого в данных нет.
//
// Вопрос называется формулировкой, а не номером: номеров у вопроса три
// разных (карточка проверки, сводка бота, форма сдачи), и любой разошёлся бы
// с тем, что учитель видит на экране — см. videoQuestionPromptInSnapshot
// (media/media-item-lookup.ts). Длинную формулировку обрезаем: письмо про
// одну ссылку не должно открываться простынёй на два экрана.
//
// Две ссылки в сообщении, и это не дубль: первая — само видео ученика
// (учитель смотрит его сразу, не заходя никуда), вторая — карточка проверки,
// где ответ можно оценить. Карточка строится от `PUBLIC_URL`: без него —
// сообщение без неё, не «undefined» в тексте (ADR-0009).
const PROMPT_MAX = 100;

export interface VideoLinkAddedMessageInput {
  studentName: string;
  examTitle: string;
  /** `null` — вопрос не определён: строку про вопрос тогда не пишем вовсе,
   * а не оставляем пустой хвост «Вопрос: ». */
  questionPrompt: string | null;
  url: string;
  attemptId: string;
}

function shorten(prompt: string): string {
  return prompt.length > PROMPT_MAX ? `${prompt.slice(0, PROMPT_MAX - 1)}…` : prompt;
}

export function videoLinkAddedMessage(
  input: VideoLinkAddedMessageInput,
  publicUrl: string | undefined,
): string {
  const header = `Ссылка на видео от ${input.studentName} по «${input.examTitle}».`;
  const question = input.questionPrompt
    ? `Вопрос: «${shorten(input.questionPrompt)}»`
    : undefined;
  const card = publicUrl
    ? `Оценить в кабинете: ${publicUrl}/grading/${input.attemptId}`
    : undefined;
  return [header, question, input.url, card]
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
}
