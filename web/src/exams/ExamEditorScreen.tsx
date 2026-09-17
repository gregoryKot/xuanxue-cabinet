// Маршруты редактора экзамена — `/exams/new` и `/exams/:examId` (ADR-0033).
// Загрузка, ошибка и «содержимое только после ответа сервера» — общий
// components/LoadedPage.tsx.
import { useParams } from 'react-router-dom';
import { LoadedPage } from '../components/LoadedPage';
import { ExamEditorForm } from './ExamEditorForm';
import { useExamEditor } from './useExamEditor';

export default function ExamEditorScreen() {
  // Адреса два: у `/exams/new` параметра нет вовсе — это новый экзамен.
  const { examId } = useParams<{ examId: string }>();
  const editor = useExamEditor(examId);

  return (
    <LoadedPage
      loading={editor.loading}
      error={editor.error}
      onRetry={() => void editor.reload()}
      skeletonWidths={['40%', '90%', '70%']}
    >
      {() => <ExamEditorForm exam={editor.entity} editor={editor} />}
    </LoadedPage>
  );
}
