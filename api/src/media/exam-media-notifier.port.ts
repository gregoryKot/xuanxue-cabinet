// Порт уведомления «ученик прислал ссылку на видео» (ADR-0084: ссылка —
// основной путь ответа на video-вопрос, но добавлялась молча — учитель
// узнавал о ней, только открыв карточку проверки сам; тихий отказ CLAUDE.md
// «Логи и наблюдаемость» запрещает). Интерфейс живёт здесь, в media/, а не в
// exams/ или telegram/ — по той же причине, что у ExamBotPort
// (telegram/exam-bot.port.ts): TelegramModule уже импортирует MediaModule
// ради MediaAssetsService (бот привязывает видео и по file_id, и вызывает её
// же из ExamMediaMessageHandler), а ExamsModule импортирует и MediaModule, и
// TelegramModule — импорт media/ → exams/ или media/ → telegram/ закольцевал
// бы граф модулей (eslint import-x/no-cycle, CLAUDE.md «Слои»). Реализация
// (ExamMediaLinkNotifier, exams/exam-media-link-notifier.ts) кладёт себя в
// ExamMediaNotifierRegistry при подъёме ExamsModule.
import type { DateTime } from 'luxon';

export interface VideoLinkAddedContext {
  attemptId: string;
  examId: string;
  examTitle: string;
  // Ученик, приславший ссылку — по нему шлётся сообщение учителю, самому
  // ему уведомление не уходит.
  userId: string;
  // Формулировка video-вопроса из снимка попытки (media-item-lookup.ts) —
  // не номер: у вопроса их три разных (карточка проверки, сводка бота, поле
  // сдачи), и любой разошёлся бы с тем, что учитель видит на экране.
  // `null` — вопрос не определён (ссылка не привязана к конкретному вопросу)
  // или не найден в снимке.
  questionPrompt: string | null;
  url: string;
}

export interface ExamMediaNotifier {
  notifyVideoLinkAdded(context: VideoLinkAddedContext, now: DateTime): Promise<void>;
}
