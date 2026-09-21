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
// это. `media` — уже своя запись этого вопроса: группировку считает вызывающий
// (attemptReviewMediaByQuestion.ts, чистая функция с тестом, CLAUDE.md
// «Логика вне компонентов»), а не сам вопрос фильтром по попытке целиком.
//
// Сам список вариантов — AttemptReviewQuestionOptions.tsx (там же картинка
// варианта, ADR-0035): этот файл стоял на пределе размера, и подкомпонент —
// то, что велит делать CLAUDE.md «Храповики», а не сдвиг бейслайна вверх.
//
// Формулировка здесь рендерится своим кодом, не через QuestionRow.tsx
// (у карточки проверки свой макет строки — номер и статус в одной шапке),
// поэтому ссылку в ней делает кликабельной PromptText.tsx напрямую
// (ADR-0093), тем же приёмом.
import type { CSSProperties } from 'react';
import {
  ATTEMPT_NO_ANSWER_TEXT,
  type AttemptReviewQuestionDto,
  type ExamMediaDto,
} from '@xuanxue/shared';
import { PromptText } from '../components/PromptText';
import { AttemptReviewMedia } from './AttemptReviewMedia';
import { AttemptReviewQuestionOptions } from './AttemptReviewQuestionOptions';
import { attemptReviewQuestionStatus } from './attemptReviewQuestionStatus';
import { formatOptionsCheckSummary } from './optionsCheckSummary';
import type { AttemptReviewVideoControls } from './useAttemptReviewMedia';

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
// `minWidth: 0` — иначе формулировка не сжимается уже содержимого и толкает
// статус за край карточки; `anywhere` — чтобы колонка стала уже длинного слова.
const promptStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  lineHeight: 1.45,
  minWidth: 0,
  overflowWrap: 'anywhere',
};
// Тон статуса — --jade только на «Верно» (CLAUDE.md «Правило акцента»: смысл
// «сдал/верно»), «N из M» и «Смотрите вы» — тушь приглушённого тона: заливка
// терракотой на этом экране уже занята кнопкой отправки оценки, второго
// красного пятна быть не должно.
const statusToneStyle: Record<'jade' | 'neutral', CSSProperties> = {
  jade: { color: 'var(--jade)' },
  neutral: { color: 'var(--ink-soft)' },
};
const statusStyle: CSSProperties = { flexShrink: 0 };
const metaStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };
// Свободный ответ — что угодно, включая ссылку одним словом.
const answerStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.7,
  overflowWrap: 'anywhere',
};

interface AttemptReviewQuestionProps {
  index: number;
  question: AttemptReviewQuestionDto;
  /** Видео этого вопроса, уже отобранное вызывающим — см. комментарий вверху
   * файла. По умолчанию пусто — у вопроса без видео-ответа своей записи нет. */
  media?: ExamMediaDto[];
  video: AttemptReviewVideoControls;
}

export function AttemptReviewQuestion({
  index,
  question,
  media = [],
  video,
}: AttemptReviewQuestionProps) {
  const hasOptions = question.options.length > 0;
  const isVideo = question.kind === 'video';
  const status = attemptReviewQuestionStatus(question, media.length > 0);
  const showNoAnswerMeta = hasOptions && !question.answered;

  return (
    <div style={rowStyle}>
      <div style={headStyle}>
        <span style={promptStyle}>
          {index + 1}. <PromptText text={question.prompt} />
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
      {/* Ссылка и в подсказке кликабельна (ADR-0093): ученик видит её такой
          на экране сдачи (QuestionRow.tsx), и учитель, проверяя работу,
          должен открыть ровно то же, а не переписывать адрес руками. */}
      {question.hint && (
        <p style={metaStyle}>
          Подсказка ученику: <PromptText text={question.hint} />
        </p>
      )}
      {question.criteria && (
        <p style={metaStyle}>Критерии проверки: {question.criteria}</p>
      )}

      {hasOptions ? (
        <AttemptReviewQuestionOptions options={question.options} />
      ) : isVideo ? (
        <AttemptReviewMedia
          media={media}
          onMarkManual={() => video.markMediaManual(question.itemId)}
          marking={video.markMediaStateFor(question.itemId).pending}
          markError={video.markMediaStateFor(question.itemId).error}
          onSendToMe={video.sendMediaToMe}
          sendStateFor={video.sendMediaStateFor}
          botChatActive={video.botChatActive}
          offersTelegramLink={video.offersTelegramLink}
        />
      ) : (
        <p style={answerStyle}>
          {question.answerText?.trim() ? question.answerText : ATTEMPT_NO_ANSWER_TEXT}
        </p>
      )}

      {question.optionsCheck && (
        <p style={metaStyle}>{formatOptionsCheckSummary(question.optionsCheck)}</p>
      )}
      {showNoAnswerMeta && <p style={metaStyle}>{ATTEMPT_NO_ANSWER_TEXT}</p>}
    </div>
  );
}
