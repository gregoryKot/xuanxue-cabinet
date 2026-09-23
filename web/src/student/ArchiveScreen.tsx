// «Записи занятий» — архив ученика (docs/PLAN.md §14, слой 3.3): критерий
// этапа — ученик находит запись прошлого занятия без вопроса в чат. Вход —
// карточка на LessonsScreen.tsx (SectionLink), не пункт меню (ADR-0025).
// Облик — тот же приём, что у MaterialsScreen.tsx: заголовок и объяснение
// шапкой (ScreenHeader), список одной карточкой (oneCardListStyle,
// docs/adr/0043), скелетон по форме будущего списка вместо спиннера —
// ветвление ошибки/загрузки/пустоты/списка живёт в общем ListScreenBody.tsx
// (LibraryScreen.tsx — второй экран ученика с тем же приёмом, jscpd поймал
// дубль на первой версии этого файла).
import { ListScreenBody } from '../components/ListScreenBody';
import { oneCardListStyle } from '../components/listCardStyles';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { ArchivedLessonCard } from './ArchivedLessonCard';
import { useMyArchive } from './useMyArchive';

const TITLE = 'Записи занятий';
// Честно про то, что попадает в список: не все прошедшие занятия, а только
// те, к которым учитель добавил запись — решение владельца 2026-09-22
// (ADR-0114, docs/adr/0114-archive-shows-only-lessons-with-a-recording.md).
// Раньше здесь стояло общее «занятия, которые прошли», и обещание не
// сходилось со списком — пропущенное занятие без записи в нём просто не
// появлялось, без объяснения.
// Второе предложение отвечает на вопрос, который родится первым: «вторник
// был, а его тут нет». Сроков не обещает — когда именно появится запись,
// решает учитель, и выдумывать ему расписание мы не вправе.
const EXPLANATION =
  'Прошедшие занятия, **у которых есть запись**. Пока учитель не выложил её, ' +
  'занятия в списке нет.';
// Пусто теперь значит «записей ещё нет», а не «занятий не было» (тот же
// ADR-0114) — занятия могли пройти, но учитель ещё не выложил запись.
// Ученику тут делать нечего: запись выкладывает учитель (CLAUDE.md «Ноль
// нагрузки на ученика»), поэтому без «добавьте первую», в отличие от формы
// «Вопросов пока нет. Добавьте первый — …» (exam-items/ExamItemsScreen.tsx),
// которая адресована учителю.
const EMPTY_MESSAGE = 'Записей пока нет. Появятся, когда учитель **выложит первую**.';
// «Обновить» — та же подпись, что у соседнего экрана ученика
// (StudentLessonsScreen.tsx), не VOICE-умолчание LoadErrorBanner.
const RETRY_LABEL = 'Обновить';
// Строка занятия выше обычной строки списка (дата, тема, несколько записей)
// — свои число и высота скелетона, не умолчание ListScreenBody.tsx.
const SKELETON_ROWS = 4;
const SKELETON_ROW_HEIGHT_PX = 140;

export default function ArchiveScreen() {
  const { data: lessons, loading, error, reload } = useMyArchive();

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />
      <ListScreenBody
        items={lessons}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        retryLabel={RETRY_LABEL}
        emptyMessage={EMPTY_MESSAGE}
        skeletonRows={SKELETON_ROWS}
        skeletonHeight={SKELETON_ROW_HEIGHT_PX}
        listStyle={oneCardListStyle}
        renderItem={(lesson, index, all) => (
          <ArchivedLessonCard
            key={lesson.id}
            lesson={lesson}
            isLast={index === all.length - 1}
          />
        )}
      />
    </section>
  );
}
