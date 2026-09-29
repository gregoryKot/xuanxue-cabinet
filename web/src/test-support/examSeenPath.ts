// Путь отметки «ученик открыл карточку задания» (ADR-0129) для заглушек
// `mockApiByPath` в тестах: в коде его собирает `apiRoute` по ключу карты, и
// строка пути должна совпасть символ в символ.
import { apiRoutePath } from '../api/apiRoute';

export function examSeenPath(examId: string): string {
  return apiRoutePath('POST /me/exams/:examId/seen', { params: { examId } });
}
