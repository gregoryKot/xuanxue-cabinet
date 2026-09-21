// Видео карточки проверки (ADR-0023, ADR-0037) — вынесено из
// useAttemptReview.ts, который перевалил за 150 строк с четвёртым способом
// увидеть видео («Прислать мне в Telegram», CLAUDE.md «Храповики» — выносить
// хук, не двигать бейслайн). Тот же приём, что useAttempt.ts/useAttemptMedia.ts
// на экране сдачи: useAttemptReview.ts зовёт этот хук и отдаёт наружу тот же
// состав полей, что раньше, — AttemptReviewScreen.tsx не меняется.
import { useCallback, useState } from 'react';
import type { ExamMediaDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';

const MARK_MEDIA_ERROR_MESSAGE = 'Не удалось отметить видео. Попробуйте ещё раз.';
const SEND_MEDIA_ERROR_MESSAGE = 'Не удалось отправить видео. Попробуйте ещё раз.';

interface MarkMediaState {
  pending: boolean;
  error: FormError | null;
}

const IDLE_MARK_MEDIA_STATE: MarkMediaState = { pending: false, error: null };

/** Состояние «прислать мне видео» одной записи (media.id, не itemId вопроса).
 * `sent` — своё поле: POST отвечает 204 и ничего на сервере не меняет,
 * перечитывать карточку незачем, и только это поле может показать успех. */
export interface SendMediaState {
  pending: boolean;
  error: FormError | null;
  sent: boolean;
}

const IDLE_SEND_MEDIA_STATE: SendMediaState = {
  pending: false,
  error: null,
  sent: false,
};

/** Всё, что нужно видео-вопросу карточки проверки (ADR-0037): собирается
 * один раз в AttemptReviewScreen.tsx и идёт вниз одним объектом
 * (AttemptReviewAnswers → AttemptReviewBlock → AttemptReviewQuestion, тот же
 * приём, что `AttemptVideoControls` в attempt/useAttemptMedia.ts), а не
 * россыпью пропсов (CLAUDE.md «параметров больше трёх — объект»). */
export interface AttemptReviewVideoControls {
  /** Всё видео попытки — вопрос сам выбирает своё по `itemId`, «без
   * вопроса» — записи без него (AttemptReviewAnswers.tsx). */
  media: ExamMediaDto[];
  markMediaManual: (itemId: string) => Promise<boolean>;
  markMediaStateFor: (itemId: string) => MarkMediaState;
  /** Переслать запись из Telegram себе ещё раз (POST .../media/:mediaId/send-to-me) —
   * пересылка при получении уходила только тем, у кого чат с ботом уже был
   * в тот момент (AttemptReviewMediaItem.tsx). Ключ — id записи media, не
   * itemId вопроса: у вопроса может быть несколько записей. */
  sendMediaToMe: (mediaId: string) => Promise<boolean>;
  sendMediaStateFor: (mediaId: string) => SendMediaState;
  /** Активный чат с ботом (MeDto.botChatActive) — без него кнопки выше нет
   * вовсе (эндпоинт ответил бы 409). Считается один раз в
   * AttemptReviewScreen.tsx через useAuth(), не здесь: тот же приём, что
   * offersTelegramLink в attempt/useAttemptMedia.ts — сессия живёт у экрана. */
  botChatActive: boolean;
  /** Предлагать ли вместо кнопки связать Telegram (showsTelegramOffer,
   * ADR-0042/ADR-0067) — гаснет и активным чатом, и отметкой «у меня нет
   * Telegram»: во втором случае кнопки-заглушки в тупик тоже не будет. */
  offersTelegramLink: boolean;
}

/** Действия хука — та же сигнатура, что у одноимённых полей
 * AttemptReviewVideoControls выше (там и разбор «почему»); UseAttemptReviewResult
 * (useAttemptReview.ts) от этого типа наследуется, а не повторяет поля. */
export interface UseAttemptReviewMediaResult {
  markMediaManual: (itemId: string) => Promise<boolean>;
  markMediaStateFor: (itemId: string) => MarkMediaState;
  sendMediaToMe: (mediaId: string) => Promise<boolean>;
  sendMediaStateFor: (mediaId: string) => SendMediaState;
}

export function useAttemptReviewMedia(
  attemptId: string,
  reload: () => Promise<void>,
): UseAttemptReviewMediaResult {
  // Одно состояние на хук, а не Map по itemId: отметить можно только один
  // вопрос за раз (вторая кнопка не нажата, пока первая не ответила) — этого
  // достаточно, чтобы различить «свой» вопрос и остальные.
  const [markState, setMarkState] = useState<
    (MarkMediaState & { itemId: string }) | null
  >(null);

  // Read-after-write: перечитываем карточку на успех — `media` в ответе уже
  // содержит новую запись `kind: 'manual'` с сервера, не собранную на клиенте.
  // Рядом с submitGrading(), который ответ записи кладёт через applyData
  // (ADR-0087), это выглядит недоделкой — но асимметрия осознанная: собрать
  // здесь AttemptReviewDto значило бы цикл в графе Nest (ExamGradingsService
  // из ExamsModule, а тот уже импортирует MediaModule; forwardRef запрещён
  // ADR-0013). Разбор — exam-media.controller.ts и аллоу-лист гейта.
  const markMediaManual = useCallback(
    async (itemId: string): Promise<boolean> => {
      setMarkState({ itemId, pending: true, error: null });
      try {
        await apiFetch(`/attempts/${attemptId}/media/manual`, {
          method: 'POST',
          body: { itemId },
        });
        await reload();
        setMarkState(null);
        return true;
      } catch (err) {
        setMarkState({
          itemId,
          pending: false,
          error: errorFrom(err, MARK_MEDIA_ERROR_MESSAGE),
        });
        return false;
      }
    },
    [attemptId, reload],
  );

  const markMediaStateFor = useCallback(
    (itemId: string): MarkMediaState => {
      if (!markState || markState.itemId !== itemId) return IDLE_MARK_MEDIA_STATE;
      return { pending: markState.pending, error: markState.error };
    },
    [markState],
  );

  // Одно состояние на хук, а не Map по mediaId — то же решение, что у
  // markState выше: одновременно отправить можно только одну запись.
  const [sendState, setSendState] = useState<
    (SendMediaState & { mediaId: string }) | null
  >(null);

  // Не read-after-write: POST ничего не меняет на сервере (запись видео уже
  // существует), меняется чат в Telegram — перечитывать карточку нечем
  // подтвердить. Успех остаётся в sendState как `sent: true` и держится, пока
  // не начнётся новая отправка той же записи.
  const sendMediaToMe = useCallback(
    async (mediaId: string): Promise<boolean> => {
      setSendState({ mediaId, pending: true, error: null, sent: false });
      try {
        await apiFetch(`/attempts/${attemptId}/media/${mediaId}/send-to-me`, {
          method: 'POST',
        });
        setSendState({ mediaId, pending: false, error: null, sent: true });
        return true;
      } catch (err) {
        setSendState({
          mediaId,
          pending: false,
          error: errorFrom(err, SEND_MEDIA_ERROR_MESSAGE),
          sent: false,
        });
        return false;
      }
    },
    [attemptId],
  );

  const sendMediaStateFor = useCallback(
    (mediaId: string): SendMediaState => {
      if (!sendState || sendState.mediaId !== mediaId) return IDLE_SEND_MEDIA_STATE;
      return { pending: sendState.pending, error: sendState.error, sent: sendState.sent };
    },
    [sendState],
  );

  return { markMediaManual, markMediaStateFor, sendMediaToMe, sendMediaStateFor };
}
