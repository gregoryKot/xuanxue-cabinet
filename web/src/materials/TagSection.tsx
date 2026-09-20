// Секция экрана тега — заголовок + тело списка (CLAUDE.md «Одна механика —
// один компонент»): «Даты занятий» (TagLessonsSection.tsx) и «Материалы»
// (TagMaterialsSection.tsx) — одна и та же обвязка «заголовок + список +
// честная пустота + ошибка/повтор», различаются только заголовком, данными
// и тем, что рисует строка списка. Без этой обёртки вторая секция повторила
// бы её целиком, и jscpd поймал бы дубль.
import type { CSSProperties, ReactNode } from 'react';
import { ListScreenBody } from '../components/ListScreenBody';
import { oneCardListStyle } from '../components/listCardStyles';
import { screenColumnTitleStyle } from '../components/screenLayout';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };

interface TagSectionProps<TItem> {
  title: string;
  items: TItem[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyMessage: string;
  renderItem: (item: TItem, index: number, items: TItem[]) => ReactNode;
}

export function TagSection<TItem>({
  title,
  items,
  loading,
  error,
  onRetry,
  emptyMessage,
  renderItem,
}: TagSectionProps<TItem>) {
  return (
    <section style={sectionStyle}>
      <h2 style={screenColumnTitleStyle}>{title}</h2>
      <ListScreenBody
        items={items}
        loading={loading}
        error={error}
        onRetry={onRetry}
        emptyMessage={emptyMessage}
        listStyle={oneCardListStyle}
        renderItem={renderItem}
      />
    </section>
  );
}
