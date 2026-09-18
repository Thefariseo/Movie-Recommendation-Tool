#!/usr/bin/env bash
set -euo pipefail
: "${TEST_DATABASE_URL:?Point TEST_DATABASE_URL at a disposable database named umbrify_test}"
node --input-type=module -e 'if (new URL(process.env.TEST_DATABASE_URL).pathname !== "/umbrify_test") throw new Error("Use a disposable database named umbrify_test");'
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/bootstrap.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/202609180001_umbrify.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/database.sql
