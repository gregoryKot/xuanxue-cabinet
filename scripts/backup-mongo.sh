#!/usr/bin/env bash
# Бэкап MongoDB: mongodump | gzip | openssl enc → зашифрованный файл в BACKUP_DIR.
# CLAUDE.md, «Данные (MongoDB)»: Atlas M0 своих бэкапов не делает — этот скрипт и
# .github/workflows/backup.yml закрывают это до первых реальных данных (этап 1).
# Расписание, секреты и порядок восстановления — docs/RUNBOOK.md §7.
set -euo pipefail

# Незашифрованный дамп с персональными данными учеников (SECURITY.md §1, п.2) и
# токенами каналов (§1, п.1) в артефакте — недопустимо: артефакты GitHub Actions
# видны всем с доступом на чтение репозитория дольше, чем нужно секрету. Поэтому
# без пароля скрипт отказывается сразу, а не пишет дамп «на подумать зашифровать потом».
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "❌ BACKUP_PASSPHRASE не задан — без него бэкап с персональными данными не пишем." >&2
  echo "   Сгенерировать: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"" >&2
  exit 1
fi

# BACKUP_MONGODB_URI — предпочтительно: отдельный read-only пользователь Atlas
# (RUNBOOK §7), у которого физически нет прав на запись — компрометация машины,
# где крутится cron, не даёт испортить данные. MONGODB_URI — тот же, что у
# приложения, как запасной вариант (например, локальный прогон разработчиком).
MONGO_URI="${BACKUP_MONGODB_URI:-${MONGODB_URI:-}}"
if [ -z "$MONGO_URI" ]; then
  echo "❌ не задан ни BACKUP_MONGODB_URI, ни MONGODB_URI." >&2
  exit 1
fi

if ! command -v mongodump >/dev/null 2>&1; then
  echo "❌ mongodump не найден. Установить mongodb-database-tools (см. RUNBOOK §7 " \
    "или .github/workflows/backup.yml)." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

# UTC-метка в имени файла: бэкапы сравнимы между часовыми поясами без пересчёта
# (CLAUDE.md, «Время»: события — в UTC), и имя само по себе сортируется по времени.
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$BACKUP_DIR/backup-${TIMESTAMP}.archive.gz.enc"

# mongodump сам умеет --gzip поверх --archive — это быстрее и надёжнее, чем
# отдельный `gzip` в пайпе (один процесс меньше, не нужно ловить SIGPIPE). Дальше
# openssl шифрует уже сжатый поток: AES-256-CBC с PBKDF2 — тот же примитив, что и
# для остальных секретов проекта (SECURITY.md §5 — там GCM для полей БД; здесь CBC,
# потому что openssl enc потоковый и не даёт AEAD-режим без доп. обвязки, а PBKDF2
# защищает от перебора пароля по словарю).
#
# URI содержит пароль от Atlas — печатать его нельзя (SECURITY.md §6, PII/секреты
# в логи). Поэтому mongodump вызывается без `set -x`, и ниже не выводится ни сам
# URI, ни любая его часть.
if ! mongodump --uri="$MONGO_URI" --archive --gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT_FILE"; then
  echo "❌ бэкап не удался (mongodump или openssl вернули ошибку)." >&2
  rm -f "$OUT_FILE"
  exit 1
fi

SIZE_HUMAN="$(du -h "$OUT_FILE" | cut -f1)"
echo "✓ бэкап готов: $OUT_FILE ($SIZE_HUMAN)"
