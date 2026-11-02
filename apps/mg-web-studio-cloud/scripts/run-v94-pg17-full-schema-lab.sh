#!/usr/bin/env bash
# V94B: explicitly authorized MG-only PG17 source/target synthetic recovery.
# No production database, no Supabase remote, no migration history changes.
set -euo pipefail
umask 077
readonly REPO='glovermarkou05-commits/glovermarkou05-commits.github.io'
readonly REF='refs/heads/docs/mg-web-studio-v94-preflight-20261101'
readonly SCOPE='V94B_20261101_TWO_DISPOSABLE_PG17_ONLY'
readonly SOURCE='mg-webstudio-v94-source'
readonly DEST='mg-webstudio-v94-destination'
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly DOCKERFILE="$ROOT/docker/v94-postgres-pgtap.Dockerfile"
readonly ROLES="$ROOT/sql/v94-synthetic-global-roles.sql.txt"
readonly SHIM="$ROOT/sql/v94-synthetic-auth-and-pgtap.sql.txt"
readonly V45="$ROOT/db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt"
readonly SEED="$ROOT/sql/v94-synthetic-seed.sql.txt"
readonly SNAP="$ROOT/sql/v94-catalog-snapshot.sql.txt"
readonly V53="$ROOT/tests/v53-rls-runtime.test.sql"
readonly IMAGE='mg-webstudio-v94-pgtap-lab:local'
if [[ "${GITHUB_ACTIONS:-}" != true ||
      "${RUNNER_ENVIRONMENT:-}" != github-hosted ||
      "${RUNNER_OS:-}" != Linux ||
      "${GITHUB_REPOSITORY:-}" != "$REPO" ||
      "${GITHUB_REF:-}" != "$REF" ||
      "${MG_V94_SCOPE:-}" != "$SCOPE" ]]; then
  echo "V94 BLOCKED: wrong GitHub-hosted runner, branch, or scoped authorization" >&2
  exit 2
fi
if [[ "$(id -u)" == 0 || ! -d "${RUNNER_TEMP:-/missing}" ]]; then
  echo "V94 BLOCKED: root host or missing GitHub ephemeral directory" >&2
  exit 2
fi
for f in "$DOCKERFILE" "$ROLES" "$SHIM" "$V45" "$SEED" "$SNAP" "$V53"; do
  [[ -f "$f" && ! -L "$f" ]] || { echo "V94 BLOCKED: prerequisite missing or symlink" >&2; exit 2; }
done
if ! grep -Fq "CREATE EXTENSION pgtap WITH SCHEMA extensions" "$SHIM" ||
   ! grep -Fq "SELECT extensions.plan(56)" "$V53" ||
   ! grep -Fq "DO NOT EXECUTE, DO NOT REGISTER AS MIGRATION" "$V45"; then
  echo "V94 BLOCKED: unsafe/unexpected input contract" >&2
  exit 2
fi
for name in "$SOURCE" "$DEST"; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    echo "V94 BLOCKED: container collision" >&2
    exit 2
  fi
done
source_created=0
dest_created=0
workdir=''
cleanup() {
  local rc=$? remain=0 name
  trap - EXIT INT TERM
  for name in "$DEST" "$SOURCE"; do
    if [[ "$name" == "$DEST" && "$dest_created" == 1 ||
          "$name" == "$SOURCE" && "$source_created" == 1 ]]; then
      docker stop -t 5 "$name" >/dev/null 2>&1 || true
      docker rm -f -v "$name" >/dev/null 2>&1 || true
    fi
    if docker container inspect "$name" >/dev/null 2>&1; then remain=1; fi
  done
  if [[ -n "$workdir" ]]; then
    case "$workdir" in
      "${RUNNER_TEMP%/}"/mg-v94-????????)
        rm -f -- "$workdir/source.dump" "$workdir/source.snapshot" \
          "$workdir/dest.snapshot" "$workdir/after-tap.snapshot" "$workdir/tap.log" || true
        rmdir -- "$workdir" 2>/dev/null || true
        [[ ! -e "$workdir" ]] || remain=1
        ;;
      *) remain=1 ;;
    esac
  fi
  if [[ "$remain" != 0 ]]; then
    echo "V94 FAIL: ephemeral cleanup incomplete" >&2
    exit 1
  fi
  echo "V94 CLEANUP: both containers and all temporary files removed"
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

