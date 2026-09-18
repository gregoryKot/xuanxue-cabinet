// Четыре блока раздела «Экзамены» из макета — тёплая плашка «сколько попыток
// ждут проверки» и карточки-переходы в подэкраны (макет 2b-exams.html,
// docs/adr/0043-visual-direction-warm-school.md). Раньше очередь проверки
// была отдельной крупной цифрой (components/StatNumber.tsx) с подписью
// рядом — макет отказался от неё целиком: одинокая цифра рядом с мелкой
// подписью читалась как мусор (жалоба владельца со снимком этого экрана).
// Карточки-переходы — components/SectionLink.tsx, приведённый к виду из
// макета: тот же компонент стоит на «Занятиях» и «Рассылках» (CLAUDE.md
// «Одна механика — один компонент»).
//
// «Предпросмотр» из макета сюда не попал: у него нет маршрута без
// конкретного экзамена — `/exams/:examId/preview` (app/routeModules.ts)
// всегда открывается по ссылке со страницы самого экзамена. Раздел работает
// со сводкой по всем экзаменам сразу, а выбор «какой из них открыть на
// предпросмотр» — решение уровня логики нового экрана, не вёрстки этого PR
// (решение агента, см. отчёт).
//
// «Вопросы» — без числа вопросов/опубликованных, которое просит макет:
// `/exam-items/stats-summary` отдаёт только `strugglingCount` (сколько
// вопросов путают больше половины ответивших), общего счётчика вопросов нет
// ни в одном уже существующем хуке. Гонять сюда весь список вопросов только
// ради количества — новая нагрузка на экран ради одной цифры, решение
// агента: не выдумывать число, оставить прежний честный текст про путающие
// вопросы (CLAUDE.md «Демо-данные в рантайм-коде не живут»). Картинки
// вариантов ответа (ADR-0035) дописаны в ту же приписку второй фразой —
// то же место на экране, что и раньше, до перестройки макета.
import type { CSSProperties } from 'react';
import { SectionLink } from '../components/SectionLink';
import { formatExamItemsLinkHint } from '../exam-items/examItemsLinkHint';
import {
  GRADING_QUEUE_EXPLANATION,
  formatGradingQueueHint,
} from '../grading/gradingQueueHint';
import { formatGradingPresetsHint } from '../grading/gradingPresetsSummaryText';

interface ExamsSectionStatsProps {
  /** `null` — список ещё грузится или сбой загрузки. */
  queueCount: number | null;
  /** `null` — сводка вопросов ещё грузится или сбой загрузки. */
  strugglingCount: number | null;
  /** Готовая строка `formatExamImagesSummary` (ADR-0035) — `null` на чистой
   * базе, во время загрузки и при сбое: приписка тогда просто её не
   * показывает. */
  imagesSummary: string | null;
  /** Число заготовок частых комментариев (ADR-0041) — `null` во время
   * загрузки и при сбое, честное «пока нет» на чистой базе
   * (formatGradingPresetsHint). */
  presetsCount: number | null;
}

const plaqueStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '16px 18px',
  borderRadius: 'var(--radius-block)',
  background: 'var(--panel-warm)',
};
const plaqueHeadlineStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 500,
  color: 'var(--ink)',
  fontVariantNumeric: 'tabular-nums',
};
// #55584e, не --ink-soft: тот же прецедент, что у тёплой плашки «Ждут
// отправки вручную» на «Рассылках» (broadcasts/ManualDeliveriesSection.tsx,
// docs/adr/0043) — на --panel-warm --ink-soft держит только ~4.06:1, ниже AA
// 4.5 для этого кегля; #55584e даёт 5.74:1.
const plaqueCaptionStyle: CSSProperties = { margin: 0, fontSize: 13, color: '#55584e' };

export function ExamsSectionStats({
  queueCount,
  strugglingCount,
  imagesSummary,
  presetsCount,
}: ExamsSectionStatsProps) {
  const questionsHint = imagesSummary
    ? `${formatExamItemsLinkHint(strugglingCount)} ${imagesSummary}`
    : formatExamItemsLinkHint(strugglingCount);

  return (
    <div className="xuanxue-block-grid">
      <div style={plaqueStyle}>
        <p style={plaqueHeadlineStyle}>{formatGradingQueueHint(queueCount)}</p>
        <p style={plaqueCaptionStyle}>{formatGradingPresetsHint(presetsCount)}</p>
      </div>
      <SectionLink to="/exam-items" title="Вопросы" hint={questionsHint} />
      <SectionLink to="/grading" title="Проверка" hint={GRADING_QUEUE_EXPLANATION} />
    </div>
  );
}
