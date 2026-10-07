// Список карточек событий школы (ADR-0177) — одна механика на две доски:
// ученик читает событие (название, даты, место, подробности), штат видит те
// же карточки ссылками на страницу правки. Карточка, поданная ссылкой, подробностей
// не рисует: RichText превращает @ник в ссылку, а ссылка внутри ссылки —
// невалидный HTML; полный текст штат видит там же, где правит. Даты — по часам
// зрителя (formatEventDates.ts).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { SchoolEventDto } from '@xuanxue/shared';
import {
  cardListStyle,
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { RichText } from '../components/RichText';
import { eventEditorPath } from './eventPaths';
import { formatEventDates } from './formatEventDates';

// Карточка читается, а не нажимается — курсор-«рука» только у ссылки.
const articleStyle: CSSProperties = { ...listCardStyle, cursor: 'default' };
const linkStyle: CSSProperties = {
  ...listCardStyle,
  color: 'inherit',
  textDecoration: 'none',
};
const titleStyle: CSSProperties = { ...listCardTitleStyle, margin: 0 };
const datesStyle: CSSProperties = { margin: '6px 0 0', fontSize: 15 };
const placeStyle: CSSProperties = { ...listCardMetaStyle, margin: '2px 0 0' };
const descriptionStyle: CSSProperties = {
  margin: '10px 0 0',
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-line',
};

interface EventCardProps {
  event: SchoolEventDto;
  /** Карточка-ссылка на правку — для штата; без неё это текст для ученика. */
  editable: boolean;
}

function EventCard({ event, editable }: EventCardProps) {
  const body = (
    <>
      <h3 style={titleStyle}>{event.title}</h3>
      <p style={datesStyle}>{formatEventDates(event)}</p>
      {event.place && <p style={placeStyle}>{event.place}</p>}
      {!editable && event.description && (
        <p style={descriptionStyle}>
          <RichText text={event.description} />
        </p>
      )}
    </>
  );

  if (editable) {
    return (
      <Link to={eventEditorPath(event.id)} style={linkStyle}>
        {body}
      </Link>
    );
  }
  return <article style={articleStyle}>{body}</article>;
}

interface EventCardListProps {
  events: SchoolEventDto[];
  editable: boolean;
}

export function EventCardList({ events, editable }: EventCardListProps) {
  return (
    <ul style={cardListStyle}>
      {events.map((event) => (
        <li key={event.id}>
          <EventCard event={event} editable={editable} />
        </li>
      ))}
    </ul>
  );
}
