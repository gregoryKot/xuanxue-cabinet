// Ответ свободным текстом (ТЗ п.2) — textarea с лимитом ATTEMPT_LIMITS.
// answerText. `onBlur` — «уход с вопроса» (ТЗ: автосохранение ещё и здесь,
// не только через 2 секунды).
import { ATTEMPT_LIMITS } from '@xuanxue/shared';
import { inputStyle } from '../components/Field';

interface AttemptQuestionTextProps {
  index: number;
  value: string;
  onChange: (text: string) => void;
  onBlur: () => void;
}

export function AttemptQuestionText({
  index,
  value,
  onChange,
  onBlur,
}: AttemptQuestionTextProps) {
  return (
    <textarea
      aria-label={`Ответ на вопрос ${index + 1}`}
      style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
      maxLength={ATTEMPT_LIMITS.answerText}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  );
}
