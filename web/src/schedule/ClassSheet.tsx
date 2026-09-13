// Лист создания/правки занятия — `position: fixed; inset: 0` обязан идти
// через useHistorySheet (кнопка «Назад» браузера) и вести себя как диалог
// (useDialog: role="dialog", фокус на заголовок, Esc, блокировка скролла
// фона, возврат фокуса — CLAUDE.md «Доступность»). Форма/валидация —
// useClassForm, здесь только разметка и подключение хуков. Оболочка листа —
// SheetShell (общая с planning/LessonSheet.tsx).
import type { FormEvent } from 'react';
import type {
  ChannelDto,
  ClassDto,
  CreateClassInput,
  TeacherOptionDto,
  UpdateClassInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { FormServerError } from '../components/FormServerError';
import { SheetShell } from '../components/SheetShell';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';
import { ClassChannelsField } from './ClassChannelsField';
import { ClassFormFields } from './ClassFormFields';
import { RuleFields } from './RuleFields';
import { useClassForm } from './useClassForm';

interface ClassSheetProps {
  classDto: ClassDto | null;
  /** Каналы рассылки — грузятся один раз на «Расписании» (ScheduleScreen),
   * лист их не запрашивает сам (ревью п.1). */
  channels: ChannelDto[];
  /** Учителя для select'а «Ведущий» — тот же приём, что channels выше
   * (аудит В4). Сбой загрузки не прячет форму — просто пустой список сверх
   * «— не указан —», ниже показана строка с ошибкой и повтором. */
  teachers: TeacherOptionDto[];
  teachersError?: string | null;
  onRetryTeachers?: () => void;
  onClose: () => void;
  onCreate: (input: CreateClassInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateClassInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function ClassSheet({
  classDto,
  channels,
  teachers,
  teachersError,
  onRetryTeachers,
  onClose,
  onCreate,
  onUpdate,
  onRemove,
}: ClassSheetProps) {
  const goBack = useHistorySheet(onClose);
  const { headingRef, containerRef } = useDialog(goBack);
  const form = useClassForm(classDto, channels, onCreate, onUpdate, onRemove);
  const noRules = form.state.rules.length === 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goBack();
  }

  async function handleRemove() {
    if (await form.remove()) goBack();
  }

  return (
    <SheetShell
      titleId="class-sheet-title"
      title={classDto ? 'Занятие' : 'Новое занятие'}
      headingRef={headingRef}
      containerRef={containerRef}
      onSubmit={(e) => void handleSubmit(e)}
      onClose={goBack}
    >
      <ClassFormFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
        teachers={teachers}
        teachersError={teachersError}
        onRetryTeachers={onRetryTeachers}
      />
      <RuleFields
        rules={form.state.rules}
        onChange={(rules) => form.setField('rules', rules)}
      />
      <ClassChannelsField
        channels={channels}
        selectedIds={form.state.channelIds}
        onChange={(channelIds) => form.setField('channelIds', channelIds)}
      />

      <FormServerError error={form.serverError} />

      <div style={{ display: 'flex', gap: 10 }}>
        <Button type="submit" pending={form.pending} disabled={noRules}>
          Сохранить
        </Button>
        {classDto && (
          <Button
            type="button"
            variant="danger"
            pending={form.pending}
            onClick={() => void handleRemove()}
          >
            Удалить
          </Button>
        )}
      </div>
    </SheetShell>
  );
}
