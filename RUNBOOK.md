# KapMan Runbook

## Import upload fails with Prisma runtime error

### Symptom

Import upload returns `400` and the error details include Prisma messages like:

- `Unknown argument skippedDuplicateRows`
- `Invalid prisma.import.upsert() invocation`

### Cause

The app process is running with a stale generated Prisma client that does not match the current schema.

### Recovery

1. Try app-only restart first:

```bash
docker compose restart app
```

2. Re-test upload.

3. If it still fails, refresh app runtime dependencies (keeps Postgres volume/data):

```bash
docker compose down
docker volume rm kapman-tradelog_app-node-modules
docker compose up --build
```

### Verification

1. Upload endpoint should return `200`:

```bash
curl -sS -o /tmp/upload.json -w '%{http_code}\n' \
  -F "file=@/path/to/statement.csv;type=text/csv" \
  http://localhost:3002/api/imports/upload
```

2. Commit should return parsed/inserted/skipped_duplicate/failed counts:

```bash
curl -sS -X POST http://localhost:3002/api/imports/<import_id>/commit
```

### Notes

- Host-side DB connections should use `127.0.0.1:55432`.
- Container-internal DB connections should continue using `db:5432`.
