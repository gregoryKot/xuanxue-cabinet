// Маршруты страницы события — `/events/new` и `/events/:eventId` (ADR-0177).
// Событие грузится из списка (useEventEditor.ts), форма собирается после
// ответа: LoadedPage.tsx показывает её только когда запись на руках, иначе
// форма завела бы состояние на пустой записи (useEntityForm).
import { useParams } from 'react-router-dom';
import { LoadedPage } from '../components/LoadedPage';
import { EventEditorForm } from './EventEditorForm';
import { useEventEditor } from './useEventEditor';

export default function EventEditorScreen() {
  // Адреса два: у `/events/new` параметра нет вовсе — это новое событие.
  const { eventId } = useParams<{ eventId: string }>();
  const editor = useEventEditor(eventId);

  return (
    <LoadedPage
      loading={editor.loading}
      error={editor.error}
      onRetry={() => void editor.reload()}
      skeletonWidths={['40%', '90%', '60%', '70%']}
    >
      {() => <EventEditorForm event={editor.entity} editor={editor} />}
    </LoadedPage>
  );
}
