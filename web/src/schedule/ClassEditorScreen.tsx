// Маршруты страницы занятия расписания — `/schedule/new` и
// `/schedule/:classId` (ADR-0033). Загрузка, ошибка и «содержимое только
// после ответа сервера» — общий components/LoadedPage.tsx.
//
// Группы ждём наравне с самим занятием: форма собирает начальное состояние один
// раз при монтировании (useClassForm), и радио «Группа» без списка нечем
// рисовать (ADR-0195).
import { useParams } from 'react-router-dom';
import { LoadedPage } from '../components/LoadedPage';
import { useGroups } from '../groups/useGroups';
import { ClassEditorForm } from './ClassEditorForm';
import { useClassEditor } from './useClassEditor';

export default function ClassEditorScreen() {
  // Адреса два: у `/schedule/new` параметра нет вовсе — это новое занятие.
  const { classId } = useParams<{ classId: string }>();
  const editor = useClassEditor(classId);
  const groupsState = useGroups();

  return (
    <LoadedPage
      // Группы ждём только в первый раз: «Обновить» после сбоя не должен
      // прятать форму скелетоном и стирать набранное.
      loading={editor.loading || (groupsState.loading && groupsState.groups === null)}
      error={editor.error}
      onRetry={() => void editor.reload()}
      skeletonWidths={['40%', '90%', '70%']}
    >
      {() => (
        <ClassEditorForm classDto={editor.entity} groups={groupsState} editor={editor} />
      )}
    </LoadedPage>
  );
}
