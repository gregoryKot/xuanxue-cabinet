// Правило CLAUDE.md «Отказались от механики — удаляем с концами» — теперь и
// для данных, не только для кода (ADR-0062: вид уведомления «Сообщение от
// учителя» убран из `NOTIFICATION_KINDS`, TypeScript больше не пропускает
// его как `NotificationKind`). У человека, который хоть раз выключал этот
// вид руками, в `notification_prefs.overrides` лежит элемент со значением
// вне enum подсхемы (`NotificationOverrideSubdoc`, notification-prefs.schema.ts)
// с момента этого PR.
//
// На момент этого решения запись не падает: `NotificationPrefsService.set`
// пишет через `updateOne` без `runValidators`, `.save()` на этой модели нигде
// не вызывается — это не починка существующего сбоя, а закрытие скрытой
// ловушки на будущее: включит кто-нибудь `runValidators` или `.save()` на
// этой схеме — откажут ровно те, кто настройки трогал руками, то есть самые
// заинтересованные люди.
//
// expand → deploy → contract: старый инстанс во время деплоя ещё собран со
// старым `NotificationKind` и может писать/читать overrides этого вида, но
// удаление элемента-переключателя для него неотличимо от «человек никогда не
// трогал этот вид» — `NotificationPrefsService.get` вернёт дефолт роли, как и
// для любого другого нетронутого вида (`applyOverrides`, apply-overrides.ts).
// Безопасно и при деплое, и при откате.
//
// Значения `teacher_message` больше нет в `NotificationKind` — миграция
// хранит его как сырую строку (исторический факт о данных), не импорт из
// `@xuanxue/shared`. Спек рядом импортирует именно эту константу, а не
// дублирует строку — так значение remove-цели существует в репозитории
// ровно в одном месте.
import type { mongo } from 'mongoose';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому тип `Db` совпадает
// с тем, что отдаёт `connection.db` — без второй копии пакета `mongodb`
// в дереве зависимостей.
type Db = mongo.Db;

const NOTIFICATION_PREFS = 'notification_prefs';

export const REMOVED_OVERRIDE_KIND = 'teacher_message';

// Минимальная форма документа для типизации `$pull` нативного драйвера —
// на generic `Document` (без параметра типа) он не принимает объект-фильтр
// элемента массива (`PullOperator` требует знать форму `overrides`), тот же
// приём, что `MigrationsDoc` в migration.runner.ts.
interface NotificationPrefsDoc {
  overrides: { kind: string; enabled: boolean }[];
}

export const notificationPrefsTeacherMessageRemoved = {
  id: '0011-notification-prefs-teacher-message-removed',
  async up(db: Db): Promise<void> {
    // Идемпотентность бесплатная: второй запуск не находит ни одного
    // элемента overrides с этим kind — фильтр не совпадает ни с одним
    // документом, $pull не за что применять.
    await db
      .collection<NotificationPrefsDoc>(NOTIFICATION_PREFS)
      .updateMany(
        { 'overrides.kind': REMOVED_OVERRIDE_KIND },
        { $pull: { overrides: { kind: REMOVED_OVERRIDE_KIND } } },
      );
  },
};
