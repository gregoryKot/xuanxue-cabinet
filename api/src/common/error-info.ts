// Текст и стек ошибки для `logger.error(message, stack)` — CLAUDE.md «Логи»:
// «ошибка, которую увидел пользователь/сервис, — всегда с error-логом и
// стеком». Один хелпер вместо повторения `err instanceof Error ? ... : ...`
// в каждом catch (CLAUDE.md, раздел «Дубли и мёртвый код», jscpd).
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function errorStack(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined;
}
