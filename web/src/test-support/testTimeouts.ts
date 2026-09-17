// Оба таймаута прогона web рядом друг с другом, потому что связаны: ожидание
// элемента (`asyncUtilTimeout`, web/src/setupTests.ts) обязано успеть
// сработать внутри бюджета самого теста (`testTimeout`, web/vite.config.ts).
// Пока оба равнялись 5000, тест с двумя ожиданиями подряд под нагрузкой не
// укладывался в бюджет: vitest убивал его раньше, чем testing-library
// показывала разметку, и в логе оставалось «Test timed out in 5000ms» вместо
// «Unable to find an element». JoinScreen.test.tsx мигал так примерно раз в
// десять прогонов (2026-09-15).
export const ASYNC_UTIL_TIMEOUT_MS = 5000;

/** Запас на несколько ожиданий в одном тесте: множитель, а не отдельное
 * число, — так бюджет теста не сможет снова сравняться с ожиданием. */
export const TEST_TIMEOUT_MS = ASYNC_UTIL_TIMEOUT_MS * 4;
