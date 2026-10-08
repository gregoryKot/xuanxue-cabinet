// Главная ученика (ADR-0173, плитки — ADR-0178): объявление школы, потом
// плитки только с тем, что к человеку относится: экзамены к сдаче, оплата за
// месяц (только ученику), события школы (ADR-0177), ближайшее занятие.
// Порядок — по срочности: что сдавать и платить, потом что случится в школе,
// потом когда прийти. Какие плитки есть, решает чистая studentHomeView.ts по
// данным useStudentHome.ts; здесь только раскладка. Сбой источника — баннер с
// «Обновить» на месте его плитки. Пока всё грузится впервые — один скелетон по
// форме двух плиток; нечего показывать совсем — одна спокойная строка.
// Для штата в режиме ученика (ADR-0163) оплаты нет: деньги в режим не входят.
import type { MeDto } from '@xuanxue/shared';
import { Skeleton } from '../components/Skeleton';
import { BoardExamsTile } from './BoardExamsTile';
import { BoardLoadError } from './BoardLoadError';
import { BoardNextLessonTile } from './BoardNextLessonTile';
import { BoardNoticeCard } from './BoardNoticeCard';
import { BoardPaymentTile } from './BoardPaymentTile';
import { EventTile } from './EventTile';
import { useStudentHome } from './useStudentHome';
import type { HomeSource } from './studentHomeView';

const NOTHING_WAITS_MESSAGE = 'Сейчас от вас ничего не ждут.';
// Форма скелетона — две плитки средней высоты: ровно столько занимают
// «Оплата» и «Ближайшее занятие», самые частые из плиток.
const SKELETON_TILE_HEIGHT_PX = 120;
const SKELETON_TILE_COUNT = 2;
const SKELETON_RADIUS_PX = 16;

interface StudentBoardProps {
  me: MeDto | null;
}

export function StudentBoard({ me }: StudentBoardProps) {
  const { view, retry } = useStudentHome(me);

  if (view.status === 'loading') {
    return (
      <>
        {Array.from({ length: SKELETON_TILE_COUNT }, (_, i) => (
          <Skeleton key={i} h={SKELETON_TILE_HEIGHT_PX} radius={SKELETON_RADIUS_PX} />
        ))}
      </>
    );
  }
  if (view.status === 'empty')
    return <p style={{ margin: 0 }}>{NOTHING_WAITS_MESSAGE}</p>;

  const errorOf = (source: HomeSource) => {
    const message = view.errors[source];
    return message ? <BoardLoadError message={message} onRetry={retry[source]} /> : null;
  };

  return (
    <>
      {errorOf('board')}
      {view.notice && <BoardNoticeCard notice={view.notice} />}
      {errorOf('exams')}
      {view.toDo.length > 0 && <BoardExamsTile exams={view.toDo} />}
      {errorOf('payments')}
      {view.payment && <BoardPaymentTile view={view.payment} />}
      {errorOf('events')}
      {view.events.map((event) => (
        <EventTile key={event.id} event={event} editable={false} />
      ))}
      {errorOf('lessons')}
      {view.nextLesson && <BoardNextLessonTile lesson={view.nextLesson} />}
    </>
  );
}
