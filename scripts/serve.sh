#!/usr/bin/env bash
#
# start.sh - Start all OpsinTech Platform development services
#
# Must be run from the repo root directory.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Unset invalid SSL_CERT_FILE to prevent Python startup crashes ──────────────
if [ -n "${SSL_CERT_FILE:-}" ] && [ ! -f "$SSL_CERT_FILE" ]; then
    echo "⚠ SSL_CERT_FILE is set to '$SSL_CERT_FILE' but the file does not exist. Unsetting it to prevent Python SSL crashes."
    unset SSL_CERT_FILE
fi

# ── Load environment variables from .env ──────────────────────────────────────
if [ -f "$REPO_ROOT/.env" ]; then
    set -a
    source "$REPO_ROOT/.env"
    set +a
fi

# ── Argument parsing ─────────────────────────────────────────────────────────

DEV_MODE=true
for arg in "$@"; do
    case "$arg" in
        --dev)  DEV_MODE=true ;;
        --prod) DEV_MODE=false ;;
        *) echo "Unknown argument: $arg"; echo "Usage: $0 [--dev|--prod]"; exit 1 ;;
    esac
done

if $DEV_MODE; then
    FRONTEND_CMD="pnpm run dev"
else
    FRONTEND_CMD="pnpm run preview"
fi

# ── Stop existing services ────────────────────────────────────────────────────

echo "Stopping existing services if any..."
pkill -f "langgraph dev" 2>/dev/null || true
pkill -f "uvicorn app.gateway.app:app" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
nginx -c "$REPO_ROOT/docker/nginx/nginx.local.conf" -p "$REPO_ROOT" -s quit 2>/dev/null || true
sleep 1
pkill -9 nginx 2>/dev/null || true
killall -9 nginx 2>/dev/null || true
./scripts/cleanup-containers.sh opsintech-sandbox 2>/dev/null || true
sleep 1

# ── Banner ────────────────────────────────────────────────────────────────────

echo ""
echo "=========================================="
echo "  Starting OpsinTech Platform Development Server"
echo "=========================================="
echo ""
if $DEV_MODE; then
    echo "  Mode: DEV  (hot-reload enabled)"
    echo "  Tip:  run \`make start\` in production mode"
else
    echo "  Mode: PROD (hot-reload disabled)"
    echo "  Tip:  run \`make dev\` to start in development mode"
fi
echo ""
echo "Services starting up..."
echo "  → Backend: LangGraph + Gateway"
echo "  → Frontend: Next.js"
echo "  → Nginx: Reverse Proxy"
echo ""

# ── Config check ─────────────────────────────────────────────────────────────

if ! { \
        [ -n "$OPSINTECH_CONFIG_PATH" ] && [ -f "$OPSINTECH_CONFIG_PATH" ] || \
        [ -f backend/config.yaml ] || \
        [ -f config.yaml ]; \
    }; then
    echo "✗ No OpsInTech config file found."
    echo "  Checked these locations:"
    echo "    - $OPSINTECH_CONFIG_PATH (when OPSINTECH_CONFIG_PATH is set)"
    echo "    - backend/config.yaml"
    echo "    - ./config.yaml"
    echo ""
    echo "  Run 'make config' from the repo root to generate ./config.yaml, then set required model API keys in .env or your config file."
    exit 1
fi

# ── Auto-upgrade config ──────────────────────────────────────────────────

"$REPO_ROOT/scripts/config-upgrade.sh"

# ── Cleanup trap ─────────────────────────────────────────────────────────────

cleanup() {
    trap - INT TERM
    echo ""
    echo "Shutting down services..."
    pkill -f "langgraph dev" 2>/dev/null || true
    pkill -f "uvicorn app.gateway.app:app" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    pkill -f "next start" 2>/dev/null || true
    pkill -f "next-server" 2>/dev/null || true
    # Kill nginx using the captured PID first (most reliable),
    # then fall back to pkill/killall for any stray nginx workers.
    if [ -n "${NGINX_PID:-}" ] && kill -0 "$NGINX_PID" 2>/dev/null; then
        kill -TERM "$NGINX_PID" 2>/dev/null || true
        sleep 1
        kill -9 "$NGINX_PID" 2>/dev/null || true
    fi
    pkill -9 nginx 2>/dev/null || true
    killall -9 nginx 2>/dev/null || true
    echo "Services stopped."
    exit 0
}
trap cleanup INT TERM

