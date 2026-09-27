// Страница материала — адрес, а не лист поверх списка (ADR-0033). Каркас
// (возврат к списку, рубрика, подвал «Сохранить»/«Удалить») — общий
// components/SimpleEditorForm.tsx (тот же приём, что у канала,
// ChannelEditorForm.tsx): здесь только поля материала.
//
// Файл выбирается прямо здесь и уходит в хранилище сразу после того, как
// материал создан (ADR-0134): «Сохранить» у нового материала — это
// create() (useMaterialEditor.ts) и следом upload() (useNewMaterialFile.ts)
// одним действием. Если второй шаг не долетел, материал уже существует —
// `effectiveMaterial` берёт его из `newFile.createdMaterial`, и страница
// становится страницей этого материала: заголовок, «Удалить материал» и
// настоящее поле файла (MaterialFileField, не NewMaterialFileField) — второе
// «Сохранить» его правит, не плодит дубль.
import type { ClassDto, MaterialDto } from '@xuanxue/shared';
import { MATERIALS_PATH } from '../api/apiPaths';
import { useFileStorageEnabled } from '../auth/useFileStorageEnabled';
import { FormDraftNote } from '../components/FormDraftNote';
import { SimpleEditorForm } from '../components/SimpleEditorForm';
import { MaterialFileField } from './MaterialFileField';
import { MaterialFormFields } from './MaterialFormFields';
import { NewMaterialFileField } from './NewMaterialFileField';
import { useMaterialForm } from './useMaterialForm';
import { useNewMaterialFile } from './useNewMaterialFile';
import type { UseMaterialEditorResult } from './useMaterialEditor';

const BACK_TEXT = 'К материалам';
const NEW_MATERIAL_TITLE = 'Новый материал';
const REMOVE_LABEL = 'Удалить материал';
const REMOVE_MESSAGE = 'Материал исчезнет из библиотеки ученика. Отменить нельзя.';

interface MaterialEditorFormProps {
  material: MaterialDto | null;
  classes: ClassDto[];
  editor: UseMaterialEditorResult;
}

export function MaterialEditorForm({
  material,
  classes,
  editor,
}: MaterialEditorFormProps) {
  // Нет ключей R2 (ADR-0057) — поля файла нет вовсе, а не кнопка, которая
  // ответит 503.
  const fileStorageEnabled = useFileStorageEnabled();

  const newFile = useNewMaterialFile(editor.create);
  const effectiveMaterial = material ?? newFile.createdMaterial;

  const form = useMaterialForm({
    material: effectiveMaterial,
    file: {
      hasFile: Boolean(effectiveMaterial?.file) || newFile.file !== null,
      fileSupported: fileStorageEnabled,
    },
    onCreate: newFile.create,
    onUpdate: editor.update,
    onRemove: editor.remove,
  });

  function handleFileChanged(updated: MaterialDto): void {
    // Материал по маршруту — экран перечитывает его после действия с файлом
    // (editor.reload()). Восстановленный после сбоя загрузки материал
    // маршрута с id не имеет (страница осталась на /materials/new) — ему
    // неоткуда взять свежие данные отдельным GET, источник — ответ записи.
    if (material) void editor.reload();
    else newFile.setCreatedMaterial(updated);
  }

  return (
    <SimpleEditorForm
      backPath={MATERIALS_PATH}
      backText={BACK_TEXT}
      eyebrow="Материал"
      title={effectiveMaterial ? effectiveMaterial.title : NEW_MATERIAL_TITLE}
      serverError={form.serverError}
      pending={form.pending}
      onSubmit={form.submit}
      remove={
        effectiveMaterial
          ? {
              label: REMOVE_LABEL,
              confirmTitle: 'Удалить материал?',
              confirmMessage: REMOVE_MESSAGE,
              onRemove: form.remove,
            }
          : undefined
      }
    >
      {/* Строка о восстановленном черновике стоит над полями (ADR-0052,
          ExamItemEditorForm.tsx) — иначе человек правит набранное в прошлый
          раз, не понимая, откуда оно взялось. */}
      <FormDraftNote restored={form.draftRestored} onDiscard={form.discardDraft} />
      <MaterialFormFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
        classes={classes}
        urlOptional={fileStorageEnabled}
      />
      {fileStorageEnabled && effectiveMaterial && (
        <MaterialFileField
          materialId={effectiveMaterial.id}
          file={effectiveMaterial.file}
          onChanged={handleFileChanged}
        />
      )}
      {fileStorageEnabled && !effectiveMaterial && (
        <NewMaterialFileField
          file={newFile.file}
          error={newFile.fileError}
          onSelect={newFile.selectFile}
          onRemove={newFile.removeFile}
        />
      )}
    </SimpleEditorForm>
  );
}
