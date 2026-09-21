// Секция «Записи» + материалы под ней (ADR-0056) — вынесена из
// LessonEditorForm.tsx, чтобы форма уложилась в храповик размера после
// подключения черновика (ADR-0052, дополнение 2026-09-21, HIGH). Логики
// внутри нет — просто группировка двух уже существующих секций под общим
// отступом.
import type { AddRecordingInput, RecordingDto } from '@xuanxue/shared';
import { editorSectionStyle } from '../components/editorLayout';
import { LessonMaterialsSection } from './LessonMaterialsSection';
import { RecordingSection } from './RecordingSection';

interface LessonRecordingsSectionProps {
  lessonId: string;
  recordings: RecordingDto[];
  onAdd: (lessonId: string, input: AddRecordingInput) => Promise<void>;
}

export function LessonRecordingsSection({
  lessonId,
  recordings,
  onAdd,
}: LessonRecordingsSectionProps) {
  return (
    <div style={editorSectionStyle}>
      <RecordingSection lessonId={lessonId} recordings={recordings} onAdd={onAdd} />
      {/* Материалы — сразу под записью (ADR-0056): «что было во вторник»
          собрано в одном месте. Свою волосяную линию сверху секция несёт
          сама (editorSectionStyle внутри неё). */}
      <LessonMaterialsSection lessonId={lessonId} />
    </div>
  );
}
