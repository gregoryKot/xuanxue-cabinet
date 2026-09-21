// Честная строка учителю под «Вопросы · N»: попытки — снимок формы на
// старте (ADR-0022, attemptsNote.ts), правки сюда не доедут. Пока число
// грузится, при сбое запроса и на чистой базе (0 попыток) — молчим, тем же
// приёмом, что у соседних заметок раздела (grading/gradingQueueHint.ts,
// exam-items/examItemsLinkHint.ts): длинное честное предупреждение уместно,
// только когда есть что предупреждать.
import { noteStyle } from '../components/screenLayout';
import { attemptsNote } from './attemptsNote';
import { useExamAttemptCount } from './useExamAttemptCount';

interface ExamAttemptsNoteProps {
  examId: string;
}

export function ExamAttemptsNote({ examId }: ExamAttemptsNoteProps) {
  const { total } = useExamAttemptCount(examId);
  if (total === null) return null;
  const text = attemptsNote(total);
  return text ? <p style={noteStyle}>{text}</p> : null;
}
