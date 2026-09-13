// Один вопрос на экране сдачи (ТЗ п.2) — формулировка, подсказка (она для
// ученика и написана — критерии проверки сюда не попадают, их в снимке
// вовсе нет, AttemptQuestionDto без `criteria`), поле ответа по типу.
import type { CSSProperties } from 'react';
import type { AttemptQuestionDto } from '@xuanxue/shared';
import type { UseAttemptAutosaveResult } from './useAttemptAutosave';
import { AttemptQuestionChoice } from './AttemptQuestionChoice';
import { AttemptQuestionText } from './AttemptQuestionText';
import { AttemptQuestionVideo } from './AttemptQuestionVideo';

const questionStyle: CSSProperties = { marginBottom: 16 };
const promptStyle: CSSProperties = { margin: '0 0 4px', fontWeight: 600 };
const hintStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface AttemptQuestionProps {
  index: number;
  question: AttemptQuestionDto;
  autosave: UseAttemptAutosaveResult;
}

export function AttemptQuestion({ index, question, autosave }: AttemptQuestionProps) {
  const answer = autosave.getAnswer(question.itemId);

  function changeOptions(optionIds: string[]) {
    autosave.setOptions(question.itemId, optionIds);
    autosave.flush();
  }

  return (
    <div style={questionStyle}>
      <p style={promptStyle}>
        {index + 1}. {question.prompt}
      </p>
      {question.hint && <p style={hintStyle}>{question.hint}</p>}

      {question.kind === 'text' && (
        <AttemptQuestionText
          index={index}
          value={answer?.text ?? ''}
          onChange={(text) => autosave.setText(question.itemId, text)}
          onBlur={autosave.flush}
        />
      )}
      {(question.kind === 'single' || question.kind === 'multiple') && (
        <AttemptQuestionChoice
          index={index}
          itemId={question.itemId}
          kind={question.kind}
          options={question.options}
          selected={answer?.optionIds ?? []}
          onChange={changeOptions}
        />
      )}
      {question.kind === 'video' && <AttemptQuestionVideo />}
    </div>
  );
}
