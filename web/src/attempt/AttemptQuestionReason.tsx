// Поле объяснения выбранного варианта (ADR-0146) — под группой вариантов
// вопроса single/multiple с включённым `askReason`. Видно всегда, а не
// только после выбора варианта: ученик может сначала решить, что напишет, а
// потом отметить вариант (CLAUDE.md «Ноль нагрузки на ученика» — форма не
// прячет от него, что ответ ещё попросит объяснения).
//
// Своя видимая подпись «Объясните свой ответ» (ATTEMPT_REASON_LABEL), не
// `aria-labelledby` формулировкой вопроса, как у обычного текстового
// вопроса (AttemptQuestion.tsx): формулировку тут уже подписывает группа
// вариантов выше, а это отдельное обязательное поле — скринридеру и
// зрячему ученику нужно назвать именно его.
import type { CSSProperties } from 'react';
import { ATTEMPT_REASON_LABEL } from '@xuanxue/shared';
import { AttemptQuestionText } from './AttemptQuestionText';

const wrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelStyle: CSSProperties = { fontSize: 14, fontWeight: 600 };

interface AttemptQuestionReasonProps {
  itemId: string;
  value: string;
  /** Предпросмотр глазами ученика и своя сданная работа (AttemptAnswerFields.tsx):
   * та же строка, но ответить нельзя. */
  disabled?: boolean;
  /** Объяснение обязательно, но не написано, а ученик уже нажал «Отправить»
   * (attemptReasonGuard.ts). */
  invalid?: boolean;
  onChange: (text: string) => void;
  onBlur: () => void;
}

export function AttemptQuestionReason({
  itemId,
  value,
  disabled,
  invalid,
  onChange,
  onBlur,
}: AttemptQuestionReasonProps) {
  const labelId = `attempt-reason-label-${itemId}`;
  return (
    <div style={wrapStyle}>
      <span id={labelId} style={labelStyle}>
        {ATTEMPT_REASON_LABEL}
      </span>
      <AttemptQuestionText
        labelledBy={labelId}
        value={value}
        disabled={disabled}
        invalid={invalid}
        onChange={onChange}
        onBlur={onBlur}
      />
    </div>
  );
}