# ── Export AUTH_DB_URL for PostgreSQL users ──────────────────────────────
# Only set when config.yaml uses PostgreSQL as the database type.
# For SQLite (the default), the backend reads database.auth.url directly from
# config.yaml — exporting a bogus PostgreSQL URL here would override it and
# cause connection failures.
if [ -z "${AUTH_DB_URL:-}" ]; then
    AUTH_DB_URL=$(cd "$REPO_ROOT/backend" && uv run --frozen python3 -c "
import yaml, sys
try:
    with open('$REPO_ROOT/config.yaml') as f:
        cfg = yaml.safe_load(f)
    db = cfg.get('database', {})
    if db.get('type') == 'postgres':
        auth = db.get('auth', {})
        print(auth.get('url', ''))
except:
    sys.exit(0)
" 2>/dev/null || true)
    if [ -n "$AUTH_DB_URL" ]; then
        export AUTH_DB_URL
        echo "✓ AUTH_DB_URL resolved from config.yaml (PostgreSQL)"
    fi
fi

# ── Export BETTER_AUTH_URL for auth callbacks ────────────────────────────
if [ -z "${BETTER_AUTH_URL:-}" ]; then
    BETTER_AUTH_URL="http://localhost:2026"
    export BETTER_AUTH_URL
    echo "✓ BETTER_AUTH_URL set to $BETTER_AUTH_URL"
fi

# ── Start services ────────────────────────────────────────────────────────

mkdir -p logs

GATEWAY_EXTRA_FLAGS=""
if $DEV_MODE; then
    GATEWAY_EXTRA_FLAGS="--reload"
fi

# Ensure LangGraph URL matches the port used by serve.sh (2025)
export LANGGRAPH_API_URL="${LANGGRAPH_API_URL:-http://localhost:2025}"

echo "Starting LangGraph server..."
# Read log_level from config.yaml, fallback to env var, then to "info"
CONFIG_LOG_LEVEL=$(grep -m1 '^log_level:' config.yaml 2>/dev/null | awk '{print $2}' | tr -d ' ')
LANGGRAPH_LOG_LEVEL="${LANGGRAPH_LOG_LEVEL:-${CONFIG_LOG_LEVEL:-info}}"
(cd backend && PYTHONPATH=. uv run langgraph dev --host 0.0.0.0 --port 2025 --server-log-level "$LANGGRAPH_LOG_LEVEL" --no-browser --allow-blocking > ../logs/langgraph.log 2>&1) &
./scripts/wait-for-port.sh 2025 60 "LangGraph" || {
    echo "✗ LangGraph failed to start. Last log output:"
    tail -60 logs/langgraph.log
    cleanup
}
echo "✓ LangGraph started on localhost:2025"

echo "Starting Gateway API..."
(cd backend && PYTHONPATH=. uv run uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 $GATEWAY_EXTRA_FLAGS > ../logs/gateway.log 2>&1) &
./scripts/wait-for-port.sh 8001 30 "Gateway API" || {
    echo "✗ Gateway API failed to start. Last log output:"
    tail -60 logs/gateway.log
    echo ""
    echo "Likely configuration errors:"
    grep -E "Failed to load configuration|Environment variable .* not found|config\.yaml.*not found" logs/gateway.log | tail -5 || true
    cleanup
}
echo "✓ Gateway API started on localhost:8001"

echo "Starting Frontend..."
(cd frontend && $FRONTEND_CMD > ../logs/frontend.log 2>&1) &
./scripts/wait-for-port.sh 3000 120 "Frontend" || {
    echo "✗ Frontend failed to start. Last log output:"
    tail -20 logs/frontend.log
    cleanup
}
echo "✓ Frontend started on localhost:3000"

echo "Starting Nginx reverse proxy..."
nginx -g 'daemon off;' -c "$REPO_ROOT/docker/nginx/nginx.local.conf" -p "$REPO_ROOT" > logs/nginx.log 2>&1 &
NGINX_PID=$!
./scripts/wait-for-port.sh 2026 10 "Nginx" || {
    echo "✗ Nginx failed to start. Last log output:"
    tail -10 logs/nginx.log
    cleanup
}
echo "✓ Nginx started on localhost:2026"

# ── Ready ─────────────────────────────────────────────────────────────────────

echo ""
echo "=========================================="
if $DEV_MODE; then
    echo "  ✓ DeerFlow development server is running!"
else
    echo "  ✓ DeerFlow production server is running!"
fi
echo "=========================================="
echo ""
echo "  🌐 Application: http://localhost:2026"
echo "  📡 API Gateway: http://localhost:2026/api/*"
echo "  🤖 LangGraph:   http://localhost:2026/api/langgraph/*"
echo ""
echo "  📋 Logs:"
echo "     - LangGraph: logs/langgraph.log"
echo "     - Gateway:   logs/gateway.log"
echo "     - Frontend:  logs/frontend.log"
echo "     - Nginx:     logs/nginx.log"
echo ""
echo "Press Ctrl+C to stop all services"

wait
