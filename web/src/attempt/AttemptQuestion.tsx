// Один вопрос на экране сдачи (ТЗ п.2) — формулировка, подсказка (она для
// ученика и написана — критерии проверки сюда не попадают, их в снимке
// вовсе нет, AttemptQuestionDto без `criteria`), поле ответа по типу.
//
// Строка нумерованного списка на волосяной линии (`.xuanxue-question-row`,
// index.css): номер антиквой слева, формулировка обычным начертанием —
// тот же приём, что у списка вопросов в редакторе экзамена
// (exams/ExamQuestionList.tsx) и у разбора попытки глазами учителя
// (grading/AttemptReviewQuestion.tsx). Жирный шрифт ушёл намеренно: когда
// на экране жирным набрано всё, вес перестаёт что-либо значить
// (docs/adr/0031).
//
// Формулировка — подпись поля ответа (`aria-labelledby`), а не отдельная
// строка «Ответ на вопрос 2»: ученику и скринридеру нужен сам вопрос, а
// дублировать его видимой подписью под ним же незачем.
import type { CSSProperties } from 'react';
import type { AttemptQuestionDto } from '@xuanxue/shared';
import type { UseAttemptAutosaveResult } from './useAttemptAutosave';
import { AttemptQuestionChoice } from './AttemptQuestionChoice';
import { AttemptQuestionText } from './AttemptQuestionText';
import { AttemptQuestionVideo } from './AttemptQuestionVideo';

const numberStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 24,
  lineHeight: 1,
  color: 'var(--ink-faint)',
  paddingTop: 2,
};
const bodyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const promptStyle: CSSProperties = { fontSize: 17, lineHeight: 1.5 };
const hintStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-soft)',
  marginTop: -6,
};

interface AttemptQuestionProps {
  index: number;
  question: AttemptQuestionDto;
  autosave: UseAttemptAutosaveResult;
}

export function AttemptQuestion({ index, question, autosave }: AttemptQuestionProps) {
  const answer = autosave.getAnswer(question.itemId);
  const promptId = `attempt-prompt-${question.itemId}`;

  function changeOptions(optionIds: string[]) {
    autosave.setOptions(question.itemId, optionIds);
    autosave.flush();
  }

  return (
    <li className="xuanxue-question-row">
      <span style={numberStyle}>{index + 1}</span>
      <div style={bodyStyle}>
        <span id={promptId} style={promptStyle}>
          {question.prompt}
        </span>
        {question.hint && <span style={hintStyle}>{question.hint}</span>}

        {question.kind === 'text' && (
          <AttemptQuestionText
            labelledBy={promptId}
            value={answer?.text ?? ''}
            onChange={(text) => autosave.setText(question.itemId, text)}
            onBlur={autosave.flush}
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
        {question.kind === 'video' && <AttemptQuestionVideo />}
      </div>
    </li>
  );
}
