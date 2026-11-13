#!/usr/bin/env bash
# ============================================================
# Judge0 CE bootstrap for the Amali C++ IDE.
# Run as root on a fresh Ubuntu 22.04/24.04 VPS:
#   sudo bash judge0-bootstrap.sh
#
# PREREQUISITE: cgroup v1 must already be enabled (see docs/judge0-setup.md §3).
# Verify with:  stat -fc %T /sys/fs/cgroup   -> must print "tmpfs"
#
# The script is idempotent: re-running it keeps the existing secrets.
# ============================================================
set -euo pipefail

JUDGE0_VERSION="v1.13.1"
INSTALL_DIR="/opt/judge0-${JUDGE0_VERSION}"
CONF="${INSTALL_DIR}/judge0.conf"
COMPOSE="${INSTALL_DIR}/docker-compose.yml"

echo "==> Checking cgroup version"
if [ "$(stat -fc %T /sys/fs/cgroup)" != "tmpfs" ]; then
  echo "ERROR: cgroup v2 is active. Judge0 needs cgroup v1."
  echo "Set GRUB_CMDLINE_LINUX_DEFAULT=\"systemd.unified_cgroup_hierarchy=0\","
  echo "run update-grub, reboot, then re-run this script."
  exit 1
fi

echo "==> Installing Docker (skipped if present)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null

echo "==> Downloading Judge0 ${JUDGE0_VERSION}"
if [ ! -d "${INSTALL_DIR}" ]; then
  cd /opt
  wget -q "https://github.com/judge0/judge0/releases/download/${JUDGE0_VERSION}/judge0-${JUDGE0_VERSION}.zip"
  unzip -q "judge0-${JUDGE0_VERSION}.zip"
  rm -f "judge0-${JUDGE0_VERSION}.zip"
fi
cd "${INSTALL_DIR}"
[ -f "${CONF}" ] || { echo "ERROR: ${CONF} not found"; exit 1; }
[ -f "${COMPOSE}" ] || { echo "ERROR: ${COMPOSE} not found"; exit 1; }

echo "==> Generating secrets (kept if already set)"
current_token="$(grep -E '^AUTHN_TOKEN=' "${CONF}" | cut -d= -f2- || true)"
if [ -n "${current_token}" ]; then
  AUTHN_TOKEN="${current_token}"
else
  AUTHN_TOKEN="$(openssl rand -hex 32)"
fi
REDIS_PASSWORD="$(grep -E '^REDIS_PASSWORD=' "${CONF}" | cut -d= -f2- || true)"
[ -n "${REDIS_PASSWORD}" ] || REDIS_PASSWORD="$(openssl rand -hex 24)"
POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "${CONF}" | cut -d= -f2- || true)"
[ -n "${POSTGRES_PASSWORD}" ] || POSTGRES_PASSWORD="$(openssl rand -hex 24)"

echo "==> Writing judge0.conf"
set_conf() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "${CONF}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${CONF}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${CONF}"
  fi
}

set_conf REDIS_PASSWORD        "${REDIS_PASSWORD}"
set_conf POSTGRES_PASSWORD     "${POSTGRES_PASSWORD}"
set_conf AUTHN_HEADER          "X-Auth-Token"
set_conf AUTHN_TOKEN           "${AUTHN_TOKEN}"
set_conf ENABLE_WAIT_RESULT    "true"
set_conf JUDGE0_TELEMETRY_ENABLE "false"
set_conf ENABLE_SUBMISSION_DELETE "false"
set_conf ENABLE_BATCHED_SUBMISSIONS "false"
set_conf ENABLE_CALLBACKS      "false"
set_conf ENABLE_ADDITIONAL_FILES "false"
set_conf ENABLE_NETWORK        "false"
set_conf ALLOW_ENABLE_NETWORK  "false"
set_conf MAX_QUEUE_SIZE        "100"
set_conf CPU_TIME_LIMIT        "5"
set_conf MAX_CPU_TIME_LIMIT    "10"
set_conf WALL_TIME_LIMIT       "10"
set_conf MAX_WALL_TIME_LIMIT   "20"
set_conf MEMORY_LIMIT          "128000"
set_conf MAX_MEMORY_LIMIT      "256000"
set_conf MAX_FILE_SIZE         "1024"
set_conf MAX_MAX_FILE_SIZE     "4096"

echo "==> Binding the API to 127.0.0.1 only"
if grep -q '2358:2358' "${COMPOSE}" && ! grep -q '127.0.0.1:2358:2358' "${COMPOSE}"; then
  sed -i 's|"2358:2358"|"127.0.0.1:2358:2358"|; s|2358:2358|127.0.0.1:2358:2358|' "${COMPOSE}"
fi

echo "==> Starting database and Redis"
docker compose up -d db redis
sleep 10

echo "==> Starting Judge0"
docker compose up -d
sleep 5

echo
echo "============================================================"
echo " Judge0 is starting. Verify with:"
echo "   curl -s http://127.0.0.1:2358/system_info | head -c 300"
echo
echo " Add these to the portal (server-side env vars):"
echo "   JUDGE0_URL=https://<your-domain>"
echo "   JUDGE0_KEY=${AUTHN_TOKEN}"
echo
echo " Keep JUDGE0_KEY secret. Do not put it in NEXT_PUBLIC_*."
echo "============================================================"
