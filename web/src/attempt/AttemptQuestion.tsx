// Один вопрос на экране сдачи (ТЗ п.2) — формулировка и поле ответа по типу.
// Подсказка ученику и критерии проверки убраны из вопроса вместе с полями
// (ADR-0128).
//
// Строка вопроса — общий components/QuestionRow.tsx (его же комментарий-шапка:
// та же строка нужна предпросмотру «глазами ученика», exams/ExamPreviewQuestion.tsx).
import type { AttemptQuestionDto } from '@xuanxue/shared';
import { QuestionRow } from '../components/QuestionRow';
import type { AttemptVideoControls } from './useAttemptMedia';
import type { UseAttemptAutosaveResult } from './useAttemptAutosave';
import { AttemptQuestionChoice } from './AttemptQuestionChoice';
import { AttemptQuestionText } from './AttemptQuestionText';
import { AttemptQuestionVideo } from './AttemptQuestionVideo';

interface AttemptQuestionProps {
  index: number;
  question: AttemptQuestionDto;
  /** Вопрос остался без ответа, а ученик уже нажал «Отправить»
   * (attemptUnanswered.ts): строка подсвечена, пока ответа нет. */
  unanswered: boolean;
  autosave: UseAttemptAutosaveResult;
  video: AttemptVideoControls;
}

export function AttemptQuestion({
  index,
  question,
  unanswered,
  autosave,
  video,
}: AttemptQuestionProps) {
  const answer = autosave.getAnswer(question.itemId);
  const promptId = `attempt-prompt-${question.itemId}`;

  function changeOptions(optionIds: string[]) {
    autosave.setOptions(question.itemId, optionIds);
    // flush() теперь возвращает промис (useAttemptAutosave.ts, аудит
    // 2026-09-21) — здесь сбой не критичен, status уже показывает «не
    // сохранилось», а фоновый повтор и submit() (AttemptInProgress.tsx)
    // подхватят сами.
    autosave.flush().catch(() => {});
  }

  return (
    <QuestionRow
      index={index}
      promptId={promptId}
      prompt={question.prompt}
      unanswered={unanswered}
    >
      {question.kind === 'text' && (
        <AttemptQuestionText
          labelledBy={promptId}
          value={answer?.text ?? ''}
          onChange={(text) => autosave.setText(question.itemId, text)}
          onBlur={() => {
            autosave.flush().catch(() => {});
          }}
        />
      )}
      {(question.kind === 'single' || question.kind === 'multiple') && (
        <AttemptQuestionChoice
          labelledBy={promptId}
          itemId={question.itemId}
          kind={question.kind}
          options={question.options}
          selected={answer?.optionIds ?? []}
          onChange={changeOptions}
        />
      )}
      {question.kind === 'video' && (
        <AttemptQuestionVideo itemId={question.itemId} video={video} />
      )}
    </QuestionRow>
  );
}
