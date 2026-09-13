// Карточка одного экзамена на экране ученика (ТЗ п.1): название, описание,
// сколько попыток осталось, состояние последней попытки простыми словами,
// одна кнопка по смыслу. Стиль карточки — как у StudentLessonCard.tsx
// (общий readOnlyCardStyle: список ученика не про клик по карточке).
import type { CSSProperties } from 'react';
import type { MyExamDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { describeNoAction, formatAttemptsLeft, getExamAction } from './examAttemptState';

const readOnlyCardStyle: CSSProperties = { ...listCardStyle, cursor: 'default' };
const descriptionStyle: CSSProperties = { margin: '6px 0 0', fontSize: 13 };
const actionRowStyle: CSSProperties = { marginTop: 10 };

const ACTION_LABEL = { continue: 'Продолжить', start: 'Начать' } as const;

interface StudentExamCardProps {
  exam: MyExamDto;
  pending: boolean;
  error: string | null;
  onStart: () => void;
}

export function StudentExamCard({ exam, pending, error, onStart }: StudentExamCardProps) {
  const action = getExamAction(exam);

  return (
    <li>
      <div style={readOnlyCardStyle}>
        <div style={listCardTitleStyle}>{exam.title}</div>
        <div style={listCardMetaStyle}>{formatAttemptsLeft(exam)}</div>
        {exam.description && <p style={descriptionStyle}>{exam.description}</p>}

        <div style={actionRowStyle}>
          {action ? (
            <Button type="button" pending={pending} onClick={onStart}>
              {ACTION_LABEL[action]}
            </Button>
          ) : (
            <p style={listCardMetaStyle}>{describeNoAction(exam)}</p>
          )}
        </div>

        {error && (
          <p role="alert" style={{ margin: '6px 0 0', color: 'var(--danger)' }}>
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
