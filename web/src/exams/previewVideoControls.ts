// Управление видео-вопросом для предпросмотра «глазами ученика» (ТЗ 4.3).
// Предпросмотр показывает ровно тот блок, что видит ученик, — тем же
// компонентом AttemptQuestionVideo.tsx, а не своей заглушкой (отзыв владельца
// 2026-10-02: учитель видел одну строку вместо объяснения, кнопки загрузки,
// формы ссылки и бота). Компоненту нужен объект AttemptVideoControls, здесь
// он собирается из конфигурации входа, без попытки и без сети.
//
// Обработчики ниже не вызываются никогда: все контролы блока выключены
// (`disabled`) — тот же приём, что IGNORE_INPUT в attempt/AttemptAnswerFields.tsx.
//
// `telegramLinked: true` — предпросмотр показывает путь ученика с привязанным
// Telegram: так входит большинство учеников, и именно у них есть кнопка бота.
// Ученик без Telegram вместо неё видит «Свяжите Telegram»; предпросмотр
// показывает один вариант, и берёт самый частый.
import type { AuthConfigDto } from '@xuanxue/shared';
import type { AttemptVideoControls } from '../attempt/useAttemptMedia';

// Номера попытки в предпросмотре нет: значение уходит только в ключ отметки
// загрузки (useUploadActiveMark) и не попадает ни в один запрос.
const PREVIEW_ATTEMPT_ID = 'preview';

const IDLE_LINK_STATE = { pending: false, error: null };

export function previewVideoControls(config: AuthConfigDto | null): AttemptVideoControls {
  return {
    attemptId: PREVIEW_ATTEMPT_ID,
    media: [],
    telegramBotUsername: config?.telegramBotUsername,
    telegramLinked: true,
    offersTelegramLink: false,
    acceptsAnswers: true,
    addMediaLink: () => Promise.resolve(false),
    linkStateFor: () => IDLE_LINK_STATE,
    fileUploadEnabled: config?.fileStorageEnabled === true,
    applyMedia: () => undefined,
  };
}
