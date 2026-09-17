// Карточка одного экзамена на экране ученика (ТЗ п.1, результат — ТЗ слоя
// 4.7): название, описание, сколько попыток осталось, состояние последней
// попытки простыми словами, одна кнопка по смыслу — а если работу уже
// проверили, ещё и итог с баллами по критериям. Стиль карточки — как у
// StudentLessonCard.tsx (общий readOnlyCardStyle: список ученика не про клик
// по карточке). Итог вынесен в ExamAttemptOutcome — своя логика, что
// показывать, не должна раздувать саму карточку (CLAUDE.md «Храповики»,
// лимит 150 строк).
import type { CSSProperties } from 'react';
import type { MyExamDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { ExamAttemptOutcome } from './ExamAttemptOutcome';
import { describeNoAction, formatAttemptsLeft, getExamAction } from './examAttemptState';

const readOnlyCardStyle: CSSProperties = { ...listCardStyle, cursor: 'default' };
const descriptionStyle: CSSProperties = { margin: '6px 0 0', fontSize: 13 };
const actionRowStyle: CSSProperties = { marginTop: 10 };

const ACTION_LABEL = {
  continue: 'Продолжить',
  start: 'Начать',
  retry: 'Пройти ещё раз',
} as const;

interface StudentExamCardProps {
  exam: MyExamDto;
  pending: boolean;
  error: string | null;
  onStart: () => void;
}

export function StudentExamCard({ exam, pending, error, onStart }: StudentExamCardProps) {
  const action = getExamAction(exam);
  const attempt = exam.lastAttempt;
  const showOutcome = attempt?.status === 'graded' && attempt.outcome !== undefined;

  return (
    <li>
      <div style={readOnlyCardStyle}>
        <div style={listCardTitleStyle}>{exam.title}</div>
        <div style={listCardMetaStyle}>{formatAttemptsLeft(exam)}</div>
        {exam.description && <p style={descriptionStyle}>{exam.description}</p>}

        {/* Итог — рядом с кнопкой, а не вместо неё: после «нужно доработать»
            ученик и читает разбор, и жмёт «Пройти ещё раз» на той же
            карточке. Пока оценки нет, блок не рисуется вовсе — честное
            отсутствие вместо пустых строк (CLAUDE.md «число в своём
            разделе»). */}
        {showOutcome && attempt?.outcome && (
          <div style={actionRowStyle}>
            <ExamAttemptOutcome
              outcome={attempt.outcome}
              criteria={attempt.criteria}
              comment={attempt.comment}
            />
          </div>
        )}

        {/* Кнопка — если есть что нажать. Строки «Экзамен проверен» под
            итогом не будет: заголовок итога говорит то же самое, а два
            сообщения об одном читаются как сбой. */}
        {action ? (
          <div style={actionRowStyle}>
            <Button type="button" variant="secondary" pending={pending} onClick={onStart}>
              {ACTION_LABEL[action]}
            </Button>
          </div>
        ) : (
          !showOutcome && (
            <div style={actionRowStyle}>
              <p style={listCardMetaStyle}>{describeNoAction(exam)}</p>
            </div>
          )
        )}

        {error && (
          <p role="alert" style={{ margin: '6px 0 0', color: 'var(--danger)' }}>
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
