// Данные главной ученика (ADR-0178): пять запросов в одном хуке, чтобы
// чистая studentHomeView.ts увидела их вместе и решила, какие плитки рисовать
// и рисовать ли скелетон. Список экзаменов — из MyExamsProvider.tsx, тот же
// запрос, что у «Заданий» и колокольчика; остальные хуки — свои, read-only.
// Оплату просим только тому, кому карточка положена (isPaymentContactVisible):
// штат в режиме ученика (ADR-0163) получил бы от сервера отказ. Скрытую человеком
// плитку (`me.homeHiddenTiles`, ADR-0179) не запрашиваем вовсе — кроме экзаменов:
// список нужен пункту «Задания» в панели (useHasExams), он и так общий.
import { useEffect, useState } from 'react';
import type { HomeTileKey, MeDto } from '@xuanxue/shared';
import { isPaymentContactVisible } from '../student/myPaymentsVisibility';
import { useMyExams } from '../student/MyExamsProvider';
import { useMyLessons } from '../student/useMyLessons';
import { useMyPayments } from '../student/useMyPayments';
import {
  buildStudentHome,
  isHomeLoading,
  type StudentHomeInput,
  type StudentHomeView,
} from './studentHomeView';
import type { HomeSource } from './homeSourceTile';
import { hiddenTilesOf } from './homeTileOptions';
import { useMyBoard } from './useMyBoard';
import { useMyEvents } from './useMyEvents';

export interface UseStudentHomeResult {
  view: StudentHomeView;
  /** Повтор запроса того источника, у которого сбой (кнопка «Обновить»). */
  retry: Record<HomeSource, () => void>;
}

export function useStudentHome(me: MeDto | null): UseStudentHomeResult {
  const hidden = hiddenTilesOf(me);
  const paymentVisible = isPaymentContactVisible(me);
  const isShown = (tile: HomeTileKey) => !hidden.includes(tile);
  const board = useMyBoard({ enabled: isShown('notice') });
  const exams = useMyExams();
  const payments = useMyPayments({ enabled: paymentVisible && isShown('payment') });
  const events = useMyEvents({ enabled: isShown('events') });
  const lessons = useMyLessons({ enabled: isShown('nextLesson') });

  const input: Omit<StudentHomeInput, 'firstLoadDone'> = {
    board,
    exams,
    payments: { data: payments.page, loading: payments.loading, error: payments.error },
    paymentVisible,
    events,
    lessons,
    hidden,
  };

  // Защёлка: повтор после сбоя снова даёт «загрузка без данных», но
  // скелетон на весь экран ради одной плитки не нужен — плитки уже стоят.
  const loading = isHomeLoading({ ...input, firstLoadDone: false });
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  useEffect(() => {
    if (!loading) setFirstLoadDone(true);
  }, [loading]);

  return {
    view: buildStudentHome({ ...input, firstLoadDone }),
    retry: {
      board: () => void board.reload(),
      exams: () => void exams.reload(),
      payments: () => void payments.reload(),
      events: () => void events.reload(),
      lessons: () => void lessons.reload(),
    },
  };
}
