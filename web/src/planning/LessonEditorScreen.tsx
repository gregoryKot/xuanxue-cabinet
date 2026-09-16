// Маршруты страницы занятия — `/planning/new` и `/planning/:lessonId`
// (ADR-0033). Загрузка, ошибка и «содержимое только после ответа сервера» —
// общий components/LoadedPage.tsx.
//
// Занятия расписания ждём наравне с самим занятием: форма собирает начальное
// состояние один раз при монтировании (useLessonForm), и у разового занятия
// без загруженного списка не было бы выбранного занятия расписания. Сбой
// `/classes` страницу не закрывает — при правке они нужны только подсказке
// про унаследованную ссылку Zoom, а при создании форма сама объясняет, что
// расписание пустое (LessonFormFields.tsx).
import { useParams } from 'react-router-dom';
import { LoadedPage } from '../components/LoadedPage';
import { useClasses } from '../schedule/useClasses';
import { LessonEditorForm } from './LessonEditorForm';
import { useLessonEditor } from './useLessonEditor';

export default function LessonEditorScreen() {
  // Адреса два: у `/planning/new` параметра нет вовсе — это новое занятие.
  const { lessonId } = useParams<{ lessonId: string }>();
  const editor = useLessonEditor(lessonId);
  const classesState = useClasses();

  return (
    <LoadedPage
      loading={editor.loading || classesState.loading}
      error={editor.error}
      onRetry={() => void editor.reload()}
      skeletonWidths={['40%', '90%', '70%']}
    >
      {() => (
        <LessonEditorForm
          lesson={editor.entity}
          classes={classesState.classes ?? []}
          editor={editor}
        />
      )}
    </LoadedPage>
  );
}
