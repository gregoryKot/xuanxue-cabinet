// Левая колонка разбора попытки (Review.dc.html) — заголовок «Ответы» со
// счётчиком вопросов (attemptReviewAnswersMeta.ts) и блоки вопросов по
// порядку снимка попытки; видео каждого видео-вопроса теперь у самого
// вопроса (AttemptReviewQuestion.tsx, ADR-0037), общего блока на попытку
// здесь больше нет — иначе на карточке была бы одна запись дважды. Вынесена
// из AttemptReviewScreen.tsx, чтобы экран не разросся выше файлового лимита
// (CLAUDE.md «Храповики»).
//
// Группировка видео по вопросу — один раз здесь, чистой функцией
// (attemptReviewMediaByQuestion.ts, CLAUDE.md «Логика вне компонентов»):
// результат идёт вниз по дереву (AttemptReviewBlock → AttemptReviewQuestion)
// готовой картой, а не пересчитывается фильтром на каждом вопросе.
import type { CSSProperties } from 'react';
import type { AttemptReviewBlockDto } from '@xuanxue/shared';
import { screenColumnTitleStyle } from '../components/screenLayout';
import { AttemptReviewBlock } from './AttemptReviewBlock';
import { AttemptReviewMedia } from './AttemptReviewMedia';
import { formatAttemptAnswersSummary } from './attemptReviewAnswersMeta';
import { attemptReviewMediaByQuestion } from './attemptReviewMediaByQuestion';
import type { AttemptReviewVideoControls } from './useAttemptReview';

const ORPHAN_MEDIA_HEADING = 'Видео без вопроса';
// VOICE: коротко, на «вы», что случилось и что делать. Причин две, и обе
// про ссылку, а не про нас: до ADR-0037 ссылка в бота вопроса не несла, и
// такие ссылки могли уже уйти ученикам; плюс стык деплоя (ADR-0037
// «Последствия»). Про деплой учителю знать незачем. Назначить вопрос такой
// записи на экране нельзя — значит и не обещаем: действие здесь одно,
// посмотреть и учесть при оценке.
const ORPHAN_MEDIA_EXPLANATION =
  'Запись пришла без вопроса — так бывает со ссылками, отправленными ' +
  'раньше. Посмотрите и учтите её при оценке.';

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
  const questions = blocks.flatMap((block) => block.questions);
  const { byItemId, unassigned } = attemptReviewMediaByQuestion(video.media, questions);

  return (
    <div style={sectionStyle}>
      <div style={headStyle}>
        <h2 style={screenColumnTitleStyle}>Ответы</h2>
        <span style={summaryStyle}>{formatAttemptAnswersSummary(blocks)}</span>
      </div>

      {unassigned.length > 0 && (
        <AttemptReviewMedia
          media={unassigned}
          heading={ORPHAN_MEDIA_HEADING}
          description={ORPHAN_MEDIA_EXPLANATION}
        />
      )}

      <div style={listStyle}>
        {blocks.map((block) => (
          <AttemptReviewBlock
            key={block.id}
            block={block}
            video={video}
            mediaByItemId={byItemId}
          />
        ))}
      </div>
    </div>
  );
}
