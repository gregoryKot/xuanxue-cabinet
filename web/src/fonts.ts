// Шрифты направления «тихо и благородно» (docs/adr/0031-visual-direction-quiet-and-noble.md):
// Cormorant Garamond — заголовки, Spectral — текст и цифры. Оба под лицензией
// OFL, подключены пакетами `@fontsource/*` (self-hosted), НЕ с fonts.googleapis.com:
// внешний домен потребовал бы правки CSP (api/src/security/csp.ts), тянул бы
// приватность человека на чужой сервер и ломал бы офлайн в установленном
// PWA (CLAUDE.md «Приложение на телефоне»).
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

import '@fontsource/spectral/latin-300.css';
import '@fontsource/spectral/cyrillic-300.css';
import '@fontsource/spectral/latin-400.css';
import '@fontsource/spectral/cyrillic-400.css';
import '@fontsource/spectral/latin-500.css';
import '@fontsource/spectral/cyrillic-500.css';
import '@fontsource/spectral/latin-600.css';
import '@fontsource/spectral/cyrillic-600.css';
