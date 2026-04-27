#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colour helpers ─────────────────────────────────────────────────────────────
_info()  { echo -e "\033[0;32m[CueSync]\033[0m $*"; }
_warn()  { echo -e "\033[0;33m[CueSync]\033[0m $*"; }
_error() { echo -e "\033[0;31m[CueSync]\033[0m $*" >&2; }

# ── Resolve a usable Python interpreter ────────────────────────────────────────
PYTHON_CMD=()
if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD=(python3)
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD=(python)
elif command -v py >/dev/null 2>&1; then
  PYTHON_CMD=(py -3)
else
  _error "Python 3 was not found. Install Python 3 and re-run this script."
  exit 1
fi

# ── Resolve venv paths for Windows (Git Bash / MSYS2) and Unix ─────────────────
if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* || "${OSTYPE:-}" == win32* ]]; then
  VENV_PYTHON=".venv/Scripts/python.exe"
  VENV_ALEMBIC=".venv/Scripts/alembic.exe"
else
  VENV_PYTHON=".venv/bin/python"
  VENV_ALEMBIC=".venv/bin/alembic"
fi

# ── Parse flags ────────────────────────────────────────────────────────────────
SKIP_INSTALL=0
PROD=0
PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

for arg in "$@"; do
  case "$arg" in
    --no-install) SKIP_INSTALL=1 ;;
    --prod)       PROD=1 ;;
    --port=*)     PORT="${arg#*=}" ;;
    --host=*)     HOST="${arg#*=}" ;;
    --help|-h)
      echo "Usage: ./run.sh [options]"
      echo "  --no-install   Skip pip install (faster restart)"
      echo "  --prod         Run with gunicorn (multi-worker, no reload)"
      echo "  --port=N       Bind port        (default: 8000)"
      echo "  --host=ADDR    Bind host        (default: 0.0.0.0)"
      exit 0
      ;;
  esac
done

# ── Virtual environment ────────────────────────────────────────────────────────
if [ ! -f "$VENV_PYTHON" ]; then
  _info "Creating virtual environment…"
  "${PYTHON_CMD[@]}" -m venv .venv
fi

# ── Dependencies ──────────────────────────────────────────────────────────────
if [ "$SKIP_INSTALL" -eq 0 ]; then
  _info "Installing / syncing dependencies…"
  "$VENV_PYTHON" -m pip install --quiet --upgrade pip
  "$VENV_PYTHON" -m pip install --quiet -r requirements.txt
else
  _warn "Skipping pip install (--no-install)"
fi

# ── .env check ────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  _warn ".env not found — copying from .env.example"
  cp .env.example .env
  _warn "Edit .env and set your POSTGRES credentials before the first run."
fi

# Export the backend's .env values so they override unrelated shell vars.
RUN_PORT="$PORT"
RUN_HOST="$HOST"
set -a
# shellcheck disable=SC1091
source .env
set +a
PORT="$RUN_PORT"
HOST="$RUN_HOST"

# ── Database migrations ───────────────────────────────────────────────────────
_info "Running Alembic migrations…"
if ! "$VENV_ALEMBIC" upgrade head; then
  if [ "$PROD" -eq 1 ]; then
    _error "Alembic migrations failed. Aborting production startup."
    exit 1
  fi
  _warn "Alembic migrations failed. Continuing with dev server startup."
fi

# ── Launch ────────────────────────────────────────────────────────────────────
if [ "$PROD" -eq 1 ]; then
  WORKERS="${WEB_CONCURRENCY:-$(( $(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 2) * 2 + 1 ))}"
  _info "Starting gunicorn — ${WORKERS} workers on ${HOST}:${PORT}"
  exec "$VENV_PYTHON" -m gunicorn app.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers "$WORKERS" \
    --bind "${HOST}:${PORT}" \
    --timeout 120 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile -
else
  _info "Starting uvicorn (dev) on ${HOST}:${PORT}  — hot-reload ON"
  exec "$VENV_PYTHON" -m uvicorn app.main:app \
    --reload \
    --host "$HOST" \
    --port "$PORT" \
    --log-level info
fi
