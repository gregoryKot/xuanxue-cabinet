// Левая колонка разбора попытки (Review.dc.html) — заголовок «Ответы» со
// счётчиком вопросов (attemptReviewAnswersMeta.ts) и блоки вопросов по
// порядку снимка попытки; видео каждого видео-вопроса теперь у самого
// вопроса (AttemptReviewQuestion.tsx, ADR-0037), общего блока на попытку
// здесь больше нет — иначе на карточке была бы одна запись дважды. Вынесена
// из AttemptReviewScreen.tsx, чтобы экран не разросся выше файлового лимита
// (CLAUDE.md «Храповики»).
import type { CSSProperties } from 'react';
import type { AttemptReviewBlockDto } from '@xuanxue/shared';
import { screenColumnTitleStyle } from '../components/screenLayout';
import { AttemptReviewBlock } from './AttemptReviewBlock';
import { AttemptReviewMedia } from './AttemptReviewMedia';
import { formatAttemptAnswersSummary } from './attemptReviewAnswersMeta';
import type { AttemptReviewVideoControls } from './useAttemptReview';

// Старый инстанс мог записать видео без itemId во время деплоя
// (expand → contract, ADR-0037 «Последствия») — такая запись ни к одному
// вопросу не относится, но пропадать из карточки не должна: честная отдельная
// строка, не молчание о полученном видео (тот же приём, что
// AttemptSubmittedVideos.tsx на экране ученика).
const ORPHAN_MEDIA_HEADING = 'Видео без вопроса';

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
  video: AttemptReviewVideoControls;
}

export function AttemptReviewAnswers({ blocks, video }: AttemptReviewAnswersProps) {
  const orphanMedia = video.media.filter((item) => !item.itemId);

  return (
    <div style={sectionStyle}>
      <div style={headStyle}>
        <h2 style={screenColumnTitleStyle}>Ответы</h2>
        <span style={summaryStyle}>{formatAttemptAnswersSummary(blocks)}</span>
      </div>

      {orphanMedia.length > 0 && (
        <AttemptReviewMedia media={orphanMedia} heading={ORPHAN_MEDIA_HEADING} />
      )}

      <div style={listStyle}>
        {blocks.map((block) => (
          <AttemptReviewBlock key={block.id} block={block} video={video} />
        ))}
      </div>
    </div>
  );
}
