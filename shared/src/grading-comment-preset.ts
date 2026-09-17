// Заготовки частых комментариев учителя при проверке (слой 4.6, PLAN §11,
// ADR-0041) — общий список школы, не личный: одна заготовка видна и
// учителю, и помощнику, как шаблоны рассылок (ADR-0010). Отдельный файл от
// exam-grading.ts — своя маленькая коллекция без связи с самой оценкой,
// GradingForm просто дописывает выбранный текст в поле комментария.
export interface GradingCommentPresetDto {
  id: string;
  text: string;
  title?: string;
  createdBy: string;
  createdAt: string; // ISO UTC с Z
}

export interface CreateGradingCommentPresetInput {
  text: string;
  title?: string;
}

export interface UpdateGradingCommentPresetInput {
  text?: string;
  title?: string;
}

export interface ListGradingCommentPresetsQuery {
  limit?: number;
}

export const GRADING_COMMENT_PRESET_LIMITS = { text: 500, title: 80 } as const;

// VOICE.md: конкретика вместо «произошла ошибка» — что случилось и что делать.
export const GRADING_COMMENT_PRESET_NOT_FOUND_MESSAGE =
  'Эта заготовка уже удалена. Обновите список заготовок.';
