// Ссылка на видео-ответ (ADR-0023, ADR-0037) — запасной путь для тех, у кого
// нет Telegram, теперь адресован конкретному вопросу, а не попытке целиком.
// Вынесено из useAttempt.ts: там осталась только сама попытка и её отправка.
// Убрать свою ссылку (ADR-0086) — та же мутация media, тот же read-after-write.
import { useCallback, useState } from 'react';
import type { ExamMediaDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';

const ADD_MEDIA_LINK_ERROR_MESSAGE = 'Не удалось сохранить ссылку. Попробуйте ещё раз.';
// Сервер на graded/чужую/не-link запись отвечает 400 со своим текстом (ADR-0086,
// EXAM_MEDIA_LOCKED_AFTER_GRADING_MESSAGE) — запасной текст нужен только сети.
const REMOVE_MEDIA_ERROR_MESSAGE = 'Не удалось убрать ссылку. Попробуйте ещё раз.';

/** Общий вид состояния для отправки ссылки и для её снятия — у каждой свой
 * `useState` ниже, «Убрать» не должно гасить pending/ошибку формы. */
interface AttemptMediaRequestState {
  pending: boolean;
  error: FormError | null;
}

const IDLE_MEDIA_STATE: AttemptMediaRequestState = { pending: false, error: null };

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
  /** Попытку ещё не оценили (ADR-0086, `status !== 'graded'`) — только тогда
   * у своей ссылки видны «Заменить» и «Убрать»; считается вместе с остальным
   * объектом в AttemptScreen.tsx. */
  canChangeAnswer: boolean;
  addMediaLink: (itemId: string, url: string) => Promise<boolean>;
  linkStateFor: (itemId: string) => AttemptMediaRequestState;
  /** Убрать свою запись `kind: 'link'` (ADR-0086); «Заменить» зовёт её же —
   * замена это снять и прислать заново. `true` — на успех. */
  removeMedia: (mediaId: string) => Promise<boolean>;
  /** Состояние удаления, ключ по mediaId — не путать с linkStateFor. */
  removeStateFor: (mediaId: string) => AttemptMediaRequestState;
}

export interface UseAttemptMediaResult {
  /** Запасной путь привязки видео к вопросу — ссылка (ADR-0023, ADR-0037).
   * `true` на успех — форма очищает поле только тогда, не по факту вызова. */
  addMediaLink: (itemId: string, url: string) => Promise<boolean>;
  /** Состояние формы конкретного вопроса — не общее на попытку: два
   * видео-вопроса в одной форме должны показывать ошибку и «занято» только у
   * того, чью ссылку отправляли, а не у обоих сразу. */
  linkStateFor: (itemId: string) => AttemptMediaRequestState;
  /** Снять запись `kind: 'link'` (ADR-0086) — read-after-write, как addMediaLink. */
  removeMedia: (mediaId: string) => Promise<boolean>;
  /** Состояние удаления — ключ по mediaId, тот же приём, что у linkStateFor. */
  removeStateFor: (mediaId: string) => AttemptMediaRequestState;
}

/** Одна механика на обе мутации (CLAUDE.md «Одна механика — один компонент»):
 * отправка ссылки и её снятие отличаются только запросом и ключом состояния,
 * а pending, разбор ошибки и read-after-write у них общие. Ключ — itemId у
 * формы и mediaId у снятия: одно состояние на мутацию, а не Map по ключам,
 * потому что одновременно нажата всегда одна кнопка. */
function useMediaMutation(reload: () => Promise<void>, fallbackMessage: string) {
  const [state, setState] = useState<(AttemptMediaRequestState & { key: string }) | null>(
    null,
  );

  // Read-after-write: на успех перечитываем попытку, `media` в ответе —
  // уже с сервера (CLAUDE.md), а не собрана на клиенте из отправленного.
  const run = useCallback(
    async (key: string, request: () => Promise<unknown>): Promise<boolean> => {
      setState({ key, pending: true, error: null });
      try {
        await request();
        await reload();
        setState(null);
        return true;
      } catch (err) {
        setState({ key, pending: false, error: errorFrom(err, fallbackMessage) });
        return false;
      }
    },
    [reload, fallbackMessage],
  );

  const stateFor = useCallback(
    (key: string): AttemptMediaRequestState =>
      state?.key === key
        ? { pending: state.pending, error: state.error }
        : IDLE_MEDIA_STATE,
    [state],
  );

  return { run, stateFor };
}

export function useAttemptMedia(
  attemptId: string,
  reload: () => Promise<void>,
): UseAttemptMediaResult {
  const link = useMediaMutation(reload, ADD_MEDIA_LINK_ERROR_MESSAGE);
  const removal = useMediaMutation(reload, REMOVE_MEDIA_ERROR_MESSAGE);

  const addMediaLink = useCallback(
    (itemId: string, url: string): Promise<boolean> =>
      link.run(itemId, () =>
        apiFetch(`/attempts/${attemptId}/media/link`, {
          method: 'POST',
          body: { url, itemId },
        }),
      ),
    [attemptId, link],
  );

  const removeMedia = useCallback(
    (mediaId: string): Promise<boolean> =>
      removal.run(mediaId, () =>
        apiFetch(`/attempts/${attemptId}/media/${mediaId}`, { method: 'DELETE' }),
      ),
    [attemptId, removal],
  );

  return {
    addMediaLink,
    linkStateFor: link.stateFor,
    removeMedia,
    removeStateFor: removal.stateFor,
  };
}
