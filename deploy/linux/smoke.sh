#!/usr/bin/env bash
set -euo pipefail
# Run from repository root on a disposable Linux CI host. No real config/network.
fixture=$(mktemp -d)
export EARLYMEETING_IMAGE_TAG=ci EARLYMEETING_UID EARLYMEETING_GID
EARLYMEETING_UID=$(id -u)
EARLYMEETING_GID=$(id -g)
export EARLYMEETING_CONFIG_HOST_DIR="$fixture/config" EARLYMEETING_DATA_HOST_DIR="$fixture/data"
override="$fixture/offline.yaml"
printf 'services:\n  meeting:\n    network_mode: none\n    restart: "no"\n' > "$override"
compose=(docker compose -f compose.yaml -f "$override")
trap '"${compose[@]}" down --timeout 60 >/dev/null 2>&1 || true' EXIT
docker run --rm --network none --user "$EARLYMEETING_UID:$EARLYMEETING_GID" --entrypoint node \
  -v "$fixture:/fixture" -v "$PWD/deploy/linux/smoke-fixture.cjs:/fixture.cjs:ro" earlymeeting:ci /fixture.cjs init
"${compose[@]}" config --quiet
for cycle in 1 2; do
  "${compose[@]}" up -d --no-build --force-recreate
  for attempt in $(seq 1 20); do
    if "${compose[@]}" logs --no-color 2>&1 | grep -q '\[MEETING_STARTING\]'; then break; fi
    sleep 1
  done
  "${compose[@]}" logs --no-color > "$fixture/logs.txt"
  grep -q '\[MEETING_STARTING\]' "$fixture/logs.txt"
  if grep -Eq 'SECRET_OFFLINE_SENTINEL|AI_OFFLINE_SENTINEL|CARD_CREATED|MEETING_SENT' "$fixture/logs.txt"; then exit 1; fi
  if "${compose[@]}" exec -T meeting node meeting.cjs --healthcheck; then
    echo 'ERROR: offline container must not report ready'; exit 1
  fi
  set +e
  "${compose[@]}" run --rm --no-deps meeting node meeting.cjs --check >/dev/null 2>&1
  locked=$?
  set -e
  test "$locked" -eq 73
  "${compose[@]}" stop --timeout 60
  test "$(docker inspect earlymeeting --format '{{.State.ExitCode}}')" = 0
  docker run --rm --network none --user "$EARLYMEETING_UID:$EARLYMEETING_GID" --entrypoint node \
    -v "$fixture:/fixture" -v "$PWD/deploy/linux/smoke-fixture.cjs:/fixture.cjs:ro" earlymeeting:ci /fixture.cjs verify
  echo "OFFLINE_COMPOSE_CYCLE_${cycle}_OK"
done
