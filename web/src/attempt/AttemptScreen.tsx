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
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useAuthConfig } from '../auth/useAuthConfig';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SkeletonLines } from '../components/Skeleton';
import { AttemptInProgress } from './AttemptInProgress';
import { AttemptSubmitted } from './AttemptSubmitted';
import { attemptPageStyle } from './attemptLayout';
import { useAttempt } from './useAttempt';
import { useAttemptMedia, type AttemptVideoControls } from './useAttemptMedia';

export default function AttemptScreen() {
  const { id } = useParams<{ id: string }>();
  const { attempt, loading, error, reload, submit, submitting, submitError } = useAttempt(
    id ?? '',
  );
  const { config } = useAuthConfig();
  // Кнопку «Отправить видео боту» показываем только тем, кого бот узнает
  // (ADR-0037, RUNBOOK §8.17) — сессия уже загружена, экран под RequireAuth.
  const { me } = useAuth();
  // Хук — до ранних return (правило хуков): пока attempt не загружен,
  // addMediaLink и linkStateFor всё равно не зовутся, им нужен только id.
  const media = useAttemptMedia(id ?? '', reload);

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
    addMediaLink: media.addMediaLink,
    linkStateFor: media.linkStateFor,
  };

  if (attempt.status !== 'in_progress') {
    return <AttemptSubmitted attempt={attempt} video={video} />;
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
