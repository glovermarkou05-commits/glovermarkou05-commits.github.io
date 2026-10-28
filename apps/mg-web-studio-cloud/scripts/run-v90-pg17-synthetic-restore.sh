#!/usr/bin/env bash
# V90: only user-approved disposable fake-data PG17 backup and restore.
# TWO independent GitHub-hosted Docker clusters, --network none, socket-only.
set -euo pipefail
umask 077
readonly REPO='glovermarkou05-commits/glovermarkou05-commits.github.io'
readonly BRANCH='refs/heads/feature/mg-digital-v5-web-services'
readonly IMAGE='postgres:17-bookworm'
readonly SOURCE='mg-webstudio-v90-source'
readonly DEST='mg-webstudio-v90-destination'
readonly ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
readonly FIXTURES="$ROOT/sql/v86-setup-synthetic-tenants.sql"
readonly VERIFY="$ROOT/sql/v86-verify-rls.sql"
readonly TARGET_ROLES="$ROOT/sql/v90-target-roles-only.sql"
readonly SNAPSHOT="$ROOT/sql/v90-canonical-snapshot.sql"

if [[ "${GITHUB_ACTIONS:-}" != true ||
      "${RUNNER_ENVIRONMENT:-}" != github-hosted ||
      "${RUNNER_OS:-}" != Linux ||
      "${GITHUB_REPOSITORY:-}" != "$REPO" ||
      "${GITHUB_REF:-}" != "$BRANCH" ||
      "${MG_V90_SCOPE:-}" != MG_V90_SYNTHETIC_RESTORE_ONLY ]]; then
  echo 'V90 BLOCKED: GitHub runner / branch / scoped restore consent missing' >&2
  exit 2
fi
if [[ "$(id -u)" == 0 || ! -d "${RUNNER_TEMP:-}" ||
      ! -f "$FIXTURES" || ! -f "$VERIFY" ||
      ! -f "$TARGET_ROLES" || ! -f "$SNAPSHOT" ]]; then
  echo 'V90 BLOCKED: unsafe runner or missing fixed synthetic SQL' >&2
  exit 2
fi
for name in "$SOURCE" "$DEST"; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    echo 'V90 BLOCKED: container name collision' >&2
    exit 2
  fi
done
source_created=0
dest_created=0
workdir=''
cleanup() {
  local rc=$? remain=0 name
  trap - EXIT INT TERM
  if [[ "$dest_created" == 1 ]]; then
    docker stop -t 5 "$DEST" >/dev/null 2>&1 || true
    docker rm -f -v "$DEST" >/dev/null 2>&1 || true
  fi
  if [[ "$source_created" == 1 ]]; then
    docker stop -t 5 "$SOURCE" >/dev/null 2>&1 || true
    docker rm -f -v "$SOURCE" >/dev/null 2>&1 || true
  fi
  for name in "$SOURCE" "$DEST"; do
    if docker container inspect "$name" >/dev/null 2>&1; then remain=1; fi
  done
  if [[ -n "$workdir" ]]; then
    case "$workdir" in
      "${RUNNER_TEMP%/}"/mg-v90-????????)
        rm -f -- "$workdir/source.dump" "$workdir/source.snapshot" \
          "$workdir/dest.snapshot" || true
        rmdir -- "$workdir" 2>/dev/null || true
        if [[ -e "$workdir" ]]; then remain=1; fi
        ;;
      *) remain=1;;
    esac
  fi
  if [[ "$remain" != 0 ]]; then
    echo 'V90 CLEANUP FAILED: an ephemeral container or archive remains' >&2
    exit 1
  fi
  echo 'V90 CLEANUP VERIFIED: both PG17 containers and temporary archive removed'
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

workdir="$(mktemp -d "${RUNNER_TEMP%/}/mg-v90-XXXXXXXX")"
[[ -d "$workdir" ]] || { echo 'V90 TEMP DIR FAILED' >&2; exit 1; }
echo 'V90 SETUP: disposable workspace on GitHub runner; no production data'
docker pull --quiet "$IMAGE" >/dev/null
image_id="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || {
  echo 'V90 BLOCKED: unexpected Docker image ID' >&2
  exit 1
}
echo "V90 IMAGE: $image_id"

