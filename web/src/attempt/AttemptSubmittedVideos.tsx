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
import type { ExamAttemptDto } from '@xuanxue/shared';
import { blockCardStyle, dividedListStyle } from '../components/listCardStyles';
import { QuestionRow } from '../components/QuestionRow';
import { RichText } from '../components/RichText';
import { formatExamMediaReceivedAt } from '../lib/examMedia';
import { AttemptQuestionVideo } from './AttemptQuestionVideo';
import { attemptSectionHeadingStyle, attemptSectionStyle } from './attemptLayout';
import {
  attemptVideoHintStyle,
  attemptVideoReceivedListStyle,
} from './attemptVideoStyles';
import { collectVideoQuestions } from './attemptVideoQuestions';
import type { AttemptVideoControls } from './useAttemptMedia';

// Старый инстанс мог записать видео без itemId во время деплоя
// (expand → contract, ADR-0037 «Последствия») — такая запись ни к одному
// вопросу не относится, но пропадать из кабинета не должна: показываем её
// отдельной строкой с честной пометкой, а не молчим о полученном видео.
const ORPHAN_MEDIA_HEADING = 'Видео без вопроса';

// Отзыв тестировщицы 2026-09-23: сдала попытку, дослала ссылку внутри неё и
// не поняла, съест ли досылка вторую попытку. Одна фраза на весь раздел, не
// своя на «дослать вопросу без видео» и «заменить вопросу с видео»: у
// попытки бывает несколько видео-вопросов сразу в обоих состояниях (см. тест
// «видео получено у одного вопроса» ниже), вопрос у ученика один и тот же
// для обоих случаев — отдельная функция-разбор здесь только дублировала бы
// уже готовое условие видимости раздела. Показываем, пока работу можно ещё
// дополнить (video.acceptsAnswers): у проверенной попытки другая
// правда — EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE (AttemptVideoAnswered.tsx). Тот
// же факт для бота — EXAM_MEDIA_ATTEMPT_NOT_CONSUMED_MESSAGE
// (exam-media-respond.ts), без акцента: маркер `**` в Telegram ушёл бы
// звёздочками.
const VIDEO_SECTION_EXPLANATION =
  'Видео к сданной работе можно дослать или заменить, пока учитель её не ' +
  'проверил — **попытку это не тратит**, ссылка ляжет к этой же попытке.';

interface AttemptSubmittedVideosProps {
  attempt: ExamAttemptDto;
  video: AttemptVideoControls;
}

export function AttemptSubmittedVideos({ attempt, video }: AttemptSubmittedVideosProps) {
  const videoQuestions = collectVideoQuestions(attempt);
  const orphanMedia = video.media.filter((item) => !item.itemId);

  if (videoQuestions.length === 0 && orphanMedia.length === 0) return null;

  return (
    <section style={attemptSectionStyle}>
      <h2 style={attemptSectionHeadingStyle}>Видео</h2>
      {videoQuestions.length > 0 && video.acceptsAnswers && (
        <p style={attemptVideoHintStyle}>
          <RichText text={VIDEO_SECTION_EXPLANATION} />
        </p>
      )}
      {videoQuestions.length > 0 && (
        <div style={blockCardStyle}>
          <ol style={dividedListStyle}>
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
          <p style={attemptVideoHintStyle}>{ORPHAN_MEDIA_HEADING}</p>
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
