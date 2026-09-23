// Экран сдачи экзамена, /attempts/:id (ТЗ п.2, docs/PLAN.md §11 слой 4.4) —
// доступен любой роли (учитель тоже проходит форму изнутри, ADR-0022 +
// exam-attempts.controller.ts): маршрут заведён в App.tsx без @Roles-гварда,
// AppShell.tsx отдаёт под него Outlet, как под «/profile» (ADR-0045). Сам экран —
// только загрузка/ошибка/выбор состояния; форма ответа — AttemptInProgress.tsx
// (своя причина, см. её комментарий), терминальные статусы — AttemptSubmitted.tsx.
// useAuthConfig — тот же хук, что LoginScreen.tsx: имя бота для deep link
// «Отправить видео» (ADR-0037) публично и не зависит от роли, отдельного
// маршрута под него заводить незачем.
//
// `video` (AttemptVideoControls) собирается один раз здесь и идёт вниз одним
// объектом что в форму сдачи, что на «Отправлено» (комментарий типа в
// useAttemptMedia.ts) — оба места отвечают на один и тот же вопрос попытки,
// и им нужны одни и те же данные: сама попытка ещё грузится в двух первых
// ранних return, поэтому useAttemptMedia зовём выше них, а объект video
// собираем только когда attempt уже точно есть (иначе attempt.id и attempt.media
// звать не от чего).
//
// Попап «Время вышло» (отзыв владельца 2026-09-21, useExpiryNotice.ts) —
// только когда дедлайн настиг попытку прямо на этом сеансе экрана; рисуется
// поверх AttemptSubmitted тем же переключением по attempt.status с сервера
// (комментарий выше), хук — до ранних return вместе с остальными.
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useAuthConfig } from '../auth/useAuthConfig';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { NoticeDialog } from '../components/NoticeDialog';
import { SkeletonLines } from '../components/Skeleton';
import { useMyExamsApplyAttempt } from '../student/MyExamsProvider';
import { showsTelegramLinkOffer } from '../telegram/acceptsTelegramOffer';
import { AttemptInProgress } from './AttemptInProgress';
import { AttemptSubmitted } from './AttemptSubmitted';
import { attemptPageStyle } from './attemptLayout';
import { useAttempt } from './useAttempt';
import { useAttemptMedia, type AttemptVideoControls } from './useAttemptMedia';
import { useAttemptVideoPoll } from './useAttemptVideoPoll';
import { useExpiryNotice } from './useExpiryNotice';

const EXPIRY_NOTICE_TITLE = 'Время вышло';
const EXPIRY_NOTICE_MESSAGE =
  'Попытка закрыта и **ушла учителю на проверку**. Успевшие ответы сохранены.';

export default function AttemptScreen() {
  const { id } = useParams<{ id: string }>();
  // Список «Заданий» правится тем же ответом отправки, без второго GET
  // (ADR-0119) — useMyExamsApplyAttempt() тихо ничего не делает, если этот
  // экран отрендерен без MyExamsProvider (так рендерит только его
  // изолированный тест, AttemptScreen.test.tsx; в проде провайдер есть
  // всегда, AppShell.tsx).
  const applyExamAttempt = useMyExamsApplyAttempt();
  const { attempt, loading, error, reload, refresh, submit, submitting, submitError } =
    useAttempt(id ?? '', { onSubmitted: applyExamAttempt });
  const { config } = useAuthConfig();
  // Кнопку «Отправить видео боту» показываем только тем, кого бот узнает
  // (ADR-0037, RUNBOOK §8.17) — сессия уже загружена, экран под RequireAuth.
  const { me } = useAuth();
  // Хук — до ранних return (правило хуков): пока attempt не загружен,
  // addMediaLink и linkStateFor всё равно не зовутся, им нужен только id.
  const media = useAttemptMedia(id ?? '', reload);
  // Фоновый опрос, пока ждём видео из Telegram (ADR-0076, ADR-0023/0037,
  // useAttemptVideoPoll.ts) — тоже до ранних return: пока attempt === null,
  // хук сам не ходит в сеть, решение живёт внутри него.
  useAttemptVideoPoll(attempt, refresh);
  const expiryNotice = useExpiryNotice(attempt);

  if (loading) {
    return (
      <section style={attemptPageStyle}>
        <SkeletonLines widths={['50%', '90%', '70%']} />
      </section>
    );
  }

  if (error || !attempt) {
    return (
      <section style={attemptPageStyle}>
        <LoadErrorBanner message={error ?? ''} onRetry={() => void reload()} />
      </section>
    );
  }

  const video: AttemptVideoControls = {
    attemptId: attempt.id,
    media: attempt.media ?? [],
    telegramBotUsername: config?.telegramBotUsername,
    telegramLinked: me?.telegramLinked ?? false,
    offersTelegramLink: showsTelegramLinkOffer(me),
    // ADR-0086: проверенную работу бэкенд ссылкой уже не примет — не зовём.
    acceptsAnswers: attempt.status !== 'graded',
    addMediaLink: media.addMediaLink,
    linkStateFor: media.linkStateFor,
  };

  if (attempt.status !== 'in_progress') {
    return (
      <>
        <AttemptSubmitted attempt={attempt} video={video} />
        {expiryNotice.showing && (
          <NoticeDialog
            title={EXPIRY_NOTICE_TITLE}
            message={EXPIRY_NOTICE_MESSAGE}
            onClose={expiryNotice.dismiss}
          />
        )}
      </>
    );
  }

  return (
    <AttemptInProgress
      attempt={attempt}
      reload={reload}
      onSubmit={submit}
      submitting={submitting}
      submitError={submitError}
      video={video}
    />
  );
}
