// Главная ученика (ADR-0173, плитки — ADR-0178): плитки только с тем, что к
// человеку относится. Порядок (ADR-0179, владелец 2026-10-09): ближайшее занятие
// первым — «когда мне идти» главный вопрос того, кто открыл ссылку с телефона, —
// затем объявление школы, экзамены к сдаче, оплата за месяц (только ученику) и
// события школы (ADR-0177). Скрытые человеком плитки не рисуются. Какие плитки
// есть, решает чистая studentHomeView.ts по данным useStudentHome.ts; здесь
// только раскладка. Сбой источника — баннер с
// «Обновить» на месте его плитки. Пока всё грузится впервые — один скелетон по
// форме двух плиток; нечего показывать совсем — одна спокойная строка.
// Для штата в режиме ученика (ADR-0163) оплаты нет: деньги в режим не входят.
import type { MeDto } from '@xuanxue/shared';
import { noteStyle } from '../components/screenLayout';
import { Skeleton } from '../components/Skeleton';
import { BoardExamsTile } from './BoardExamsTile';
import { BoardLoadError } from './BoardLoadError';
import { BoardNextLessonTile } from './BoardNextLessonTile';
import { BoardNoticeCard } from './BoardNoticeCard';
import { BoardPaymentTile } from './BoardPaymentTile';
import { EventTile } from './EventTile';
import { useStudentHome } from './useStudentHome';
import type { HomeSource } from './homeSourceTile';

const NOTHING_WAITS_MESSAGE = 'Сейчас от вас ничего не ждут.';
// Только тому, кто сам скрыл плитки (view.hasHidden): иначе подсказка вернуть то,
// чего человек не убирал, сбивала бы с толку.
const RESTORE_HINT = 'Скрытые плитки можно вернуть через «Настроить главную».';
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
  if (view.status === 'empty') {
    return (
      <>
        <p style={{ margin: 0 }}>{NOTHING_WAITS_MESSAGE}</p>
        {view.hasHidden && <p style={noteStyle}>{RESTORE_HINT}</p>}
      </>
    );
  }

  const errorOf = (source: HomeSource) => {
    const message = view.errors[source];
    return message ? <BoardLoadError message={message} onRetry={retry[source]} /> : null;
  };

  return (
    <>
      {errorOf('lessons')}
      {view.nextLesson && <BoardNextLessonTile lesson={view.nextLesson} />}
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
    </>
  );
}
