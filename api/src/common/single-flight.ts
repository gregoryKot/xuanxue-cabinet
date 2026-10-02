// Одна работа на ключ за раз (single-flight): пока первый вызов с ключом не
// завершился, остальные с тем же ключом получают тот же Promise, а не
// запускают работу заново. Аудит 2026-10-01 (F02): N учеников открывают один
// видео-вопрос в одну минуту — без этого каждый показ качал бы тот же файл
// (до 50 МБ) из R2 в память по разу на ученика. Чистая логика без DI и
// без сети (CLAUDE.md «Тесты»): кто и что грузит — дело вызывающего.
export class SingleFlight<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  /** Запускает `work` для `key`, если по нему ничего не летит; иначе отдаёт
   * уже летящий Promise. Запись снимается по завершении — и при успехе, и
   * при ошибке: следующий вызов после сбоя пробует заново, а не получает
   * старый отказ. */
  run(key: string, work: () => Promise<T>): Promise<T> {
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const started = work().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, started);
    return started;
  }
}
