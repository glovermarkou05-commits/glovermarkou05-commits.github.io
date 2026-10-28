#!/usr/bin/env bash
# V86: authorized ONLY for two fictional tenants and SQL on ephemeral PG17.
set -euo pipefail
umask 077
readonly REPO='glovermarkou05-commits/glovermarkou05-commits.github.io'
readonly BRANCH='refs/heads/feature/mg-digital-v5-web-services'
readonly IMAGE='postgres:17-bookworm'
readonly NAME='mg-webstudio-v86-pg17-synthetic-only'
readonly ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
readonly SETUP="$ROOT/sql/v86-setup-synthetic-tenants.sql"
readonly VERIFY="$ROOT/sql/v86-verify-rls.sql"

if [[ "${GITHUB_ACTIONS:-}" != true ||
      "${RUNNER_ENVIRONMENT:-}" != github-hosted ||
      "${RUNNER_OS:-}" != Linux ||
      "${GITHUB_REPOSITORY:-}" != "$REPO" ||
      "${GITHUB_REF:-}" != "$BRANCH" ||
      "${MG_V86_SCOPE:-}" != MG_V86_SQL_AND_SYNTHETIC_ONLY ]]; then
  echo 'V86 BLOCKED: specific GitHub runner and granted SQL scope required' >&2
  exit 2
fi
if [[ "$(id -u)" == 0 || ! -f "$SETUP" || ! -f "$VERIFY" ]]; then
  echo 'V86 BLOCKED: unsafe user or missing canonical fixture files' >&2
  exit 2
fi
if docker container inspect "$NAME" >/dev/null 2>&1; then
  echo 'V86 BLOCKED: named container already exists' >&2
  exit 2
fi

created=0
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if [[ "$created" == 1 ]]; then
    docker stop -t 5 "$NAME" >/dev/null 2>&1 || true
    docker rm -f -v "$NAME" >/dev/null 2>&1 || true
    if docker container inspect "$NAME" >/dev/null 2>&1; then
      echo 'V86 CLEANUP FAILED: temporary database remains' >&2
      exit 1
    fi
    echo 'V86 CLEANUP VERIFIED: no container remains; tmpfs discarded'
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo 'V86 IMAGE: official PG17, temporary GitHub-hosted runner'
docker pull --quiet "$IMAGE" >/dev/null
image_id="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'V86 IMAGE INVALID' >&2; exit 1; }
echo "V86 IMAGE ID: $image_id"
password="$(openssl rand -hex 32)"
[[ "$password" =~ ^[a-f0-9]{64}$ ]] || { echo 'V86 LAB PASSWORD FAILED' >&2; exit 1; }
created=1
docker run --detach --rm \
  --name "$NAME" --network none \
  --memory 1024m --memory-swap 1024m --cpus 1 --pids-limit 128 \
  --security-opt no-new-privileges --read-only \
  --tmpfs '/var/lib/postgresql/data:rw,size=671088640' \
  --tmpfs '/var/run/postgresql:rw,size=33554432' \
  --tmpfs '/tmp:rw,size=33554432' \
  --env POSTGRES_PASSWORD="$password" \
  --env POSTGRES_USER='mg_v86_ephemeral' \
  --env POSTGRES_DB='mg_v86_empty' \
  "$IMAGE" postgres -c "listen_addresses=" >/dev/null
unset password

network="$(docker inspect "$NAME" --format '{{.HostConfig.NetworkMode}}')"
bindings="$(docker inspect "$NAME" --format '{{json .HostConfig.PortBindings}}')"
command="$(docker inspect "$NAME" --format '{{json .Config.Cmd}}')"
memory="$(docker inspect "$NAME" --format '{{.HostConfig.Memory}}')"
swap="$(docker inspect "$NAME" --format '{{.HostConfig.MemorySwap}}')"
if [[ "$network" != none ||
      ( "$bindings" != null && "$bindings" != '{}' ) ||
      "$command" != '["postgres","-c","listen_addresses="]' ||
      "$memory" != 1073741824 || "$swap" != 1073741824 ]]; then
  echo 'V86 BLOCKED: containment mismatch' >&2
  exit 1
fi
echo 'V86 ISOLATION: network=none; no TCP/ports; memory 1GiB; 1 vCPU'
ready=0
for i in $(seq 1 75); do
  state="$(docker inspect "$NAME" --format '{{.State.Running}}' 2>/dev/null || true)"
  if [[ "$state" != true ]]; then echo 'V86 FAILED: container exited' >&2; exit 1; fi
  if docker exec "$NAME" pg_isready -q -h /var/run/postgresql \
     -U mg_v86_ephemeral -d mg_v86_empty; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'V86 FAILED: socket not ready' >&2; exit 1; }
version="$(docker exec "$NAME" postgres --version)"
[[ "$version" =~ ^postgres\ \(PostgreSQL\)\ 17\. ]] || {
  echo 'V86 FAILED: wrong Postgres major' >&2; exit 1;
}
echo "V86 READY: $version"

# Whitelisted SQL; no user-supplied commands. All access over private UNIX socket.
echo 'V86 SQL SETUP: two invented companies, sites and role-specific RLS'
docker exec -i "$NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -h /var/run/postgresql -U mg_v86_ephemeral -d mg_v86_empty < "$SETUP"
echo 'V86 SQL VERIFY: real grant, tenant, site and negative-write assertions'
docker exec -i "$NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -h /var/run/postgresql -U mg_v86_ephemeral -d mg_v86_empty < "$VERIFY"
echo 'V86 RESULT: SQL assertions complete; no live identities, MFA, network or restore'
echo 'V86 OPERATIONAL: V67=32 PENDING; evidence independent review required'
echo 'V86 DECISION: NO_GO for production'
