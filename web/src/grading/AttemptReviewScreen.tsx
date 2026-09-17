// Экран проверки попытки, /grading/:attemptId (слой 4.6, ТЗ 4.6). Обычный
// маршрут, не полноэкранный лист — useHistorySheet не нужен (правило
// CLAUDE.md касается `position: fixed; inset: 0`), «Назад» — обычная ссылка
// на очередь, как «Вернуться к экзаменам» в attempt/AttemptSubmitted.tsx.
// Две колонки на экране, где проверке хватает места рядом с ответами (макет
// Review.dc.html, класс `.xuanxue-review-layout` в index.css), одна — на
// телефоне (CLAUDE.md «Мобильный экран первым» сильнее макета).
//
// Макет показывает «Работа 1 из 3» с переходом между попытками очереди и
// время сдачи в шапке — здесь их нет: перехода между попытками очередь не
// отдаёт (свой список пришлось бы грузить заново на этом экране — решение
// агента: не превращать реэскин в новую фичу навигации), а `submittedAt`
// в `AttemptReviewDto` не приходит вовсе (только в `ExamAttemptDto` списка
// очереди) — значит, не выдумываем.
import { Link, useParams } from 'react-router-dom';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  screenColumnTitleStyle,
  screenExplanationStyle,
  screenHintStyle,
  screenSectionStyle,
  screenTitleStyle,
  textLinkStyle,
  wideScreenSectionStyle,
} from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { AttemptReviewAnswers } from './AttemptReviewAnswers';
import { GradingForm } from './GradingForm';
import { useAttemptReview, type AttemptReviewVideoControls } from './useAttemptReview';

const GRADING_HEADING_ID = 'grading-heading';
const GRADING_HINT = 'Итог и комментарий уйдут ученику в Telegram сразу после отправки.';

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
    markMediaStateFor,
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

  // Видео каждого вопроса собирается один раз здесь и идёт вниз одним
  // объектом (AttemptReviewAnswers → AttemptReviewBlock →
  // AttemptReviewQuestion, тот же приём, что `video` в attempt/AttemptScreen.tsx).
  const video: AttemptReviewVideoControls = {
    media: review.media ?? [],
    markMediaManual,
    markMediaStateFor,
  };

  return (
    <section style={wideScreenSectionStyle}>
      <Link to="/grading" style={textLinkStyle}>
        Вернуться к очереди проверки
      </Link>
      <h1 style={screenTitleStyle}>{review.userName}</h1>
      <p style={screenExplanationStyle}>{review.examTitle}</p>

      <div className="xuanxue-review-layout">
        <AttemptReviewAnswers blocks={review.blocks} video={video} />

        <aside aria-labelledby={GRADING_HEADING_ID}>
          <h2 id={GRADING_HEADING_ID} style={screenColumnTitleStyle}>
            Проверка
          </h2>
          <p style={{ ...screenHintStyle, margin: '6px 0 0' }}>{GRADING_HINT}</p>
          <GradingForm
            key={review.attemptId}
            grading={review.grading}
            onSubmit={submitGrading}
            saving={saving}
            saveError={saveError}
          />
        </aside>
      </div>
    </section>
  );
}
