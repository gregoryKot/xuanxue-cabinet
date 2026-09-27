// Экраны диалога «Собрать экзамен» после отметки (шаги 'title'/'timeLimit'/
// 'attempts'/'confirm', ТЗ 4б.4, docs/PLAN.md §12) — тем же приёмом, что
// new-exam-item-screens.ts у диалога «Новый вопрос». Чистая логика без Mongo
// и без Telegram.
import { formatDurationRu, formatExamDueAt, SCHOOL_TZ } from '@xuanxue/shared';
import { inlineButton } from '../callback-data';
import type { NewExamDraft } from '../new-exam-draft-wait';
import type { BotMenu } from './bot-menu';
import { newExamCancelButton } from './new-exam-types';

export function titleWaitScreen(): BotMenu {
  return {
    text: 'Как назвать экзамен? Пришлите название одним сообщением — ученики увидят его в списке.',
    buttons: [newExamCancelButton()],
  };
}

const TIME_LIMIT_PRESETS = [
  { label: 'Без лимита', id: 'none' },
  { label: '15 минут', id: '15' },
  { label: '30 минут', id: '30' },
  { label: '60 минут', id: '60' },
] as const;

export function timeLimitScreen(): BotMenu {
  return {
    text:
      'Сколько времени на экзамен? Выберите кнопкой или пришлите число минут ' +
      'сообщением.',
    buttons: [
      ...TIME_LIMIT_PRESETS.map((preset) => [
        inlineButton(preset.label, 'nel', preset.id),
      ]),
      newExamCancelButton(),
    ],
  };
}

const ATTEMPTS_PRESETS = ['1', '2', '3'] as const;

export function attemptsScreen(): BotMenu {
  return {
    text: 'Сколько попыток разрешить ученику?',
    buttons: [
      ATTEMPTS_PRESETS.map((n) => inlineButton(n, 'nen', n)),
      newExamCancelButton(),
    ],
  };
}

// Пресеты срока сдачи (ADR-0125, ADR-0127) — кнопкой, не свободным текстом:
// дата в чате «как получится» плодит кривой ввод, а точный ввод уже есть в
// кабинете (ExamFlowFields.tsx). Срок — конец выбранного дня по часам школы
// (new-exam-due.ts), не сам момент нажатия.
const DUE_AT_PRESETS = [
  { label: 'Без срока', id: 'none' },
  { label: 'Через неделю', id: '1w' },
  { label: 'Через две недели', id: '2w' },
  { label: 'Через месяц', id: '1m' },
] as const;

export function dueAtScreen(): BotMenu {
  return {
    text: 'До какого числа принимать новые попытки? Прошедший срок не остановит уже идущую.',
    buttons: [
      ...DUE_AT_PRESETS.map((preset) => [inlineButton(preset.label, 'ned', preset.id)]),
      newExamCancelButton(),
    ],
  };
}

function timeLimitLine(timeLimitMin: number | undefined): string {
  return timeLimitMin ? formatDurationRu(timeLimitMin) : 'без лимита';
}

/** «30 сентября, 23:59» — часы школы: в диалоге сборки собеседник и так штат
 * школы, приписывать пояс, как в списке ученику (exam-list-row.ts), незачем. */
function dueAtLine(dueAt: string | undefined): string {
  return formatExamDueAt(dueAt, { timeZone: SCHOOL_TZ }) ?? 'без срока';
}

const PUBLISH_LABEL = 'Опубликовать';
const CONFIRM_QUESTION = 'Опубликовать этот экзамен?';

export function confirmScreen(draft: NewExamDraft): BotMenu {
  const lines = [
    'Проверьте экзамен:',
    `Название: ${draft.title ?? ''}`,
    `Вопросов: ${draft.itemIds.length}`,
    `Лимит времени: ${timeLimitLine(draft.timeLimitMin)}`,
    `Срок сдачи: ${dueAtLine(draft.dueAt)}`,
    `Попыток: ${draft.attemptsAllowed ?? ''}`,
    CONFIRM_QUESTION,
  ];
  return {
    text: lines.join('\n\n'),
    buttons: [[inlineButton(PUBLISH_LABEL, 'nef', 'publish')], newExamCancelButton()],
  };
}
