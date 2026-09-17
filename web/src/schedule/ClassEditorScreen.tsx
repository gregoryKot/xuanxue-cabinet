// Маршруты страницы занятия расписания — `/schedule/new` и
// `/schedule/:classId` (ADR-0033). Загрузка, ошибка и «содержимое только
// после ответа сервера» — общий components/LoadedPage.tsx.
//
// Каналы ждём наравне с самим занятием: форма собирает начальное состояние
// один раз при монтировании (useClassForm), и новому занятию активные
// Telegram-каналы отмечаются заранее (classFormInput.ts) — с пустым списком
// отметок не было бы вовсе.
import { useParams } from 'react-router-dom';
import { useChannels } from '../channels/useChannels';
import { LoadedPage } from '../components/LoadedPage';
import { ClassEditorForm } from './ClassEditorForm';
import { useClassEditor } from './useClassEditor';

export default function ClassEditorScreen() {
  // Адреса два: у `/schedule/new` параметра нет вовсе — это новое занятие.
  const { classId } = useParams<{ classId: string }>();
  const editor = useClassEditor(classId);
  const channelsState = useChannels(true);

  return (
    <LoadedPage
      loading={editor.loading || channelsState.loading}
      error={editor.error}
      onRetry={() => void editor.reload()}
      skeletonWidths={['40%', '90%', '70%']}
    >
      {() => (
        <ClassEditorForm
          classDto={editor.entity}
          channels={channelsState.channels ?? []}
          editor={editor}
        />
      )}
    </LoadedPage>
  );
}
