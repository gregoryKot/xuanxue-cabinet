// Экраны диалога «Собрать экзамен» после отметки (шаги 'title'/'timeLimit'/
// 'attempts'/'confirm', ТЗ 4б.4, docs/PLAN.md §12) — тем же приёмом, что
// new-exam-item-screens.ts у диалога «Новый вопрос». Чистая логика без Mongo
// и без Telegram.
import { formatDurationRu } from '@xuanxue/shared';
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

function timeLimitLine(timeLimitMin: number | undefined): string {
  return timeLimitMin ? formatDurationRu(timeLimitMin) : 'без лимита';
}

const PUBLISH_LABEL = 'Опубликовать';
const CONFIRM_QUESTION = 'Опубликовать этот экзамен?';

export function confirmScreen(draft: NewExamDraft): BotMenu {
  const lines = [
    'Проверьте экзамен:',
    `Название: ${draft.title ?? ''}`,
    `Вопросов: ${draft.itemIds.length}`,
    `Лимит времени: ${timeLimitLine(draft.timeLimitMin)}`,
    `Попыток: ${draft.attemptsAllowed ?? ''}`,
    CONFIRM_QUESTION,
  ];
  return {
    text: lines.join('\n\n'),
    buttons: [[inlineButton(PUBLISH_LABEL, 'nef', 'publish')], newExamCancelButton()],
  };
}
