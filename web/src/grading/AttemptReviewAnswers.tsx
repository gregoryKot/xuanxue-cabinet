// Левая колонка разбора попытки (Review.dc.html) — заголовок «Ответы» со
// счётчиком вопросов (attemptReviewAnswersMeta.ts), видео экзамена
// (ADR-0023) и блоки вопросов по порядку снимка попытки. Вынесена из
// AttemptReviewScreen.tsx, чтобы экран не разросся выше файлового лимита
// (CLAUDE.md «Храповики»).
import type { CSSProperties } from 'react';
import type { AttemptReviewBlockDto, ExamMediaDto } from '@xuanxue/shared';
import type { FormError } from '../components/FormServerError';
import { screenColumnTitleStyle } from '../components/screenLayout';
import { AttemptReviewBlock } from './AttemptReviewBlock';
import { AttemptReviewMedia } from './AttemptReviewMedia';
import { formatAttemptAnswersSummary } from './attemptReviewAnswersMeta';

const headStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 14,
  flexWrap: 'wrap',
};
const summaryStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
const listStyle: CSSProperties = { borderTop: '1px solid var(--line)' };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 26 };

interface AttemptReviewAnswersProps {
  blocks: AttemptReviewBlockDto[];
  media: ExamMediaDto[];
  onMarkManual: () => Promise<boolean>;
  markingMedia: boolean;
  markMediaError: FormError | null;
}

export function AttemptReviewAnswers({
  blocks,
  media,
  onMarkManual,
  markingMedia,
  markMediaError,
}: AttemptReviewAnswersProps) {
  return (
    <div style={sectionStyle}>
      <div style={headStyle}>
        <h2 style={screenColumnTitleStyle}>Ответы</h2>
        <span style={summaryStyle}>{formatAttemptAnswersSummary(blocks)}</span>
      </div>

      <AttemptReviewMedia
        media={media}
        onMarkManual={onMarkManual}
        marking={markingMedia}
        markError={markMediaError}
      />

      <div style={listStyle}>
        {blocks.map((block) => (
          <AttemptReviewBlock key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
}
