// Маршруты редактора экзамена — `/exams/new` и `/exams/:examId` (ADR-0033).
// Экран ждёт ответ сервера и только потом собирает форму: состояние формы
// заводится один раз при монтировании (useEntityForm), и отдать ему пустой
// экзамен, а потом дождаться настоящего — значит показать чужие поля.
import { useParams } from 'react-router-dom';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenSectionStyle } from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { ExamEditorForm } from './ExamEditorForm';
import { useExamEditor } from './useExamEditor';

export default function ExamEditorScreen() {
  // Адреса два: у `/exams/new` параметра нет вовсе — это новый экзамен.
  const { examId } = useParams<{ examId: string }>();
  const editor = useExamEditor(examId);

  if (editor.loading) {
    return (
      <section style={screenSectionStyle}>
        <SkeletonLines widths={['40%', '90%', '70%']} />
      </section>
    );
  }

  if (editor.error) {
    return (
      <section style={screenSectionStyle}>
        <LoadErrorBanner message={editor.error} onRetry={() => void editor.reload()} />
      </section>
    );
  }

  return <ExamEditorForm exam={editor.exam} editor={editor} />;
}
