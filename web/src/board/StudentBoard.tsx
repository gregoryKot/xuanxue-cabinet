// Доска ученика (ADR-0173): сверху вниз экзамены к сдаче, оплата за месяц
// (только ученику), ближайшее занятие. Порядок — по срочности: что сдавать и
// платить, потом когда прийти. Каждая секция — свой компонент со своим хуком
// данных, здесь только раскладка. Объявление школы стоит выше, в
// BoardScreen.tsx: оно общее с доской штата (BoardNotice.tsx).
// Для штата в режиме ученика (ADR-0163) карточки оплаты нет: деньги в режим
// не входят, сервер ответил бы отказом (isPaymentContactVisible).
import type { MeDto } from '@xuanxue/shared';
import { isPaymentContactVisible } from '../student/myPaymentsVisibility';
import { BoardExamsSection } from './BoardExamsSection';
import { BoardNextLesson } from './BoardNextLesson';
import { BoardPaymentCard } from './BoardPaymentCard';

interface StudentBoardProps {
  me: MeDto | null;
}

export function StudentBoard({ me }: StudentBoardProps) {
  return (
    <>
      <BoardExamsSection />
      {isPaymentContactVisible(me) && <BoardPaymentCard />}
      <BoardNextLesson />
    </>
  );
}
