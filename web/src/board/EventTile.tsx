// Плитка события школы на главной (ADR-0177, плитка — ADR-0178): название —
// заголовок плитки, под ним даты по часам зрителя (formatEventDates.ts) и
// место. Ученик читает событие целиком вместе с подробностями; у учителя
// плитка — ссылка на страницу правки, подробностей в ней нет: RichText
// превращает @ник в ссылку, а ссылка внутри ссылки — невалидный HTML, полный
// текст штат видит там же, где правит.
import type { CSSProperties } from 'react';
import type { SchoolEventDto } from '@xuanxue/shared';
import { RichText } from '../components/RichText';
import { eventEditorPath } from '../events/eventPaths';
import { formatEventDates } from '../events/formatEventDates';
import { BoardTile } from './BoardTile';

const datesStyle: CSSProperties = { margin: 0, fontSize: 15 };
const placeStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };
const descriptionStyle: CSSProperties = {
  margin: 0,
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-line',
};

interface EventTileProps {
  event: SchoolEventDto;
  /** Плитка-ссылка на правку — для штата; без неё это текст для ученика. */
  editable: boolean;
}

export function EventTile({ event, editable }: EventTileProps) {
  const body = (
    <>
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
      <BoardTile title={event.title} to={eventEditorPath(event.id)}>
        {body}
      </BoardTile>
    );
  }
  return <BoardTile title={event.title}>{body}</BoardTile>;
}
