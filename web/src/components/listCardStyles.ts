// Общий стиль строки списка (слот расписания, дата занятия) — CLAUDE.md
// «Одна механика — один компонент»: раньше объявлялся отдельно в
// schedule/SlotCard.tsx и planning/LessonCard.tsx, jscpd поймал дубль.
//
// Направление «тихо и благородно» (docs/adr/0031) заменило карточку с рамкой
// и заливкой на строку списка с волосяной линией снизу. Направление «Тёплая
// школа» (docs/adr/0043-visual-direction-warm-school.md) разворачивает это
// решение осознанно: список снова читается карточками — белый фон, мягкая
// тень, без границы. Это не откат вслепую, а выбор владельца при сравнении
// обликов целиком (ADR-0043, «Контекст»). Заголовок строки остаётся
// антиквой: так подписано «Занятие» или «Экзамен» отличимо от служебной
// строки метаданных под ним.
import type { CSSProperties } from 'react';

/** Общая основа карточки строки (отступы, фон, радиус, тень) — вынесена, а
 * не повторена внутри listCardStyle: раньше её же брала строка со своими
 * внутренними кнопками («Раскрыть»/«Отменить» рассылки), у которой поэтому
 * весь `<li>` не мог быть `<button>`; у журнала теперь другая, не-карточная
 * вёрстка строки (broadcasts/BroadcastCard.tsx, docs/adr/0043), а эта основа
 * осталась не экспортом — снаружи её саму по себе больше никто не берёт,
 * только через listCardStyle ниже. Промежуток между карточками задаёт `gap`
 * контейнера-списка, не отступы самой строки. */
const listRowStyle: CSSProperties = {
  padding: '16px 18px',
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
};

export const listCardStyle: CSSProperties = {
  ...listRowStyle,
  display: 'block',
  width: '100%',
  textAlign: 'left',
  // `<button>` приносит свою рамку 2px outset со всех сторон — без явного
  // `border: none` список выглядел обведённым тёмной рамкой поверх карточки
  // (тот же баг, что и до ADR-0031, снимок редактора 2026-09-15).
  border: 'none',
  font: 'inherit',
  cursor: 'pointer',
  minHeight: 44,
};

export const listCardTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: 23,
};
export const listCardMetaStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-soft)',
  marginTop: 4,
};

/** Колонка списка, где КАЖДАЯ строка несёт свою поверхность — фон, радиус,
 * тень (например, `--panel-warm`, тёплая плашка задания или уведомления), а
 * не общую карточку контейнера. Раз у строки есть своя поверхность, швы
 * между строками обязаны быть видны — без `gap` строки читаются одной
 * слипшейся плашкой (снимок владельца, «Задания», docs/adr/0088). 10 —
 * не с потолка: ровно так уже был разложен список карточек уведомлений
 * (`NotificationsScreen.tsx`), строка которого — `NewTaskCard`, та же
 * тёплая плашка, что и `StudentExamCard` у заданий. */
export const cardListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

/** Голый список: у строки нет своей поверхности, ритм держит волосяная линия
 * у самой строки (`borderBottom` строки или класс `.xuanxue-question-row`),
 * зазор между строками не нужен. Список остаётся блочным, `gap` на нём ничего
 * не красит — `gap: 0` здесь не про вёрстку, а подпись под замыслом: зазор
 * обдуман и равен нулю, а не забыт (docs/adr/0088). */
export const dividedListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  gap: 0,
};

/** Обёртка «список одной карточкой» (docs/adr/0043): общий радиус, фон и
 * тень, `overflow: hidden` подрезает первую/последнюю строку под общий
 * радиус — строки внутри красят свой `border-bottom` сами (проп `isLast`).
 * Приём завели рассылки/экзамены/люди (#199/#200/#201) каждый своим
 * локальным литералом, потом появился общий экспорт, а теперь и эти три
 * экрана берут его — локальных копий не осталось. */
export const oneCardListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  borderRadius: 'var(--radius-block)',
  background: 'var(--card)',
  boxShadow: 'var(--shadow-card)',
  overflow: 'hidden',
};

/** Поверхность крупного блока направления «Тёплая школа» (docs/adr/0043) —
 * карточка колонки, а не строка списка; отличается от `listRowStyle`
 * отступами и радиусом (`--radius-block` против `--radius-card`), потому что
 * несёт содержимое целиком, а не одну строку. Раньше объявлялся своим
 * литералом в четырёх экранах (grading/AttemptReviewScreen.tsx,
 * attempt/AttemptInProgress.tsx, attempt/AttemptSubmittedVideos.tsx,
 * exams/ExamPreviewQuestions.tsx) — сведён по CLAUDE.md «Одна механика —
 * один компонент», серия переезда на ADR-0043 закончена (#244, #245). */
export const blockCardStyle: CSSProperties = {
  padding: '20px 22px',
  background: 'var(--card)',
  borderRadius: 'var(--radius-block)',
  boxShadow: 'var(--shadow-card)',
};

// Тихая кнопка внутри строки списка — «Выше/Ниже/Убрать» у вопроса экзамена,
// «×» у варианта ответа. 44×44, хотя макет местами рисует 40: цель нажатия в
// кабинете не меньше 44 (CLAUDE.md «Доступность», отклонение зафиксировано в
// ADR-0043), а разницы в четыре пикселя на бумаге не видно.
export const rowControlStyle: CSSProperties = {
  width: 44,
  height: 44,
  border: 0,
  background: 'transparent',
  color: 'var(--ink-soft)',
  font: 'inherit',
  fontSize: 16,
  cursor: 'pointer',
  borderRadius: 'var(--radius-control)',
};
