// Раскладка оболочки кабинета — высота, ширина листа, колонка содержимого
// (AppShell.tsx). Вынесено из самого AppShell.tsx: комментарии про прокрутку
// внутри оболочки вывели тот файл за 150 строк храповика (CLAUDE.md
// «Храповики»).
import type { CSSProperties } from 'react';

// Ширина рамки макета (ADR-0043, screens/2a-broadcasts.html): на ней нав и
// контент совпадают с мокапом один в один, а шире — лист центрируется полями,
// а не висит у левого края (на мониторе владельца ~2000px колонка 880px
// стояла прижатой влево, справа пустовало ~1100px бумаги).
const SHELL_MAX_WIDTH_PX = 1120;

// Оболочка ровно в высоту экрана, и прокручивается не страница, а область
// содержимого внутри неё (contentColumnStyle ниже). Так нижняя панель вкладок
// перестаёт участвовать в прокрутке вообще: на iOS оттяжку (rubber-band) и
// инерцию Safari применяет ко всему документу разом, и `position: sticky`
// панель от этого не спасал — она уезжала за нижний край (отзыв владельца
// 2026-09-18 «нижнее меню скачет», снимок «Экзаменов»; механика — в
// bottomNavStyles.ts). `100dvh`, не `100vh`: на телефоне адресная строка то
// есть, то нет, и `100vh` её появление не отслеживает.
//
// Плата за приём известна и принята: при открытой клавиатуре подвести поле в
// видимую часть должен внутренний скроллер, а не страница. Safari и Chrome
// это умеют, а самый насыщенный полями экран — вход — лежит вообще вне
// оболочки (`.xuanxue-entry-page`, index.css). Прокрутки страницы в кабинете
// никто не трогает руками: `window.scrollTo` нет нигде, а `scrollIntoView`
// (hooks/useScrollToHash.ts, broadcasts/ManualDeliveriesSection.tsx) во
// вложенном скроллере работает как работал.
export const shellStyle: CSSProperties = {
  height: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export const shellRowStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0,
  width: '100%',
  maxWidth: SHELL_MAX_WIDTH_PX,
  marginInline: 'auto',
};

export const contentColumnStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  // Единственное место, которое прокручивается. `overscroll-behavior: contain`
  // не даёт оттяжке в конце списка утянуть за собой страницу целиком — иначе
  // вернулась бы ровно та картина, из-за которой панель и уезжала.
  overflowY: 'auto',
  overscrollBehavior: 'contain',
};
