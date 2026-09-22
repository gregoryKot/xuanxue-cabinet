// Строка вопроса нумерованного списка на волосяной линии
// (`.xuanxue-question-row`, index.css): номер гротеском слева, формулировка
// обычным начертанием — почему не антиквой, объясняет комментарий у
// numberStyle ниже (ADR-0043). Жирный шрифт ушёл намеренно: когда на экране
// жирным набрано всё, вес перестаёт что-либо значить (docs/adr/0031).
//
// Формулировка — подпись поля ответа (`aria-labelledby`), а не отдельная
// строка «Ответ на вопрос 2»: пользователю и скринридеру нужен сам вопрос, а
// дублировать его видимой подписью под ним же незачем.
//
// Общий для экрана сдачи (attempt/AttemptQuestion.tsx) и предпросмотра
// «глазами ученика» (exams/ExamPreviewQuestion.tsx): одна строка вопроса в
// обоих местах — иначе jscpd ловит дубль, а облик расходится (CLAUDE.md
// «Одна механика — один компонент»).
//
// Формулировка и подсказка идут через PromptText.tsx (ADR-0093): учитель
// вставляет ссылку на видео прямо в текст вопроса, а не в отдельное поле,
// и здесь она становится кликабельной — сразу и на форме сдачи, и в
// предпросмотре «глазами ученика».
import type { CSSProperties, ReactNode } from 'react';
import { PromptText } from './PromptText';

// Номер вопроса — текстовым шрифтом, не антиквой: у Cormorant цифры
// старостильные, и единица в них — голый штрих, неотличимый от римской «I»
// (ровно та причина, по которой ADR-0043 завёл components/StatNumber.tsx).
// `tabular-nums` держит номера в столбик ровной колонкой.
const numberStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 500,
  lineHeight: 1,
  color: 'var(--ink-faint)',
  fontVariantNumeric: 'tabular-nums',
  paddingTop: 2,
};
const bodyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const promptStyle: CSSProperties = { fontSize: 17, lineHeight: 1.5 };
const hintStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-soft)',
  marginTop: -6,
};
// Отметка «без ответа» перед отправкой (attempt/attemptUnanswered.ts).
// Терракота здесь текстом (--terracotta-text), а заливка на экране остаётся
// одна — кнопка «Отправить» (правило акцента, docs/adr/0031).
const unansweredStyle: CSSProperties = { color: 'var(--terracotta-text)' };
const UNANSWERED_LABEL = 'Без ответа';

interface QuestionRowProps {
  index: number;
  /** Идентификатор формулировки — подпись поля ответа снизу (`aria-labelledby`). */
  promptId: string;
  prompt: string;
  hint?: string;
  /** Вопрос подсвечен как оставшийся без ответа — ученик нажал «Отправить»,
   * и подтверждение отправило его искать пропуски (attempt/
   * AttemptInProgress.tsx). Пока не нажал, не подсвечиваем ничего: ругать
   * форму, которую ещё заполняют, не за что. */
  unanswered?: boolean;
  children?: ReactNode;
}

export function QuestionRow({
  index,
  promptId,
  prompt,
  hint,
  unanswered,
  children,
}: QuestionRowProps) {
  return (
    <li
      className={
        unanswered
          ? 'xuanxue-question-row xuanxue-question-row--unanswered'
          : 'xuanxue-question-row'
      }
    >
      <span style={numberStyle}>{index + 1}</span>
      <div style={bodyStyle}>
        <span id={promptId} style={promptStyle}>
          <PromptText text={prompt} />
        </span>
        {hint && (
          <span style={hintStyle}>
            <PromptText text={hint} />
          </span>
        )}
        {unanswered && (
          <span className="xuanxue-status-label" style={unansweredStyle}>
            {UNANSWERED_LABEL}
          </span>
        )}
        {children}
      </div>
    </li>
  );
}
