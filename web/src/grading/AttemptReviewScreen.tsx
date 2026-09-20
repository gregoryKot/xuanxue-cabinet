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
//
// Экран остался в облике ADR-0031 (плоский текст, волосяные линии прямо на
// бумаге), когда остальной кабинет переехал на «Тёплую школу» (ADR-0043) —
// снимок владельца с телефона («тут всё сливается»): ниже две карточки
// (ответы и проверка) вместо плоского текста. Поверхность карточки берётся
// из общего `blockCardStyle` (components/listCardStyles.ts).
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { blockCardStyle } from '../components/listCardStyles';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  screenColumnTitleStyle,
  screenExplanationStyle,
  screenHintStyle,
  screenSectionStyle,
  screenTitleStyle,
  wideScreenSectionStyle,
} from '../components/screenLayout';
import { backLinkStyle } from '../components/editorLayout';
import { SkeletonLines } from '../components/Skeleton';
import { AttemptReviewAnswers } from './AttemptReviewAnswers';
import { GradingForm } from './GradingForm';
import { useAttemptReview, type AttemptReviewVideoControls } from './useAttemptReview';

const GRADING_HEADING_ID = 'grading-heading';
const GRADING_HINT = 'Итог и комментарий уйдут ученику в Telegram сразу после отправки.';
// Рубрика над именем: само по себе имя не называет экран — читатель шёл из
// очереди проверки и должен понять, что открыл одну работу (тот же приём,
// что у `.xuanxue-eyebrow` в student/StudentExamsSection.tsx).
const EYEBROW_LABEL = 'Работа ученика';

const headingColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
// `overflowWrap: 'anywhere'`, а не `break-word`: длинное имя-почта — одно
// слово без пробелов и дефисов, `break-word` его не разорвёт (тот же приём —
// `bottomPillStyle`, app/bottomNavStyles.ts).
const titleStyle: CSSProperties = { ...screenTitleStyle, overflowWrap: 'anywhere' };

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
      <Link to="/grading" style={backLinkStyle}>
        Вернуться к очереди проверки
      </Link>

      <div style={headingColumnStyle}>
        <span className="xuanxue-eyebrow">{EYEBROW_LABEL}</span>
        <h1 style={titleStyle}>{review.userName}</h1>
        <p style={screenExplanationStyle}>{review.examTitle}</p>
      </div>

      <div className="xuanxue-review-layout">
        <div style={blockCardStyle}>
          <AttemptReviewAnswers blocks={review.blocks} video={video} />
        </div>

        <aside aria-labelledby={GRADING_HEADING_ID} style={blockCardStyle}>
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
