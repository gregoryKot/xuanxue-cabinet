// Рубрика «События» на доске ученика (ADR-0177): ретрит, семинар, выезд —
// то, что учитель завёл на своей доске и что наступит или идёт сейчас. Данные
// — GET /me/events, прошедшие сервер не отдаёт. Событий нет — рубрики нет
// вовсе, как у объявления (BoardNotice.tsx): пустая «Событий нет» заставляла
// бы читать про отсутствие новостей; во время загрузки места тоже не
// резервируем, скелетон мигнул бы впустую. Сбой — баннер с повтором.
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { EventCardList } from '../events/EventCardList';
import { BoardSection } from './BoardSection';
import { useMyEvents } from './useMyEvents';

const HEADING = 'События';

export function BoardEvents() {
  const { data: events, error, reload } = useMyEvents();

  return (
    <>
      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}
      {events && events.length > 0 && (
        <BoardSection heading={HEADING}>
          <EventCardList events={events} editable={false} />
        </BoardSection>
      )}
    </>
  );
}
