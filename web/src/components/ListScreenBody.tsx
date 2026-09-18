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

const plainListStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };

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
  /** Стиль обёртки `<ul>` — по умолчанию голый список без своего фона.
   * Экран передаёт карточку-обёртку, когда строки красит волосяная линия
   * сама, а не своя карточка на строку (exams/ExamsScreen.tsx, тот же приём,
   * что у журнала рассылок, docs/adr/0043). */
  listStyle?: CSSProperties;
}

export function ListScreenBody<TItem>({
  items,
  loading,
  error,
  onRetry,
  emptyMessage,
  renderItem,
  listStyle,
}: ListScreenBodyProps<TItem>) {
  if (error) return <LoadErrorBanner message={error} onRetry={onRetry} />;
  if (loading) return <SkeletonList rows={SKELETON_ROWS} h={SKELETON_ROW_HEIGHT_PX} />;
  if (!items || items.length === 0) return <p style={{ margin: 0 }}>{emptyMessage}</p>;

  return <ul style={listStyle ?? plainListStyle}>{items.map(renderItem)}</ul>;
}
