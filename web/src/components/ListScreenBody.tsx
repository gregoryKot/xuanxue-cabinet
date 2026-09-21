// Тело списка раздела: баннер ошибки с повтором, скелетон по форме будущих
// строк, честный текст вместо пустоты и сам список (CLAUDE.md «Загрузка»,
// «Данные пользователя — только из API»). Один блок на «Экзамены», «Вопросы»
// и «Каналы»: четыре одинаковых ветки в нескольких файлах jscpd ловит как
// дубль.
//
// Что написать в пустом случае, решает экран: «список пуст» и «с такими
// фильтрами ничего нет» — разные новости для человека.
import type { CSSProperties, ReactNode } from 'react';
import { LoadErrorBanner } from './LoadErrorBanner';
import { SkeletonList } from './Skeleton';

const SKELETON_ROWS = 5;
const SKELETON_ROW_HEIGHT_PX = 72;

interface ListScreenBodyProps<TItem> {
  /** `null` — ещё не загружено. */
  items: TItem[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyMessage: string;
  /** Строка списка вместе с её `key` — `<li>` рисует сам вызывающий; вторым
   * и третьим аргументом приходят индекс и весь массив, как у
   * `Array.prototype.map`, — по ним строка знает, что она последняя
   * (exams/ExamsScreen.tsx, docs/adr/0043). */
  renderItem: (item: TItem, index: number, items: TItem[]) => ReactNode;
  /** Стиль обёртки `<ul>` — одна из трёх готовых форм
   * `components/listCardStyles.ts` (docs/adr/0086): промежуток между строками
   * заявляет список, а не строка, поэтому у пропа нет умолчания — экран
   * выбирает форму сам, под свою строку (`oneCardListStyle` — общая карточка
   * с волосяной линией, как у exams/ExamsScreen.tsx; `cardListStyle` — колонка
   * карточек-строк с воздухом; `dividedListStyle` — голый список, где ритм
   * держит линия у самой строки). */
  listStyle: CSSProperties;
  /** Подпись кнопки повтора — по умолчанию VOICE-умолчание LoadErrorBanner;
   * «Обновить» переопределяет её там, где пользователей уже приучили к этой
   * подписи (ArchiveScreen.tsx/LibraryScreen.tsx, docs/PLAN.md §14). */
  retryLabel?: string;
  /** Число и высота строк скелетона — по умолчанию SKELETON_ROWS/
   * SKELETON_ROW_HEIGHT_PX; переопределяются, когда строка списка заметно
   * выше обычной (ArchiveScreen.tsx — дата, тема и несколько записей). */
  skeletonRows?: number;
  skeletonHeight?: number;
}

export function ListScreenBody<TItem>({
  items,
  loading,
  error,
  onRetry,
  emptyMessage,
  renderItem,
  listStyle,
  retryLabel,
  skeletonRows = SKELETON_ROWS,
  skeletonHeight = SKELETON_ROW_HEIGHT_PX,
}: ListScreenBodyProps<TItem>) {
  if (error) {
    return <LoadErrorBanner message={error} onRetry={onRetry} retryLabel={retryLabel} />;
  }
  if (loading) return <SkeletonList rows={skeletonRows} h={skeletonHeight} />;
  if (!items || items.length === 0) return <p style={{ margin: 0 }}>{emptyMessage}</p>;

  return <ul style={listStyle}>{items.map(renderItem)}</ul>;
}
