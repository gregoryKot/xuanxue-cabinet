// Экраны диалога «Новый вопрос» (ТЗ 4б.3, docs/PLAN.md §12) — без вариантов
// ответа: screen 1 (тип), формулировка, критерии, итог. Экраны с вариантами
// (шаги 'options'/'correct') — new-exam-item-options-screen.ts (файл-лимит
// 150 строк). Чистая логика без Mongo и без Telegram — юнит-тест как у
// exam-question-screen.ts.
import { EXAM_ITEM_KINDS, type ExamItemKind } from '@xuanxue/shared';
import { inlineButton } from '../callback-data';
import type { NewExamItemDraft } from '../new-exam-item-draft-wait';
import type { BotMenu } from './bot-menu';
import { formatOptionsSummary } from './new-exam-item-options-screen';
import {
  EXAM_ITEM_KIND_HINTS_BOT_RU,
  EXAM_ITEM_KIND_LABELS_BOT_RU,
  hasOptionsStep,
  newExamItemCancelButton,
} from './new-exam-item-types';

// Пункты списка — только подсказка: сам тип ответа называет кнопка под
// текстом, повторять его ярлык в списке незачем (кнопки ниже — в том же
// порядке, что EXAM_ITEM_KINDS).
const KIND_SCREEN_TEXT =
  'Заведём вопрос. Выберите тип ответа:\n\n' +
  EXAM_ITEM_KINDS.map((kind) => `• ${EXAM_ITEM_KIND_HINTS_BOT_RU[kind]}.`).join('\n');

export function kindSelectScreen(): BotMenu {
  return {
    text: KIND_SCREEN_TEXT,
    buttons: [
      ...EXAM_ITEM_KINDS.map((kind) => [
        inlineButton(EXAM_ITEM_KIND_LABELS_BOT_RU[kind], 'nqk', kind),
      ]),
      newExamItemCancelButton(),
    ],
  };
}

export function promptWaitScreen(): BotMenu {
  return {
    text: 'Пришлите формулировку вопроса одним сообщением.',
    buttons: [newExamItemCancelButton()],
  };
}

const SKIP_LABEL = 'Пропустить';

export function criteriaWaitScreen(): BotMenu {
  return {
    text:
      'Есть критерии проверки? Пришлите их одним сообщением или нажмите ' +
      '«Пропустить» — критерии видит только учитель.',
    buttons: [[inlineButton(SKIP_LABEL, 'nqf', 'skip')], newExamItemCancelButton()],
  };
}

/** Ошибка DTO-валидации (validateExamItemDraft) на любом шаге — тот же
 * экран, что и был, плюс список того, что поправить, сверху (CLAUDE.md
 * «Ошибки»: что случилось и что сделать). */
export function withValidationErrors(screen: BotMenu, errors: string[]): BotMenu {
  return { ...screen, text: `${errors.join('\n')}\n\n${screen.text}` };
}

function summaryLine(label: string, value: string): string {
  return `${label}: ${value}`;
}

const SAVE_LABEL = 'Сохранить';
const CONFIRM_QUESTION = 'Всё верно?';

export function confirmScreen(draft: NewExamItemDraft): BotMenu {
  const kind = draft.kind as ExamItemKind;
  const lines = [
    'Проверьте вопрос:',
    summaryLine('Тип', EXAM_ITEM_KIND_LABELS_BOT_RU[kind]),
    summaryLine('Формулировка', draft.prompt ?? ''),
  ];
  if (hasOptionsStep(kind)) lines.push(formatOptionsSummary(draft.options));
  if (draft.criteria) lines.push(summaryLine('Критерии проверки', draft.criteria));
  lines.push(CONFIRM_QUESTION);
  return {
    text: lines.join('\n\n'),
    buttons: [[inlineButton(SAVE_LABEL, 'nqf', 'save')], newExamItemCancelButton()],
  };
}
