#!/usr/bin/env bash
# V85: explicitly authorized PG17 BOOT ONLY inside GitHub-hosted Ubuntu.
# NO SQL validation, HTTP, restore, migrations, deployment or production data.
set -euo pipefail
umask 077
readonly REPO='glovermarkou05-commits/glovermarkou05-commits.github.io'
readonly BRANCH='refs/heads/feature/mg-digital-v5-web-services'
readonly IMAGE='postgres:17-bookworm'
readonly NAME='mg-webstudio-v85-pg17-bootonly'

# Prevent executing from a local PC, untrusted fork, main, or self-hosted runner.
if [[ "${GITHUB_ACTIONS:-}" != 'true' ||
      "${RUNNER_ENVIRONMENT:-}" != 'github-hosted' ||
      "${RUNNER_OS:-}" != 'Linux' ||
      "${GITHUB_REPOSITORY:-}" != "$REPO" ||
      "${GITHUB_REF:-}" != "$BRANCH" ||
      "${MG_V85_SCOPE:-}" != 'MG_V85_POSTGRES_BOOT_ONLY' ]]; then
  echo 'V85 BLOCKED: specific approved GitHub-hosted context missing' >&2
  exit 2
fi
if [[ "$(id -u)" == 0 ]]; then
  echo 'V85 BLOCKED: do not run bootstrap as root on host' >&2
  exit 2
fi

created=0
cleanup() {
  local result=$?
  trap - EXIT INT TERM
  if [[ "$created" == 1 ]]; then
    docker stop -t 5 "$NAME" >/dev/null 2>&1 || true
    docker rm -f -v "$NAME" >/dev/null 2>&1 || true
    if docker container inspect "$NAME" >/dev/null 2>&1; then
      echo 'V85 CLEANUP FAILED: temporary container remains' >&2
      exit 1
    fi
    echo 'V85 CLEANUP VERIFIED: container removed; tmpfs discarded'
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if docker container inspect "$NAME" >/dev/null 2>&1; then
  echo 'V85 BLOCKED: name collision; will not modify existing container' >&2
  exit 2
fi

echo 'V85 STEP 1: pull official PostgreSQL 17 image on isolated runner'
docker pull --quiet "$IMAGE" >/dev/null
image_id="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
if [[ ! "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo 'V85 BLOCKED: image ID unavailable' >&2
  exit 1
fi
echo "V85 IMAGE: $image_id"

# One-time random lab password, neither printed nor stored in GitHub.
password="$(openssl rand -hex 32)"
if [[ ! "$password" =~ ^[a-f0-9]{64}$ ]]; then
  echo 'V85 BLOCKED: lab-only password generation failed' >&2
  exit 1
fi
echo 'V85 STEP 2: startup with isolated network namespace and no TCP listening'
docker run --detach --rm \
  --name "$NAME" \
  --network none \
  --memory 1024m --memory-swap 1024m --cpus 1 --pids-limit 128 \
  --security-opt no-new-privileges --read-only \
  --tmpfs '/var/lib/postgresql/data:rw,size=671088640' \
  --tmpfs '/var/run/postgresql:rw,size=33554432' \
  --tmpfs '/tmp:rw,size=33554432' \
  --env POSTGRES_PASSWORD="$password" \
  --env POSTGRES_USER='mg_v85_ephemeral' \
  --env POSTGRES_DB='mg_v85_empty' \
  "$IMAGE" postgres -c "listen_addresses=" >/dev/null
created=1
unset password

network="$(docker inspect "$NAME" --format '{{.HostConfig.NetworkMode}}')"
bindings="$(docker inspect "$NAME" --format '{{json .HostConfig.PortBindings}}')"
command="$(docker inspect "$NAME" --format '{{json .Config.Cmd}}')"
memory="$(docker inspect "$NAME" --format '{{.HostConfig.Memory}}')"
swap="$(docker inspect "$NAME" --format '{{.HostConfig.MemorySwap}}')"
if [[ "$network" != none ||
      ( "$bindings" != null && "$bindings" != '{}' ) ||
      "$command" != '["postgres","-c","listen_addresses="]' ||
      "$memory" != 1073741824 ||
      "$swap" != 1073741824 ]]; then
  echo 'V85 BLOCKED: Docker isolation policy mismatch' >&2
  exit 1
fi
echo 'V85 ISOLATION VERIFIED: network=none; no published ports; TCP disabled'
echo 'V85 LIMITS: cpu=1; memory=1024MiB; volatile_pgdata=640MiB'

# pg_isready via Unix domain socket tests process readiness, not SQL queries.
ready=0
for i in $(seq 1 75); do
  state="$(docker inspect "$NAME" --format '{{.State.Running}}' 2>/dev/null || true)"
  if [[ "$state" != true ]]; then
    echo 'V85 BOOT FAILED: container exited' >&2
    exit 1
  fi
  if docker exec "$NAME" pg_isready -q -h /var/run/postgresql \
      -U mg_v85_ephemeral -d mg_v85_empty; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  echo 'V85 BOOT FAILED: no Unix socket readiness within 75 seconds' >&2
  exit 1
fi
version="$(docker exec "$NAME" postgres --version)"
if [[ ! "$version" =~ ^postgres\ \(PostgreSQL\)\ 17\. ]]; then
  echo 'V85 BOOT FAILED: unexpected PostgreSQL major version' >&2
  exit 1
fi
docker exec "$NAME" sh -c 'test "$(cat "$PGDATA/PG_VERSION")" = 17'
echo "V85 BOOT READY: $version; Unix-socket only"
echo 'V85 STATUS: no manual SQL, no HTTP, no restore; V67=0/32; V78 permissions remain pending'
echo 'V85 DECISION: NO_GO for tests and production'
# The EXIT trap removes the container, including tmpfs and anonymous resources.
