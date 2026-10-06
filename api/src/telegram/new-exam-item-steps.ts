// Шаги диалога заведения вопроса (ТЗ 4б.3) — 'kind' среди них нет: тип
// выбирают кнопкой ДО первой записи в bot_sessions (new-exam-item-screens.ts),
// сессия заводится только с шага 'prompt'. 'options'/'correct' пропускаются у
// text/video (у них вариантов не бывает, exam-item-options.ts) — сразу
// 'prompt' → 'confirm'. Шаг 'criteria' убран вместе с самим полем вопроса
// (ADR-0128).
//
// Отдельным файлом по той же причине, что new-exam-steps.ts: схема
// bot-session.schema.ts выше потолка в 150 строк и растёт только через
// --update (CLAUDE.md «Храповики»); поля ожидания записи (ADR-0172) заняли
// её место.
export const NEW_EXAM_ITEM_STEPS = ['prompt', 'options', 'correct', 'confirm'] as const;
export type NewExamItemStep = (typeof NEW_EXAM_ITEM_STEPS)[number];
