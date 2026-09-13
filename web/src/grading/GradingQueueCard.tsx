// Карточка очереди проверки — имя ученика, экзамен, когда сдана, пометка
// «Сдано по времени» (ТЗ 4.6, п.1: `expired` — сдано не человеком, а
// дедлайном). Стиль — components/listCardStyles.ts, тот же, что у карточки
// формы (exams/ExamCard.tsx).
import { DELETED_USER_NAME, type ExamAttemptDto } from '@xuanxue/shared';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { formatDateTime } from '../lib/formatDate';

interface GradingQueueCardProps {
  attempt: ExamAttemptDto;
  onSelect: () => void;
}

export function GradingQueueCard({ attempt, onSelect }: GradingQueueCardProps) {
  return (
    <li>
      <button type="button" style={listCardStyle} onClick={onSelect}>
        <div style={listCardTitleStyle}>{attempt.userName ?? DELETED_USER_NAME}</div>
        <div style={listCardMetaStyle}>
          {attempt.examTitle}
          {attempt.submittedAt && ` · сдано ${formatDateTime(attempt.submittedAt)}`}
          {attempt.expired && ' · сдано по времени'}
        </div>
      </button>
    </li>
  );
}
