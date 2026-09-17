// Строка вопроса нумерованного списка на волосяной линии
// (`.xuanxue-question-row`, index.css): номер антиквой слева, формулировка
// обычным начертанием. Жирный шрифт ушёл намеренно: когда на экране жирным
// набрано всё, вес перестаёт что-либо значить (docs/adr/0031).
//
// Формулировка — подпись поля ответа (`aria-labelledby`), а не отдельная
// строка «Ответ на вопрос 2»: пользователю и скринридеру нужен сам вопрос, а
// дублировать его видимой подписью под ним же незачем.
//
// Общий для экрана сдачи (attempt/AttemptQuestion.tsx) и предпросмотра
// «глазами ученика» (exams/ExamPreviewQuestion.tsx): одна строка вопроса в
// обоих местах — иначе jscpd ловит дубль, а облик расходится (CLAUDE.md
// «Одна механика — один компонент»).
import type { CSSProperties, ReactNode } from 'react';

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

interface QuestionRowProps {
  index: number;
  /** Идентификатор формулировки — подпись поля ответа снизу (`aria-labelledby`). */
  promptId: string;
  prompt: string;
  hint?: string;
  children?: ReactNode;
}

export function QuestionRow({
  index,
  promptId,
  prompt,
  hint,
  children,
}: QuestionRowProps) {
  return (
    <li className="xuanxue-question-row">
      <span style={numberStyle}>{index + 1}</span>
      <div style={bodyStyle}>
        <span id={promptId} style={promptStyle}>
          {prompt}
        </span>
        {hint && <span style={hintStyle}>{hint}</span>}
        {children}
      </div>
    </li>
  );
}
