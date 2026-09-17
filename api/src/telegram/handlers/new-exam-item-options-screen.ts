// Экраны шагов 'options'/'correct' диалога «Новый вопрос» (ТЗ 4б.3,
// docs/PLAN.md §12) — вынесено из new-exam-item-screens.ts (файл-лимит 150
// строк, CLAUDE.md «Храповики»). Чистая логика без Mongo и без Telegram.
import { formatOptionLabel, type ExamItemKind } from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';
import type { NewExamItemDraftOption } from '../new-exam-item-draft-wait';
import type { BotMenu } from './bot-menu';
import { correctCount, newExamItemCancelButton } from './new-exam-item-types';

const DONE_LABEL = 'Готово';

function optionLine(option: NewExamItemDraftOption, index: number): string {
  return `${index + 1}. ${formatOptionLabel(option.text, index)}`;
}

/** Список вариантов для итогового экрана (new-exam-item-screens.ts,
 * confirmScreen) — верные отмечены звёздочкой: символ, не слово, короче
 * строки в тесном экране Telegram. */
export function formatOptionsSummary(options: readonly NewExamItemDraftOption[]): string {
  const lines = options.map(
    (option, index) => `${optionLine(option, index)}${option.correct ? ' — верно' : ''}`,
  );
  return `Варианты:\n${lines.join('\n')}`;
}

export function optionsWaitScreen(options: readonly NewExamItemDraftOption[]): BotMenu {
  const header =
    options.length === 0
      ? 'Пришлите первый вариант ответа отдельным сообщением.'
      : `Добавлено вариантов: ${options.length}.\n` +
        options.map((o, i) => optionLine(o, i)).join('\n') +
        '\n\nПришлите ещё один или нажмите «Готово».';
  return {
    text: header,
    buttons: [[inlineButton(DONE_LABEL, 'nqd', 'options')], newExamItemCancelButton()],
  };
}

function optionToggleButtons(
  options: readonly NewExamItemDraftOption[],
): InlineKeyboardButton[][] {
  return options.map((option, index) => [
    inlineButton(
      `${option.correct ? '✓ ' : ''}${formatOptionLabel(option.text, index)}`,
      'nqo',
      String(index),
    ),
  ]);
}

/** `single` — нажатие сразу отмечает вариант и переходит дальше (та же
 * механика, что у ответа ученика на single-вопрос, exam-attempt-answer.ts):
 * «Готово» ему не нужно, ровно один верный гарантирован самим переходом.
 * `multiple` — переключатели плюс «Готово», доступное только когда отмечен
 * хоть один (иначе некуда переходить, ТЗ 4б.3). */
export function correctWaitScreen(
  kind: ExamItemKind,
  options: readonly NewExamItemDraftOption[],
): BotMenu {
  const text =
    kind === 'single'
      ? 'Какой вариант верный?'
      : 'Отметьте все верные варианты, потом нажмите «Готово».';
  const toggles = optionToggleButtons(options);
  if (kind === 'single')
    return { text, buttons: [...toggles, newExamItemCancelButton()] };
  const doneRow =
    correctCount(options) > 0 ? [[inlineButton(DONE_LABEL, 'nqd', 'correct')]] : [];
  return { text, buttons: [...toggles, ...doneRow, newExamItemCancelButton()] };
}
