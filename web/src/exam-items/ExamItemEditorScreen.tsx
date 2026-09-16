// Маршруты страницы вопроса — `/exam-items/new` и `/exam-items/:itemId`
// (ADR-0033). Загрузка, ошибка и «содержимое только после ответа сервера» —
// общий components/LoadedPage.tsx.
import { useParams } from 'react-router-dom';
import { LoadedPage } from '../components/LoadedPage';
import { ExamItemEditorForm } from './ExamItemEditorForm';
import { useExamItemEditor } from './useExamItemEditor';

export default function ExamItemEditorScreen() {
  // Адреса два: у `/exam-items/new` параметра нет вовсе — это новый вопрос.
  const { itemId } = useParams<{ itemId: string }>();
  const editor = useExamItemEditor(itemId);

  return (
    <LoadedPage
      loading={editor.loading}
      error={editor.error}
      onRetry={() => void editor.reload()}
      skeletonWidths={['40%', '90%', '70%']}
    >
      {() => <ExamItemEditorForm item={editor.entity} editor={editor} />}
    </LoadedPage>
  );
}