start_pg() {
  local name="$1" db="$2" password network bindings command memory swap ready=0 version
  password="$(openssl rand -hex 32)"
  [[ "$password" =~ ^[a-f0-9]{64}$ ]] || {
    echo 'V90 RANDOM PASSWORD FAILURE' >&2; return 1;
  }
  if [[ "$name" == "$SOURCE" ]]; then source_created=1; else dest_created=1; fi
  docker run --detach --rm \
    --name "$name" --network none \
    --memory 1024m --memory-swap 1024m --cpus 1 --pids-limit 128 \
    --security-opt no-new-privileges --read-only \
    --tmpfs '/var/lib/postgresql/data:rw,size=671088640' \
    --tmpfs '/var/run/postgresql:rw,size=33554432' \
    --tmpfs '/tmp:rw,size=33554432' \
    --env POSTGRES_PASSWORD="$password" \
    --env POSTGRES_USER='mg_v90_ephemeral' \
    --env POSTGRES_DB="$db" \
    "$IMAGE" postgres -c "listen_addresses=" >/dev/null
  unset password
  network="$(docker inspect "$name" --format '{{.HostConfig.NetworkMode}}')"
  bindings="$(docker inspect "$name" --format '{{json .HostConfig.PortBindings}}')"
  command="$(docker inspect "$name" --format '{{json .Config.Cmd}}')"
  memory="$(docker inspect "$name" --format '{{.HostConfig.Memory}}')"
  swap="$(docker inspect "$name" --format '{{.HostConfig.MemorySwap}}')"
  if [[ "$network" != none ||
        ( "$bindings" != null && "$bindings" != '{}' ) ||
        "$command" != '["postgres","-c","listen_addresses="]' ||
        "$memory" != 1073741824 || "$swap" != 1073741824 ]]; then
    echo 'V90 ISOLATION FAILED' >&2; return 1
  fi
  for i in $(seq 1 75); do
    if [[ "$(docker inspect "$name" --format '{{.State.Running}}' 2>/dev/null || true)" != true ]]; then
      echo 'V90 PG17 EXITED BEFORE READINESS' >&2; return 1
    fi
    if docker exec "$name" pg_isready -q -h /var/run/postgresql \
      -U mg_v90_ephemeral -d "$db"; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" == 1 ]] || { echo 'V90 PG17 SOCKET READINESS FAILED' >&2; return 1; }
  version="$(docker exec "$name" postgres --version)"
  [[ "$version" =~ ^postgres\ \(PostgreSQL\)\ 17\. ]] || {
    echo 'V90 WRONG DATABASE VERSION' >&2; return 1;
  }
  docker exec "$name" sh -c 'test "$(cat "$PGDATA/PG_VERSION")" = 17'
  echo "V90 STARTED: $name; $version; no TCP, no Docker network/ports"
}
sql() {
  local name="$1" db="$2" file="$3"
  docker exec -i "$name" psql -X -q -v ON_ERROR_STOP=1 \
    -h /var/run/postgresql -U mg_v90_ephemeral -d "$db" < "$file"
}
snapshot() {
  local name="$1" db="$2" out="$3"
  docker exec -i "$name" psql -X -q -A -t -v ON_ERROR_STOP=1 \
    -h /var/run/postgresql -U mg_v90_ephemeral -d "$db" \
    < "$SNAPSHOT" > "$out"
}
start_pg "$SOURCE" mg_v90_source
start_pg "$DEST" mg_v90_destination

echo 'V90 SOURCE: load ONLY V86 fictional rows and RLS'
sql "$SOURCE" mg_v90_source "$FIXTURES"
sql "$SOURCE" mg_v90_source "$VERIFY"
snapshot "$SOURCE" mg_v90_source "$workdir/source.snapshot"
[[ -s "$workdir/source.snapshot" ]] || {
  echo 'V90 SOURCE SNAPSHOT EMPTY' >&2; exit 1;
}
echo 'V90 DUMP: pg_dump -Fc to GitHub ephemeral runner workspace'
dump_start="$(date +%s%3N)"
docker exec "$SOURCE" pg_dump -Fc -h /var/run/postgresql \
  -U mg_v90_ephemeral -d mg_v90_source > "$workdir/source.dump"
dump_ms="$(( $(date +%s%3N) - dump_start ))"
dump_bytes="$(stat -c %s "$workdir/source.dump")"
if (( dump_bytes < 500 || dump_bytes > 1048576 )) ||
   [[ "$(head -c 5 "$workdir/source.dump")" != PGDMP ]]; then
  echo 'V90 INVALID CUSTOM-FORMAT ARCHIVE OR UNEXPECTED SIZE' >&2; exit 1
fi
archive_sha="$(sha256sum "$workdir/source.dump" | cut -d ' ' -f1)"
echo "V90 DUMP VERIFIED: bytes=$dump_bytes; sha256=$archive_sha"

# pg_dump does not include cluster-global roles. Recreate only fake NOLOGIN roles.
echo 'V90 DEST: provision only three fictitious non-login prerequisite roles'
sql "$DEST" mg_v90_destination "$TARGET_ROLES"
echo 'V90 RESTORE: pg_restore into separately initialized destination cluster'
restore_start="$(date +%s%3N)"
docker exec -i "$DEST" pg_restore -Fc --exit-on-error --single-transaction \
  --no-owner -h /var/run/postgresql -U mg_v90_ephemeral \
  -d mg_v90_destination < "$workdir/source.dump"
restore_ms="$(( $(date +%s%3N) - restore_start ))"

echo 'V90 VERIFICATION: rerun real V86 role/tenant/site RLS assertions on destination'
sql "$DEST" mg_v90_destination "$VERIFY"
snapshot "$DEST" mg_v90_destination "$workdir/dest.snapshot"
if ! cmp -s "$workdir/source.snapshot" "$workdir/dest.snapshot"; then
  echo 'V90 RESTORE FAIL: schema/data/policy/grants/index/extension snapshots differ' >&2
  exit 1
fi
snapshot_sha="$(sha256sum "$workdir/dest.snapshot" | cut -d ' ' -f1)"
echo "V90 RESTORE VERIFIED: four rows, 2 RLS policies, indexes, permissions, extension snapshot match; sha256=$snapshot_sha"
echo "V90 TIME SAMPLE: dumpMs=$dump_ms; restoreMs=$restore_ms (NOT RPO/RTO certification)"
echo 'V90 RESULT: SYNTHETIC_PG17_BACKUP_RESTORE_PASS'
echo 'V90 LIMITS: no encrypted backup, no real production data, no actual V53 security regression'
echo 'V90 V67: REC-01/02 technical laboratory evidence only; REC-03/04 incomplete; 32 formally pending'
echo 'V90 DECISION: NO_GO for production'
