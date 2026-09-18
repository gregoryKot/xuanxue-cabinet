// Шрифты направления «Тёплая школа» (docs/adr/0043-visual-direction-warm-school.md,
// заменил ADR-0031): Golos Text — текст, цифры и контролы, Cormorant Garamond —
// только заголовки. Гротеск на цифрах и кнопках — это и есть смысл выбранного
// облика: антиква в тексте читалась как письмо, а не как приложение, и светлая
// единица кеглем 52 превращалась в голый штрих, неотличимый от римской «I»
// (снимок владельца с экрана «Экзамены»).
//
// Оба под лицензией OFL, подключены пакетами `@fontsource/*` (self-hosted), НЕ с
// fonts.googleapis.com: внешний домен потребовал бы правки CSP
// (api/src/security/csp.ts), отправлял бы IP человека на чужой сервер при каждой
// загрузке и не работал бы офлайн в установленном PWA (CLAUDE.md «Приложение на
// телефоне»).
//
// Импортируем только подмножества latin и cyrillic — кириллица нужна для
// русского интерфейса, латиница для цифр/английских аббревиатур; остальные
// диапазоны (вьетнамский, расширенная латиница/кириллица) школе не нужны.
// Каждый файл — отдельный @font-face с `font-display: swap` (задан пакетом
// по умолчанию): пока грузится файл, браузер показывает запасной стек тела
// документа (index.css), а не пустое место.
//
// Vite выносит эти CSS-импорты в отдельный файл со шрифтами — они не попадают
// в стартовый JS (проверено scripts/check-bundle-size.mjs после сборки).
import '@fontsource/cormorant-garamond/latin-300.css';
import '@fontsource/cormorant-garamond/cyrillic-300.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/cyrillic-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/cyrillic-500.css';

// Начертания 400/500/600 — ровно те, что стоят в макете (500 — подписи, кнопки
// и цифры, 600 — редкие акцентные строки). Начертания 300 у Golos Text нет, и
// оно не нужно: тихий текст делает --ink-soft, а не тонкое начертание.
import '@fontsource/golos-text/latin-400.css';
import '@fontsource/golos-text/cyrillic-400.css';
import '@fontsource/golos-text/latin-500.css';
import '@fontsource/golos-text/cyrillic-500.css';
import '@fontsource/golos-text/latin-600.css';
import '@fontsource/golos-text/cyrillic-600.css';
