// Рубрика «События» на доске штата (ADR-0177): ближайшие события карточками
// на страницу правки и последней карточка-плюс «Добавить событие». Штат
// читает GET /events (все события, от поздних к ранним), а на доске оставляет
// предстоящие и идущие (upcomingEvents.ts) — прошедшее открывать незачем.
// Событий нет — только плюс. Сбой списка — баннер с повтором, плюс на месте:
// завести событие можно и без списка.
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { AddCard } from '../components/AddCard';
import { EventCardList } from '../events/EventCardList';
import { NEW_EVENT_PATH } from '../events/eventPaths';
import { upcomingEvents } from '../events/upcomingEvents';
import { useSchoolEvents } from '../events/useSchoolEvents';
import { BoardSection } from './BoardSection';

const HEADING = 'События';
const ADD_TITLE = 'Добавить событие';
const ADD_HINT =
  'Ретрит, семинар, выезд: дату и место увидит **каждый ученик** на своей доске.';

export function StaffBoardEvents() {
  const { data, error, reload } = useSchoolEvents();
  const upcoming = data ? upcomingEvents(data, new Date()) : [];

  return (
    <BoardSection heading={HEADING}>
      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}
      {upcoming.length > 0 && <EventCardList events={upcoming} editable />}
      <AddCard to={NEW_EVENT_PATH} title={ADD_TITLE} hint={ADD_HINT} />
    </BoardSection>
  );
}
