// Общий приём деградации ExamBotService (файл-лимит CLAUDE.md «Храповики»):
// NotFoundError сервиса — чужой/битый id (SECURITY §3) — переводится в
// `null`, не пробрасывается, тем же принципом, что exam-bot-media.ts для
// картинки и видео вопроса-варианта.
import { NotFoundError } from '../common/errors';

export async function degradeNotFound<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}
