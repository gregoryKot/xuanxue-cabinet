// Список вариантов ответа в карточке проверки (ТЗ 4.6, п.3) — подпись
// варианта, пометка «верный» и пометка «выбрал ученик». Разметка без логики:
// что считать отвеченным и какой счёт показывать, решают
// attemptReviewQuestionStatus.ts и сам API (exam-attempt-review.ts).
//
// Свой файл, а не часть AttemptReviewQuestion.tsx: тот стоял на 161 строке,
// выше мягкого предела храповика, и строка «нет ответа» его переполнила —
// CLAUDE.md «Храповики» велит в этом случае выносить подкомпонент, а не
// двигать бейслайн вверх.
//
// Картинка варианта (ADR-0035) — миниатюрой перед подписью: снимок попытки
// несёт свой `imageId`, учитель видит ту же картинку, что видел сдающий;
// подпись без текста — formatOptionLabel, тот же приём, что на сдаче.
import type { CSSProperties } from 'react';
import { formatOptionLabel, type AttemptReviewOptionDto } from '@xuanxue/shared';
import { OptionImage } from '../components/OptionImage';

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };

interface AttemptReviewQuestionOptionsProps {
  options: AttemptReviewOptionDto[];
}

export function AttemptReviewQuestionOptions({
  options,
}: AttemptReviewQuestionOptionsProps) {
  return (
    <ul style={listStyle}>
      {options.map((option, index) => (
        <li key={option.id} style={rowStyle}>
          {option.imageId && (
            <OptionImage
              imageId={option.imageId}
              size="thumb"
              alt={formatOptionLabel(option.text, index)}
            />
          )}
          <span>
            {formatOptionLabel(option.text, index)}
            {option.correct && <strong> — верный</strong>}
            {option.selected && <em> · выбрал ученик</em>}
          </span>
        </li>
      ))}
    </ul>
  );
}
