// Экран сдачи экзамена, /attempts/:id (ТЗ п.2, docs/PLAN.md §11 слой 4.4) —
// доступен любой роли (учитель тоже проходит форму изнутри, ADR-0022 +
// exam-attempts.controller.ts): маршрут заведён в App.tsx без @Roles-гварда,
// AppShell.tsx отдаёт под него Outlet, как под «/notifications». Сам экран —
// только загрузка/ошибка/выбор состояния; форма ответа — AttemptInProgress.tsx
// (своя причина, см. её комментарий), терминальные статусы — AttemptSubmitted.tsx.
// useAuthConfig — тот же хук, что LoginScreen.tsx: имя бота для deep link
// «Отправить видео» (ADR-0023) публично и не зависит от роли, отдельного
// маршрута под него заводить незачем.
import { useParams } from 'react-router-dom';
import { useAuthConfig } from '../auth/useAuthConfig';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenSectionStyle } from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { AttemptInProgress } from './AttemptInProgress';
import { AttemptSubmitted } from './AttemptSubmitted';
import { useAttempt } from './useAttempt';

export default function AttemptScreen() {
  const { id } = useParams<{ id: string }>();
  const {
    attempt,
    loading,
    error,
    reload,
    submit,
    submitting,
    submitError,
    addMediaLink,
    addingMediaLink,
    addMediaLinkError,
  } = useAttempt(id ?? '');
  const { config } = useAuthConfig();

  if (loading) {
    return (
      <section style={screenSectionStyle}>
        <SkeletonLines widths={['50%', '90%', '70%']} />
      </section>
    );
  }

  if (error || !attempt) {
    return (
      <section style={screenSectionStyle}>
        <LoadErrorBanner message={error ?? ''} onRetry={() => void reload()} />
      </section>
    );
  }

  if (attempt.status !== 'in_progress') {
    return (
      <AttemptSubmitted
        attempt={attempt}
        telegramBotUsername={config?.telegramBotUsername}
        onAddMediaLink={addMediaLink}
        addingMediaLink={addingMediaLink}
        addMediaLinkError={addMediaLinkError}
      />
    );
  }

  return (
    <AttemptInProgress
      attempt={attempt}
      reload={reload}
      onSubmit={submit}
      submitting={submitting}
      submitError={submitError}
    />
  );
}
