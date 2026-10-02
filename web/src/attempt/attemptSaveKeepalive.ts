// Слать ли PATCH ответов с `keepalive` (аудит 2026-10-01, F43): flush с
// pagehide/visibilitychange шёл обычным fetch, и браузер вправе оборвать его
// вместе с вкладкой — ответ оставался только в localStorage-черновике, а
// если ученик до дедлайна попытку не открывал, сервер закрывал её без него.
// Чистая функция без React и сети (CLAUDE.md «Тесты»).
//
// Порог — в байтах, не в знаках: ответы кириллицей весят два байта на знак,
// а восстановленный большой черновик (до ANSWERS_PER_REQUEST_MAX ответов по
// ATTEMPT_LIMITS.answerText знаков) может перерасти потолок keepalive — тогда
// Chrome бросает TypeError синхронно и запрос не уходит вовсе. Такое тело
// идёт обычным fetch: пусть с риском обрыва, но хотя бы с шансом дойти.
import { KEEPALIVE_BODY_MAX_BYTES } from '../api/http';

/** `true` — только когда вызывающий просил keepalive и тело в него влезает;
 * иначе `undefined`, чтобы запрос ушёл ровно так же, как до этой проверки. */
export function keepaliveFor(
  body: unknown,
  requested: boolean | undefined,
): true | undefined {
  if (!requested) return undefined;
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length;
  return bytes <= KEEPALIVE_BODY_MAX_BYTES ? true : undefined;
}