workdir="$(mktemp -d "${RUNNER_TEMP%/}/mg-v94-XXXXXXXX")"
echo "V94 PRECHECK: two ephemeral isolated PG17 clusters, synthetic-only"
echo "V94 SOURCE SHA256 V45=$(sha256sum "$V45" | cut -d ' ' -f1)"
echo "V94 SOURCE SHA256 V53=$(sha256sum "$V53" | cut -d ' ' -f1)"
echo "V94 IMAGE: build temporary postgres:17.11-bookworm + PGDG pgtap extension"
docker build --pull --quiet --file "$DOCKERFILE" --tag "$IMAGE" "$ROOT/docker" >/dev/null
image_id="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "V94 FAIL: image id missing" >&2; exit 1; }
echo "V94 IMAGE DIGEST: $image_id"

start_pg() {
  local name="$1" db="$2" password network ports state ready=0 ver
  password="$(openssl rand -hex 32)"
  [[ "$password" =~ ^[a-f0-9]{64}$ ]] || { echo "V94 FAIL: random secret" >&2; return 1; }
  if [[ "$name" == "$SOURCE" ]]; then source_created=1; else dest_created=1; fi
  docker run -d --rm \
    --name "$name" --network none \
    --memory 1536m --memory-swap 1536m --cpus 1 --pids-limit 160 \
    --security-opt no-new-privileges --read-only \
    --tmpfs '/var/lib/postgresql/data:rw,size=838860800' \
    --tmpfs '/var/run/postgresql:rw,size=33554432' \
    --tmpfs '/tmp:rw,size=67108864' \
    -e "POSTGRES_PASSWORD=$password" \
    -e POSTGRES_USER=postgres -e "POSTGRES_DB=$db" \
    "$IMAGE" postgres -c "listen_addresses=" >/dev/null
  unset password
  network="$(docker inspect "$name" --format '{{.HostConfig.NetworkMode}}')"
  ports="$(docker inspect "$name" --format '{{json .HostConfig.PortBindings}}')"
  if [[ "$network" != none ||
        ( "$ports" != null && "$ports" != '{}' ) ]]; then
    echo "V94 FAIL: container network isolation" >&2
    return 1
  fi
  for i in $(seq 1 75); do
    state="$(docker inspect "$name" --format '{{.State.Running}}' 2>/dev/null || true)"
    [[ "$state" == true ]] || { echo "V94 FAIL: database exited" >&2; return 1; }
    if docker exec "$name" pg_isready -q -h /var/run/postgresql \
      -U postgres -d "$db"; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" == 1 ]] || { echo "V94 FAIL: PG17 not ready" >&2; return 1; }
  ver="$(docker exec "$name" postgres --version)"
  [[ "$ver" == *"PostgreSQL) 17."* ]] || { echo "V94 FAIL: non-PG17 engine" >&2; return 1; }
  echo "V94 READY: $name $ver network=none socket=only"
}
sql() {
  local name="$1" db="$2" file="$3"
  docker exec -i "$name" psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql \
    -U postgres -d "$db" < "$file" >/dev/null
}
query() {
  docker exec "$1" psql -X -q -A -t -v ON_ERROR_STOP=1 \
    -h /var/run/postgresql -U postgres -d "$2" -c "$3"
}
snapshot() {
  docker exec -i "$1" psql -X -q -A -t -v ON_ERROR_STOP=1 \
    -h /var/run/postgresql -U postgres -d "$2" < "$SNAP" > "$3"
}
start_pg "$SOURCE" mg_v94_source
start_pg "$DEST" mg_v94_dest
echo "V94 SOURCE: install lab roles, synthetic Auth, pgTAP and historical V45 only"
sql "$SOURCE" mg_v94_source "$ROLES"
sql "$SOURCE" mg_v94_source "$SHIM"
sql "$SOURCE" mg_v94_source "$V45"
sql "$SOURCE" mg_v94_source "$SEED"
echo "V94 DEST: provision only three global synthetic roles before restoring"
sql "$DEST" mg_v94_dest "$ROLES"
expected='16|12|11|1'
catalog_counts="SELECT
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname IN ('public','mg_private') AND c.relname LIKE 'mg_%')||'|'||
 (SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','mg_private') AND tablename LIKE 'mg_%')||'|'||
 (SELECT count(*) FROM pg_indexes WHERE schemaname IN ('public','mg_private')
  AND indexname ~ '^mg_v(40|42)_')||'|'||
 (SELECT count(*) FROM public.mg_organizations WHERE slug='v94-lab-fixture');"
counts_src="$(query "$SOURCE" mg_v94_source "$catalog_counts")"
[[ "$counts_src" == "$expected" ]] || { echo "V94 FAIL: source schema inventory $counts_src expected $expected" >&2; exit 1; }
echo "V94 SOURCE INVENTORY: tables=16, policies=12, explicit indexes=11, fixture rows=1"
snapshot "$SOURCE" mg_v94_source "$workdir/source.snapshot"
[[ -s "$workdir/source.snapshot" ]] || { echo "V94 FAIL: empty source snapshot" >&2; exit 1; }
echo "V94 BACKUP: ephemeral pg_dump custom-format"
docker exec "$SOURCE" pg_dump -Fc -h /var/run/postgresql \
   -U postgres -d mg_v94_source > "$workdir/source.dump"
nbytes="$(stat -c %s "$workdir/source.dump")"
if (( nbytes < 500 || nbytes > 5242880 )) ||
   [[ "$(head -c 5 "$workdir/source.dump")" != PGDMP ]]; then
  echo "V94 FAIL: unexpected PGDMP archive size/header" >&2; exit 1
fi
echo "V94 BACKUP: bytes=$nbytes sha256=$(sha256sum "$workdir/source.dump" | cut -d ' ' -f1)"
echo "V94 RESTORE: second independent PG17 container"
docker exec -i "$DEST" pg_restore -Fc --exit-on-error --single-transaction \
  --no-owner -h /var/run/postgresql -U postgres -d mg_v94_dest \
  < "$workdir/source.dump"
counts_dest="$(query "$DEST" mg_v94_dest "$catalog_counts")"
[[ "$counts_dest" == "$counts_src" ]] || { echo "V94 FAIL: restored schema inventory mismatch" >&2; exit 1; }
snapshot "$DEST" mg_v94_dest "$workdir/dest.snapshot"
if ! cmp -s "$workdir/source.snapshot" "$workdir/dest.snapshot"; then
  echo "V94 FAIL: restored schema/ACL/owner/index/policy snapshots differ" >&2; exit 1
fi
echo "V94 RESTORE: canonical schema/ACL/owners snapshots match"
echo "V94 PG-TAP: execute 56 historical V53 assertions ONLY on restored destination"
docker exec -i "$DEST" psql -X -q -A -t -v ON_ERROR_STOP=1 \
  -h /var/run/postgresql -U postgres -d mg_v94_dest \
  < "$V53" > "$workdir/tap.log"
if grep -Eq '^not ok[[:space:]]+[0-9]+' "$workdir/tap.log" ||
   grep -q 'Looks like you failed' "$workdir/tap.log"; then
  echo "V94 FAIL: pgTAP reported a failed assertion" >&2
  grep -E '^not ok|Looks like you failed' "$workdir/tap.log" | head -15 >&2 || true
  exit 1
fi
tap_count="$(grep -Ec '^ok[[:space:]]+[0-9]+([[:space:]]|$)' "$workdir/tap.log" || true)"
if [[ "$tap_count" != 56 ]] || ! grep -q '^1\.\.56$' "$workdir/tap.log"; then
  echo "V94 FAIL: pgTAP assertion count ($tap_count) expected 56" >&2
  exit 1
fi
users="$(query "$DEST" mg_v94_dest "SELECT count(*) FROM auth.users WHERE id::text LIKE '71000000-%';")"
[[ "$users" == 0 ]] || { echo "V94 FAIL: synthetic Auth rows persisted after rollback" >&2; exit 1; }
snapshot "$DEST" mg_v94_dest "$workdir/after-tap.snapshot"
if ! cmp -s "$workdir/dest.snapshot" "$workdir/after-tap.snapshot"; then
  echo "V94 FAIL: pgTAP left persistent schema or fixture differences" >&2; exit 1
fi
echo "V94 RESULT: FULL_SCHEMA_PG17_RESTORE_AND_PGTAP_56_PASS"
echo "V94 EVIDENCE: tables=16, policies=12, indexes=11, data=1 fictitious row, rollback=clean"
echo "V94 SNAPSHOT SHA256=$(sha256sum "$workdir/after-tap.snapshot" | cut -d ' ' -f1)"
echo "V94 LIMITS: synthetic Auth stub, not real Supabase Auth/MFA; independent review outstanding"
echo "V94 DECISION: NO_GO for production; V67 32 formally pending"
