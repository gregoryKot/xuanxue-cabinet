// Ответ свободным текстом (ТЗ п.2) — textarea с лимитом ATTEMPT_LIMITS.
// answerText. `onBlur` — «уход с вопроса» (ТЗ: автосохранение ещё и здесь,
// не только через 2 секунды).
//
// `inputStyle` из Field.tsx, но без обёртки `<Field>`: видимая подпись
// повторила бы формулировку вопроса, стоящую строкой выше. Подпись поля —
// сама формулировка через `aria-labelledby` (AttemptQuestion.tsx).
import { ATTEMPT_LIMITS } from '@xuanxue/shared';
import { inputStyle } from '../components/Field';

// Высота под несколько строк: ученик пишет ответ словами, а поле в одну
// строку просит короткий.
const textareaStyle = { ...inputStyle, minHeight: 120, resize: 'vertical' } as const;

interface AttemptQuestionTextProps {
  labelledBy: string;
  value: string;
  /** Предпросмотр глазами ученика (exams/ExamPreviewQuestion.tsx): та же
   * строка, но ответить нельзя. */
  disabled?: boolean;
  onChange: (text: string) => void;
  onBlur: () => void;
}

export function AttemptQuestionText({
  labelledBy,
  value,
  disabled,
  onChange,
  onBlur,
}: AttemptQuestionTextProps) {
  return (
    <textarea
      aria-labelledby={labelledBy}
      style={textareaStyle}
      maxLength={ATTEMPT_LIMITS.answerText}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  );
}
