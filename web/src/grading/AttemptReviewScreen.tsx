// Экран проверки попытки, /grading/:attemptId (слой 4.6, ТЗ 4.6). Обычный
// маршрут, не полноэкранный лист — useHistorySheet не нужен (правило
// CLAUDE.md касается `position: fixed; inset: 0`), «Назад» — обычная ссылка
// на очередь, как «Вернуться к экзаменам» в attempt/AttemptSubmitted.tsx.
import { Link, useParams } from 'react-router-dom';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { AttemptReviewBlock } from './AttemptReviewBlock';
import { AttemptReviewMedia } from './AttemptReviewMedia';
import { GradingForm } from './GradingForm';
import { useAttemptReview } from './useAttemptReview';

export default function AttemptReviewScreen() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const {
    review,
    loading,
    error,
    reload,
    submitGrading,
    saving,
    saveError,
    markMediaManual,
    markingMedia,
    markMediaError,
  } = useAttemptReview(attemptId ?? '');

  if (loading) {
    return (
      <section style={screenSectionStyle}>
        <SkeletonLines widths={['50%', '90%', '70%']} />
      </section>
    );
  }

  if (error || !review) {
    return (
      <section style={screenSectionStyle}>
        <LoadErrorBanner message={error ?? ''} onRetry={() => void reload()} />
      </section>
    );
  }

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>
        <Link to="/grading">Вернуться к очереди проверки</Link>
      </p>
      <h1 style={{ margin: 0, fontSize: 18 }}>{review.examTitle}</h1>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{review.userName}</p>

      <AttemptReviewMedia
        media={review.media ?? []}
        onMarkManual={markMediaManual}
        marking={markingMedia}
        markError={markMediaError}
      />

      {review.blocks.map((block) => (
        <AttemptReviewBlock key={block.id} block={block} />
      ))}

      <GradingForm
        key={review.attemptId}
        rubric={review.rubric}
        grading={review.grading}
        onSubmit={submitGrading}
        saving={saving}
        saveError={saveError}
      />
    </section>
  );
}
