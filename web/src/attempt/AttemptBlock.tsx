// Один блок попытки (ТЗ п.2) — заголовок и обязательность из снимка формы,
// вопросы строго в порядке снимка (перемешивание уже применено при старте
// попытки, ExamAttemptsService.start — здесь порядок только рисуем).
import type { CSSProperties } from 'react';
import type { AttemptBlockDto } from '@xuanxue/shared';
import type { UseAttemptAutosaveResult } from './useAttemptAutosave';
import { AttemptQuestion } from './AttemptQuestion';

const blockStyle: CSSProperties = {
  marginBottom: 20,
  paddingBottom: 12,
  borderBottom: '1px solid var(--border)',
};
const titleStyle: CSSProperties = { fontSize: 16, fontWeight: 600, margin: '0 0 10px' };

interface AttemptBlockProps {
  block: AttemptBlockDto;
  autosave: UseAttemptAutosaveResult;
}

export function AttemptBlock({ block, autosave }: AttemptBlockProps) {
  return (
    <section style={blockStyle}>
      {block.title && (
        <h3 style={titleStyle}>
          {block.title}
          {block.required && ' · обязателен'}
        </h3>
      )}
      {block.questions.map((question, index) => (
        <AttemptQuestion
          key={question.itemId}
          index={index}
          question={question}
          autosave={autosave}
        />
      ))}
    </section>
  );
}
