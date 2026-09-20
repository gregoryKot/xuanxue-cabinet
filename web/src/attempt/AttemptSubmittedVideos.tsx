// Блок «Видео» на экране «Отправлено» (ADR-0037: видео — ответ на вопрос,
// не вложение к попытке). Видео приходит из бота асинхронно и часто позже
// самой отправки формы, поэтому ученику нужно видеть у каждого видео-вопроса,
// получено ли уже видео, и мочь дослать его — тем же путём, что на форме
// сдачи (AttemptQuestionVideo.tsx, тот же компонент и тут, и там).
//
// Номер и формулировка вопроса — из collectVideoQuestions(attempt), тот же
// индекс, что видел ученик на форме (её же комментарий-шапка). Строка
// вопроса — общий QuestionRow.tsx (CLAUDE.md «Одна механика — один
// компонент»): номер и текст вопроса не должны собираться дважды по-разному.
import type { CSSProperties } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { QuestionRow } from '../components/QuestionRow';
import { formatExamMediaReceivedAt } from '../lib/examMedia';
import { AttemptQuestionVideo } from './AttemptQuestionVideo';
import {
  attemptVideoHeadingStyle,
  attemptVideoHintStyle,
  attemptVideoReceivedListStyle,
  attemptVideoSectionStyle,
} from './attemptVideoStyles';
import { collectVideoQuestions } from './attemptVideoQuestions';
import type { AttemptVideoControls } from './useAttemptMedia';

const listStyle = { margin: 0, padding: 0, listStyle: 'none' } as const;

// Карточка списка видео-вопросов — направление «Тёплая школа» (ADR-0043);
// локальный литерал, тот же приём и та же причина, что в
// attempt/AttemptInProgress.tsx и grading/AttemptReviewScreen.tsx (не общий
// экспорт — см. комментарий там).
const blockCardStyle: CSSProperties = {
  padding: '20px 22px',
  background: 'var(--card)',
  borderRadius: 'var(--radius-block)',
  boxShadow: 'var(--shadow-card)',
};

// Старый инстанс мог записать видео без itemId во время деплоя
// (expand → contract, ADR-0037 «Последствия») — такая запись ни к одному
// вопросу не относится, но пропадать из кабинета не должна: показываем её
// отдельной строкой с честной пометкой, а не молчим о полученном видео.
const ORPHAN_MEDIA_HINT = 'Видео без вопроса — учитель разберётся, к какому оно заданию.';

interface AttemptSubmittedVideosProps {
  attempt: ExamAttemptDto;
  video: AttemptVideoControls;
}

export function AttemptSubmittedVideos({ attempt, video }: AttemptSubmittedVideosProps) {
  const videoQuestions = collectVideoQuestions(attempt);
  const orphanMedia = video.media.filter((item) => !item.itemId);

  if (videoQuestions.length === 0 && orphanMedia.length === 0) return null;

  return (
    <section style={attemptVideoSectionStyle}>
      <h2 style={attemptVideoHeadingStyle}>Видео</h2>
      {videoQuestions.length > 0 && (
        <div style={blockCardStyle}>
          <ol style={listStyle}>
            {videoQuestions.map(({ question, index }) => (
              <QuestionRow
                key={question.itemId}
                index={index}
                promptId={`attempt-prompt-${question.itemId}`}
                prompt={question.prompt}
                hint={question.hint}
              >
                <AttemptQuestionVideo itemId={question.itemId} video={video} />
              </QuestionRow>
            ))}
          </ol>
        </div>
      )}

      {orphanMedia.length > 0 && (
        <>
          <p style={attemptVideoHintStyle}>{ORPHAN_MEDIA_HINT}</p>
          <ul style={attemptVideoReceivedListStyle}>
            {orphanMedia.map((item) => (
              <li key={item.id}>{formatExamMediaReceivedAt(item)}.</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
