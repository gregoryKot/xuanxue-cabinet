// Скачивание данных файлом без сети: Blob + временная ссылка + клик по <a
// download> (ADR-0160, выгрузка данных человека). Страница ничего не грузит
// с сервера второй раз — объект уже в памяти, файл собирает сам браузер, а
// `fetch` остаётся только в api/http.ts.

// Safari отменяет скачивание, если ссылку отозвать в тот же такт, что и клик;
// минуты запаса хватает даже для большого файла на медленном телефоне.
const REVOKE_DELAY_MS = 60_000;
const JSON_INDENT = 2;

export function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, JSON_INDENT)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
