// Лист создания/правки канала — оболочка SheetShell (общая с ClassSheet.tsx/
// LessonSheet.tsx). Удаление — через ConfirmDialog: канал мог использоваться
// в рассылках, случайный клик не должен его убирать.
import { useEffect, useState, type FormEvent } from 'react';
import type { ChannelDto, CreateChannelInput, UpdateChannelInput } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError } from '../components/FormServerError';
import { SheetShell } from '../components/SheetShell';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';
import { ChannelFormFields } from './ChannelFormFields';
import { useChannelForm } from './useChannelForm';

interface ChannelSheetProps {
  channelDto: ChannelDto | null;
  onClose: () => void;
  onCreate: (input: CreateChannelInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateChannelInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function ChannelSheet({
  channelDto,
  onClose,
  onCreate,
  onUpdate,
  onRemove,
}: ChannelSheetProps) {
  const goBack = useHistorySheet(onClose);
  const { headingRef, containerRef } = useDialog(goBack);
  const form = useChannelForm(channelDto, onCreate, onUpdate, onRemove);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removed, setRemoved] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goBack();
  }

  async function handleConfirmRemove() {
    // Не закрываем лист здесь: ConfirmDialog после этого вызова всегда сам
    // делает свой единственный navigate(-1) (закрывает подтверждение) — если
    // вызвать наш goBack() ещё и тут, в одном такте окажутся два navigate(-1)
    // подряд, и история путается (ревью п.5). Закрытие всего листа при
    // успехе — эффект ниже, срабатывает уже после того, как подтверждение
    // действительно закрылось.
    if (await form.remove()) setRemoved(true);
  }

  useEffect(() => {
    if (removed && !confirmingRemove) goBack();
    // goBack (useHistorySheet) — новая функция на каждый рендер: добавление
    // её в зависимости вызывало бы повторный navigate(-1) на каждый рендер
    // после закрытия, а не один раз по факту «канала больше нет».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removed, confirmingRemove]);

  return (
    <>
      <SheetShell
        titleId="channel-sheet-title"
        title={channelDto ? 'Канал' : 'Новый канал'}
        headingRef={headingRef}
        containerRef={containerRef}
        onSubmit={(e) => void handleSubmit(e)}
        onClose={goBack}
      >
        <ChannelFormFields
          state={form.state}
          setField={form.setField}
          error={form.validationError}
          isCreate={!channelDto}
        />

        <FormServerError error={form.serverError} />

        <div style={{ display: 'flex', gap: 10 }}>
          <Button type="submit" pending={form.pending}>
            Сохранить
          </Button>
          {channelDto && (
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmingRemove(true)}
            >
              Удалить
            </Button>
          )}
        </div>
      </SheetShell>

      {confirmingRemove && (
        <ConfirmDialog
          title="Удалить канал?"
          message="Рассылки перестанут уходить в этот канал. Действие необратимо."
          confirmLabel="Удалить"
          pending={form.pending}
          onConfirm={handleConfirmRemove}
          onCancel={() => setConfirmingRemove(false)}
        />
      )}
    </>
  );
}
