// Страница предпросмотра экзамена «глазами ученика» — `/exams/:examId/preview`
// (ADR-0033, ТЗ 4.3). Данные — useExamPreview.ts; загрузка, ошибка и
// «содержимое только после ответа сервера» — общий components/LoadedPage.tsx.
import { useParams } from 'react-router-dom';
import { LoadedPage } from '../components/LoadedPage';
import { ExamPreview } from './ExamPreview';
import { useExamPreview } from './useExamPreview';

export default function ExamPreviewScreen() {
  const { examId } = useParams<{ examId: string }>();
  const { exam, bankItems, loading, error, reload } = useExamPreview(examId);

  return (
    <LoadedPage
      loading={loading}
      error={error}
      onRetry={() => void reload()}
      skeletonWidths={['30%', '60%', '90%', '80%']}
    >
      {() => {
        // LoadedPage отдаёт содержимое только когда loading снят и ошибки
        // нет — при адресе с примонтированным `examId` это значит, что
        // экзамен уже загружен. Явная проверка вместо `!`: non-null
        // assertion в проекте — предупреждение, объяснять его комментарием
        // менее честно, чем разветвиться (CLAUDE.md «TypeScript строгий»).
        if (exam === null) return null;
        return <ExamPreview exam={exam} bankItems={bankItems} />;
      }}
    </LoadedPage>
  );
}
