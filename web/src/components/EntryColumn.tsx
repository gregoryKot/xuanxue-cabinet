// Колонка экранов до входа — LoginScreen.tsx, EmailLoginCallbackScreen.tsx,
// JoinScreen.tsx (CLAUDE.md «Одна механика — один компонент»). Обычная
// страница на бумаге: белой карточки с тенью посреди серого фона больше нет —
// она читалась как чужое приложение, а не как сайт школы (отзыв владельца
// 2026-09-15, направление docs/adr/0031-visual-direction-quiet-and-noble.md).
//
// Колонка прижата к верху, а не поставлена по центру экрана: на телефоне
// клавиатура съедает половину высоты, и центрированный блок прыгает при
// каждом фокусе поля. Отступ сверху разный на телефоне и на мониторе, поэтому
// живёт классом `.xuanxue-entry-page` в index.css — `CSSProperties` не умеет
// медиа-запрос.
import type { CSSProperties, ReactNode } from 'react';
import { SchoolMark, SCHOOL_NAME } from './SchoolMark';

// 400 — ширина, на которой строка объяснения ложится в две-три строки, а
// поле почты не выглядит полем во всю стену монитора.
const COLUMN_MAX_WIDTH_PX = 400;

const columnStyle: CSSProperties = {
  width: '100%',
  maxWidth: COLUMN_MAX_WIDTH_PX,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
};

const markRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };

export function EntryColumn({ children }: { children: ReactNode }) {
  return (
    <main className="xuanxue-entry-page">
      <div style={columnStyle}>
        {/* Знак здесь НЕ ссылка (в отличие от AppNav.tsx/AppShellBrandRow.tsx,
            SchoolBrandLink.tsx) — до входа у кабинета ещё нет своей главной:
            «/» лежит за RequireAuth и без сессии гвард уводит с него обратно
            на «/login» (cabinetRoutes.tsx, RequireAuth.tsx), а сами экраны
            этой колонки и есть «/login»/приглашение — ссылка вела бы сама в
            себя. */}
        <span style={markRowStyle}>
          <SchoolMark />
          <span className="xuanxue-eyebrow">{SCHOOL_NAME}</span>
        </span>
        {children}
      </div>
    </main>
  );
}
