// Экран «Задания» — первый экран ученика после входа (решение владельца:
// экзамены — отдельный маршрут, не блок внизу «Занятий», docs/PLAN.md §11).
// Заголовок и объяснение — как у остальных разделов кабинета (ScreenHeader,
// см. exams/ExamsScreen.tsx, broadcasts/BroadcastsScreen.tsx).
//
// Список приехал из StudentExamsSection.tsx (файл удалён вместе с тестом —
// второй копии не осталось): та же карточка (StudentExamCard.tsx). Куда
// ведёт нажатие и что делает старт — useTaskStart.ts (ADR-0119, оба замка:
// «Продолжить» открывает уже известную попытку по id без запроса, успешный
// старт правит список ответом записи, без второго GET).
//
// useMyExams — из MyExamsProvider.tsx (ADR-0063): список общий на всё
// приложение, этот экран и центр уведомлений (счётчик у колокольчика) читают
// один запрос GET /me/exams через контекст, а не заводят каждый свой.
//
// Рубрики — отзыв владельца 2026-09-22 (ADR-0120): живое и законченное
// лежали вперемешку. Теперь наверху то, что ждёт ученика, ниже — то, что уже
// позади; деление — splitTasksToDo.ts, чистая функция с тестом (CLAUDE.md
// «Логика вне компонентов»). Рубрика стоит и над одинокой группой: она
// отвечает на главный вопрос экрана — ждут меня или нет.
//
// Подтверждение перед стартом попытки с лимитом времени (отзыв владельца
// 2026-09-22, ADR-0121): та же механика, что у отправки работы
// (attempt/AttemptSubmitBar.tsx) — ConfirmDialog, `confirmVariant="primary"`,
// старт экзамена не разрушителен. Тексты и решение, спрашивать ли вообще, —
// examStartConfirm.ts; сам POST и переход после закрытия диалога — useTaskStart.ts.
import type { CSSProperties } from 'react';
import type { MyExamDto } from '@xuanxue/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { cardListStyle } from '../components/listCardStyles';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { getExamStartConfirm } from './examStartConfirm';
import { useMyExams } from './MyExamsProvider';
import { splitTasksToDo } from './splitTasksToDo';
import { StudentExamCard } from './StudentExamCard';
import { useTaskStart } from './useTaskStart';

const TITLE = 'Задания';
// Объяснение говорит, что делать и что узнать до первого нажатия, — про
// содержимое списка ученик и так видит по карточкам (отзыв владельца
// 2026-09-22). Срок есть не у каждого экзамена (`timeLimitMin` необязателен),
// отсюда «бывает»; часы у начатой попытки идут от `startedAt` и пауз не
// знают, а просроченную попытку закрывает и отправляет учителю планировщик
// (api/src/exams/exam-deadline-close.service.ts) — поэтому «уходит учителю».
const EXPLANATION =
  'Выберите экзамен и нажмите «Начать». У экзамена бывает срок — тогда часы ' +
  'идут без остановки, даже если вы закрыли вкладку. Не успели — попытка ' +
  'уходит учителю такой, какая есть.';
const EMPTY_MESSAGE = 'Заданий пока нет.';
const TO_DO_RUBRIC = 'Сдавать сейчас';
const DONE_RUBRIC = 'Уже позади';

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
// У `<h2>` свои отступы от браузера — расстояние держит `gap` колонки.
const headingStyle: CSSProperties = { margin: 0 };

export default function TasksScreen() {
  const { data: exams, loading, error, reload } = useMyExams();
  const {
    pendingExamId,
    errors: startErrors,
    confirmExam,
    start,
    confirmStart,
    cancelConfirm,
  } = useTaskStart();
  const confirm = confirmExam ? getExamStartConfirm(confirmExam) : null;

  function renderCard(exam: MyExamDto) {
    return (
      <StudentExamCard
        key={exam.id}
        exam={exam}
        pending={pendingExamId === exam.id}
        error={startErrors[exam.id] || null}
        onStart={() => start(exam)}
      />
    );
  }

  function renderGroup(rubric: string, tasks: MyExamDto[]) {
    if (tasks.length === 0) return null;
    return (
      <div style={groupStyle}>
        <h2 className="xuanxue-eyebrow" style={headingStyle}>
          {rubric}
        </h2>
        <ul style={cardListStyle}>{tasks.map(renderCard)}</ul>
      </div>
    );
  }

  const ready = !loading && !error && exams !== null;
  const { toDo, done } = ready ? splitTasksToDo(exams) : { toDo: [], done: [] };

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}

      {loading && !error && <SkeletonList rows={2} h={104} />}

      {ready && exams.length === 0 && <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>}

      {ready && renderGroup(TO_DO_RUBRIC, toDo)}
      {ready && renderGroup(DONE_RUBRIC, done)}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={confirm.cancelLabel}
          confirmVariant="primary"
          pending={pendingExamId === confirmExam?.id}
          onConfirm={confirmStart}
          onCancel={cancelConfirm}
        />
      )}
    </section>
  );
}
