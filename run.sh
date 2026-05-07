#!/usr/bin/env bash
# Usage:
#   ./run.sh          → Docker (production-like, builds + starts all containers)
#   ./run.sh dev      → Local dev (backend + frontend simultaneously, hot-reload)
#   ./run.sh down     → Stop and remove Docker containers

set -e

MODE="${1:-docker}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[CueSync]${NC} $*"; }
warn()  { echo -e "${YELLOW}[CueSync]${NC} $*"; }
error() { echo -e "${RED}[CueSync]${NC} $*"; exit 1; }

# ── Docker mode ───────────────────────────────────────────────────────────────
if [ "$MODE" = "docker" ]; then
    command -v docker >/dev/null 2>&1 || error "Docker not found. Install Docker first."

    if [ ! -f ".env" ]; then
        cp .env.docker .env
        warn ".env created from .env.docker"
        warn "Edit JWT_SECRET and POSTGRES_PASSWORD in .env before deploying to production!"
    fi

    info "Building and starting all containers..."
    docker compose up --build
    exit 0
fi

# ── Down mode ─────────────────────────────────────────────────────────────────
if [ "$MODE" = "down" ]; then
    info "Stopping containers..."
    docker compose down
    exit 0
fi

# ── Local dev mode ────────────────────────────────────────────────────────────
if [ "$MODE" = "dev" ]; then
    info "Starting local dev (backend + frontend)..."
    info "Press Ctrl+C to stop both."

    cleanup() {
        info "Shutting down..."
        kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
        exit 0
    }
    trap cleanup SIGINT SIGTERM

    # Backend
    (
        cd "$SCRIPT_DIR/backend"
        if [ ! -d ".venv" ]; then
            python3 -m venv .venv
        fi
        source .venv/bin/activate
        pip install -q -r requirements.txt
        if [ -f ".env" ]; then
            set -a && source .env && set +a
        fi
        alembic upgrade head 2>/dev/null || true
        exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    ) &
    BACKEND_PID=$!

    # Give backend a moment to start before frontend
    sleep 2

    # Frontend
    (
        cd "$SCRIPT_DIR/frontend"
        if [ ! -d "node_modules" ]; then
            npm install
        fi
        exec npm run dev
    ) &
    FRONTEND_PID=$!

    wait "$BACKEND_PID" "$FRONTEND_PID"
    exit 0
fi

echo "Unknown mode: $MODE"
echo "Usage: ./run.sh [docker|dev|down]"
exit 1
