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
const EXPLANATION = 'Занятия, которые уже прошли. Пропустили — посмотрите запись здесь.';
const EMPTY_MESSAGE = 'Прошедших занятий пока нет.';
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
