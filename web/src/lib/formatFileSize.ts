// Человеко-читаемый размер одного файла материала (ADR-0057, слой 3.10) —
// чистая функция, юнит-тест без DOM (CLAUDE.md «Тесты»). Килобайты до
// мегабайта (дробная доля не нужна), дальше мегабайты с одним знаком после
// запятой — запятая, а не точка, десятичный разделитель по-русски.
const BYTES_IN_KB = 1024;
const BYTES_IN_MB = BYTES_IN_KB * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < BYTES_IN_MB) return `${Math.round(bytes / BYTES_IN_KB)} КБ`;
  return `${(bytes / BYTES_IN_MB).toFixed(1).replace('.', ',')} МБ`;
}
