// Экран отметки вопросов диалога «Собрать экзамен» (шаг 'pick', ТЗ 4б.4,
// docs/PLAN.md §12) — вынесено из new-exam-callback.ts (файл-лимит 150
// строк, CLAUDE.md «Храповики»). Чистая логика без Mongo и без Telegram:
// список вопросов уже отфильтрован по «опубликован» вызывающим кодом
// (ExamBotPort.listExamItemsToAssemble, ADR-0033) — здесь только страница и
// кнопки.
import type { ExamItemDto } from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';
import type { BotMenu } from './bot-menu';
import { newExamCancelButton, truncatePromptForButton } from './new-exam-types';

const PAGE_SIZE = 6;

export const NO_ITEMS_TEXT =
  'Нет опубликованных вопросов. Заведите вопрос командой /вопрос.';

export function pageCount(totalItems: number): number {
  return Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
}

/** Страница чужому коду не должна прийти за пределами реального числа
 * страниц (список мог сжаться, если вопрос заархивировали между кликами) —
 * зажимаем в допустимый диапазон тут же, а не отдельной проверкой у
 * каждого вызывающего. */
export function clampPage(page: number, totalItems: number): number {
  return Math.min(Math.max(page, 0), pageCount(totalItems) - 1);
}

function itemsOnPage(items: readonly ExamItemDto[], page: number): ExamItemDto[] {
  const start = page * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

export function pickScreen(
  items: readonly ExamItemDto[],
  selectedIds: readonly string[],
  page: number,
): BotMenu {
  if (items.length === 0)
    return { text: NO_ITEMS_TEXT, buttons: [newExamCancelButton()] };

  const total = pageCount(items.length);
  const shown = itemsOnPage(items, page);
  const selected = new Set(selectedIds);
  const itemButtons = shown.map((item) => [
    inlineButton(
      `${selected.has(item.id) ? '☑' : '☐'} ${truncatePromptForButton(item.prompt)}`,
      'net',
      item.id,
    ),
  ]);

  const navRow: InlineKeyboardButton[] = [];
  if (page > 0) navRow.push(inlineButton('← Назад', 'nep', 'prev'));
  if (page < total - 1) navRow.push(inlineButton('Дальше →', 'nep', 'next'));

  const buildRow: InlineKeyboardButton[][] =
    selectedIds.length > 0
      ? [[inlineButton(`Собрать (${selectedIds.length})`, 'nea', 'go')]]
      : [];

  const header =
    total > 1
      ? `Отметьте вопросы для экзамена. Страница ${page + 1} из ${total}.`
      : 'Отметьте вопросы для экзамена.';

  return {
    text: header,
    buttons: [
      ...itemButtons,
      ...(navRow.length > 0 ? [navRow] : []),
      ...buildRow,
      newExamCancelButton(),
    ],
  };
}
