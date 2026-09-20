// Одна рубрика ленты уведомлений («Сегодня»/«Раньше») — заголовок и строки
// одной карточкой (ADR-0065). Вынесено из NotificationsScreen.tsx: с шапкой,
// карточками новых заданий и двумя рубриками экран подходил к пределу
// CLAUDE.md «Храповики» (150 строк).
import type { CSSProperties } from 'react';
import type { NotificationDto } from '@xuanxue/shared';
import { oneCardListStyle } from '../components/listCardStyles';
import { NotificationRow } from './NotificationRow';

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
// У `<h2>` свои отступы от браузера — расстояние держит `gap` колонки (тот же
// приём, что headingStyle на TasksScreen.tsx).
const headingStyle: CSSProperties = { margin: 0 };

interface NotificationGroupProps {
  title: string;
  items: NotificationDto[];
  nowIso: string;
  onRead: (id: string) => void;
}

/** Рисуется, только когда в группе есть строки — решает вызывающий
 * (NotificationsScreen.tsx), сам компонент пустую группу не проверяет. */
export function NotificationGroup({
  title,
  items,
  nowIso,
  onRead,
}: NotificationGroupProps) {
  return (
    <div style={groupStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {title}
      </h2>
      <ul style={oneCardListStyle}>
        {items.map((item, index) => (
          <NotificationRow
            key={item.id}
            item={item}
            nowIso={nowIso}
            isLast={index === items.length - 1}
            onRead={() => onRead(item.id)}
          />
        ))}
      </ul>
    </div>
  );
}
