// Ссылка на видео-ответ (ADR-0023, ADR-0037) — запасной путь для тех, у кого
// нет Telegram, теперь адресован конкретному вопросу, а не попытке целиком.
// Вынесено из useAttempt.ts: там осталась только сама попытка и её отправка.
import { useCallback, useState } from 'react';
import type { ExamMediaDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';

const ADD_MEDIA_LINK_ERROR_MESSAGE = 'Не удалось сохранить ссылку. Попробуйте ещё раз.';

interface AttemptMediaLinkState {
  pending: boolean;
  error: FormError | null;
}

const IDLE_LINK_STATE: AttemptMediaLinkState = { pending: false, error: null };

/** Всё, что нужно видео-вопросу, чтобы принять ответ: собирается один раз в
 * AttemptScreen.tsx и идёт вниз одним объектом (AttemptInProgress →
 * AttemptBlock → AttemptQuestion → AttemptQuestionVideo, тем же путём —
 * AttemptSubmittedVideos → AttemptQuestionVideo), а не россыпью пропсов. */
export interface AttemptVideoControls {
  attemptId: string;
  /** Все видео попытки (`ExamAttemptDto.media`), вопрос сам выбирает свои по
   * `itemId` (ADR-0037). */
  media: ExamMediaDto[];
  /** Нет бота или Telegram не ответил при старте (GET /auth/config без
   * поля) — кнопки в чат с ботом не будет, а не ссылка на «undefined». */
  telegramBotUsername?: string;
  /** Привязан ли Telegram к аккаунту (`MeDto.telegramLinked`) — без него бот
   * видео не примет, кнопка вела бы в тупик (RUNBOOK §8.17). */
  telegramLinked: boolean;
  /** Предлагать ли здесь связать Telegram (`showsTelegramLinkOffer`,
   * ADR-0067) — отдельно от `telegramLinked`: тот решает, вести ли к боту
   * прямо сейчас, а этот гаснет ещё и отметкой «у меня нет Telegram».
   * Считается один раз в AttemptScreen.tsx, а не здесь: `me` живёт у экрана,
   * а блок видео-вопроса о сессии ничего не знает. */
  offersTelegramLink: boolean;
  /** Ждёт ли попытка ответа сейчас (ADR-0086). Проверенную работу бэкенд
   * ссылкой уже не примет, и формы на экране быть не должно: контрол, который
   * всегда отвечает отказом, хуже, чем его отсутствие. Кнопка бота гаснет по
   * тому же флагу — звать в бота там, где ответ уже не нужен, противоречит
   * соседней строке «работу проверили»; сам бот присланное видео примет
   * по-прежнему (оно добавляется, а не подменяет оценённое). */
  acceptsAnswers: boolean;
  addMediaLink: (itemId: string, url: string) => Promise<boolean>;
  linkStateFor: (itemId: string) => AttemptMediaLinkState;
}

export interface UseAttemptMediaResult {
  /** Запасной путь привязки видео к вопросу — ссылка (ADR-0023, ADR-0037).
   * `true` на успех — форма очищает поле только тогда, не по факту вызова. */
  addMediaLink: (itemId: string, url: string) => Promise<boolean>;
  /** Состояние формы конкретного вопроса — не общее на попытку: два
   * видео-вопроса в одной форме должны показывать ошибку и «занято» только у
   * того, чью ссылку отправляли, а не у обоих сразу. */
  linkStateFor: (itemId: string) => AttemptMediaLinkState;
}

export function useAttemptMedia(
  attemptId: string,
  reload: () => Promise<void>,
): UseAttemptMediaResult {
  // Одно состояние на хук, а не Map/объект по itemId: одновременно отправить
  // можно только одну форму (вторая кнопка не нажата, пока первая не
  // ответила) — этого достаточно, чтобы различить «свой» вопрос и остальные.
  const [linkState, setLinkState] = useState<
    (AttemptMediaLinkState & { itemId: string }) | null
  >(null);

  // Read-after-write: перечитываем попытку на успех, `media` в ответе — уже
  // с новой ссылкой (CLAUDE.md «Read-after-write»), а не собрана на клиенте
  // из того, что сами отправили.
  const addMediaLink = useCallback(
    async (itemId: string, url: string): Promise<boolean> => {
      setLinkState({ itemId, pending: true, error: null });
      try {
        await apiFetch(`/attempts/${attemptId}/media/link`, {
          method: 'POST',
          body: { url, itemId },
        });
        await reload();
        setLinkState(null);
        return true;
      } catch (err) {
        setLinkState({
          itemId,
          pending: false,
          error: errorFrom(err, ADD_MEDIA_LINK_ERROR_MESSAGE),
        });
        return false;
      }
    },
    [attemptId, reload],
  );

  const linkStateFor = useCallback(
    (itemId: string): AttemptMediaLinkState => {
      if (!linkState || linkState.itemId !== itemId) return IDLE_LINK_STATE;
      return { pending: linkState.pending, error: linkState.error };
    },
    [linkState],
  );

  return { addMediaLink, linkStateFor };
}
