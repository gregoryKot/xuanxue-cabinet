// Один вопрос карточки проверки (ТЗ 4.6, п.3) — формулировка, критерии
// проверки (только учителю — API их не отдаёт ученику ни на одном маршруте,
// exam-grading.ts), ответ ученика, варианты с пометкой верных и выбранных,
// счётчик автопроверки. Строка списка, не карточка (направление «тихо и
// благородно», docs/adr/0031, макет Review.dc.html): волосяная линия снизу,
// статус — короткой меткой справа от формулировки
// (attemptReviewQuestionStatus.ts), как статус формы на строке списка
// (exams/ExamCard.tsx).
//
// Видео-вопрос (ADR-0037: видео — ответ на конкретный вопрос, не вложение к
// попытке целиком) — своя запись видео тут же, а не общим блоком на всю
// попытку: два видео-вопроса в одной попытке теперь различимы. Рендер —
// переиспользованный AttemptReviewMedia.tsx (CLAUDE.md «Одна механика — один
// компонент»), без своего заголовка: формулировка вопроса уже сказала, что
// это. `video.media` — вся попытка, вопрос сам фильтрует по `itemId`, тот же
// приём, что AttemptQuestionVideo.tsx на экране сдачи.
//
// Картинка варианта (ADR-0035) — миниатюрой перед подписью: снимок попытки
// несёт свой `imageId`, учитель видит ту же картинку, что видел сдающий;
// подпись без текста — formatOptionLabel, тот же приём, что на сдаче.
import type { CSSProperties } from 'react';
import { formatOptionLabel, type AttemptReviewQuestionDto } from '@xuanxue/shared';
import { OptionImage } from '../components/OptionImage';
import { AttemptReviewMedia } from './AttemptReviewMedia';
import { attemptReviewQuestionStatus } from './attemptReviewQuestionStatus';
import { formatOptionsCheckSummary } from './optionsCheckSummary';
import type { AttemptReviewVideoControls } from './useAttemptReview';

const NO_ANSWER_TEXT = 'Ответ не дан.';

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '18px 4px',
  borderBottom: '1px solid var(--line)',
};
const headStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 20,
};
const promptStyle: CSSProperties = { fontSize: 15, fontWeight: 500, lineHeight: 1.45 };
// Тон статуса — --jade только на «Верно» (CLAUDE.md «Правило акцента»: смысл
// «сдал/верно»), «N из M» и «Смотрите вы» — тушь приглушённого тона: киноварь
// на этом экране уже занята кнопкой отправки оценки, второго красного пятна
// быть не должно.
const statusToneStyle: Record<'jade' | 'neutral', CSSProperties> = {
  jade: { color: 'var(--jade)' },
  neutral: { color: 'var(--ink-soft)' },
};
const statusStyle: CSSProperties = { flexShrink: 0 };
const metaStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };
const answerStyle: CSSProperties = { margin: 0, fontSize: 16, lineHeight: 1.7 };
const optionsListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const optionRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };

interface AttemptReviewQuestionProps {
  index: number;
  question: AttemptReviewQuestionDto;
  video: AttemptReviewVideoControls;
}

export function AttemptReviewQuestion({
  index,
  question,
  video,
}: AttemptReviewQuestionProps) {
  const hasOptions = question.options.length > 0;
  const isVideo = question.kind === 'video';
  const questionMedia = video.media.filter((item) => item.itemId === question.itemId);
  const status = attemptReviewQuestionStatus(question, questionMedia.length > 0);

  return (
    <div style={rowStyle}>
      <div style={headStyle}>
        <span style={promptStyle}>
          {index + 1}. {question.prompt}
        </span>
        {status && (
          <span
            className="xuanxue-status-label"
            style={{ ...statusStyle, ...statusToneStyle[status.tone] }}
          >
            {status.label}
          </span>
        )}
      </div>
      {question.hint && <p style={metaStyle}>Подсказка ученику: {question.hint}</p>}
      {question.criteria && (
        <p style={metaStyle}>Критерии проверки: {question.criteria}</p>
      )}

      {hasOptions ? (
        <ul style={optionsListStyle}>
          {question.options.map((option, optionIndex) => (
            <li key={option.id} style={optionRowStyle}>
              {option.imageId && (
                <OptionImage
                  imageId={option.imageId}
                  size="thumb"
                  alt={formatOptionLabel(option.text, optionIndex)}
                />
              )}
              <span>
                {formatOptionLabel(option.text, optionIndex)}
                {option.correct && <strong> — верный</strong>}
                {option.selected && <em> · выбрал ученик</em>}
              </span>
            </li>
          ))}
        </ul>
      ) : isVideo ? (
        <AttemptReviewMedia
          media={questionMedia}
          onMarkManual={() => video.markMediaManual(question.itemId)}
          marking={video.markMediaStateFor(question.itemId).pending}
          markError={video.markMediaStateFor(question.itemId).error}
        />
      ) : (
        <p style={answerStyle}>
          {question.answerText?.trim() ? question.answerText : NO_ANSWER_TEXT}
        </p>
      )}

      {question.optionsCheck && (
        <p style={metaStyle}>{formatOptionsCheckSummary(question.optionsCheck)}</p>
      )}
    </div>
  );
}
