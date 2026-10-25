// События на главной штата (ADR-0177, плитки — ADR-0178): ближайшие события
// плитками-ссылками на страницу правки и последней карточка-плюс «Добавить
// событие». Штат читает GET /events (все события, от поздних к ранним), а на
// главной оставляет предстоящие и идущие (upcomingEvents.ts) — прошедшее
// открывать незачем. Событий нет — только плюс. Сбой списка — баннер с
// повтором, плюс на месте: завести событие можно и без списка.
import { AddCard } from '../components/AddCard';
import { NEW_EVENT_PATH } from '../events/eventPaths';
import { upcomingEvents } from '../events/upcomingEvents';
import { useSchoolEvents } from '../events/useSchoolEvents';
import { BoardLoadError } from './BoardLoadError';
import { EventTile } from './EventTile';

const ADD_TITLE = 'Добавить событие';
const ADD_HINT =
  'Ретрит, семинар, выезд: дату и место **каждый ученик** увидит на главной.';

export function StaffBoardEvents() {
  const { data, error, reload } = useSchoolEvents();
  const upcoming = data ? upcomingEvents(data, new Date()) : [];

  return (
    <>
      {error && <BoardLoadError message={error} onRetry={() => void reload()} />}
      {upcoming.map((event) => (
        <EventTile key={event.id} event={event} editable />
      ))}
      <AddCard to={NEW_EVENT_PATH} title={ADD_TITLE} hint={ADD_HINT} />
    </>
  );
}
