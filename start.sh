#!/usr/bin/env bash
# start.sh — Start the StockSense backend and frontend dev servers.
#
# Usage:
#   ./start.sh           # start both servers
#   ./start.sh --backend # backend only
#   ./start.sh --frontend # frontend only
#
# PIDs are written to .pids/ so stop.sh can find the processes.
# Logs are written to .logs/ and tailed to the terminal.

set -euo pipefail

# ── paths ─────────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT/.pids"
LOG_DIR="$ROOT/.logs"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

BACKEND_PORT=8000
FRONTEND_PORT=5173
BACKEND_HEALTH="http://localhost:$BACKEND_PORT/docs"
BACKEND_READY_TIMEOUT=30   # seconds to wait for uvicorn to accept connections

# ── colours ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  BOLD='\033[1m'; RESET='\033[0m'
  GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
else
  BOLD=''; RESET=''; GREEN=''; YELLOW=''; RED=''; CYAN=''
fi

log()  { echo -e "${CYAN}[stocksense]${RESET} $*"; }
ok()   { echo -e "${GREEN}[✓]${RESET} $*"; }
warn() { echo -e "${YELLOW}[!]${RESET} $*"; }
die()  { echo -e "${RED}[✗]${RESET} $*" >&2; exit 1; }

# ── argument parsing ──────────────────────────────────────────────────────────
START_BACKEND=true
START_FRONTEND=true
for arg in "$@"; do
  case "$arg" in
    --backend)  START_FRONTEND=false ;;
    --frontend) START_BACKEND=false  ;;
    --help|-h)
      echo "Usage: $0 [--backend|--frontend]"
      exit 0
      ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

# ── helpers ───────────────────────────────────────────────────────────────────
mkdir -p "$PID_DIR" "$LOG_DIR"

is_port_in_use() { lsof -ti tcp:"$1" &>/dev/null; }

is_process_alive() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

wait_for_port() {
  local port="$1" timeout="$2" elapsed=0
  while ! lsof -ti tcp:"$port" &>/dev/null; do
    sleep 1
    (( elapsed++ )) || true
    if (( elapsed >= timeout )); then return 1; fi
  done
  return 0
}

# ── backend ───────────────────────────────────────────────────────────────────
start_backend() {
  log "Starting ${BOLD}backend${RESET} (FastAPI on :$BACKEND_PORT) …"

  if is_process_alive "$BACKEND_PID_FILE"; then
    warn "Backend already running (PID $(cat "$BACKEND_PID_FILE")) — skipping"
    return
  fi

  if is_port_in_use "$BACKEND_PORT"; then
    die "Port $BACKEND_PORT is already in use by another process. Run ./stop.sh first."
  fi

  (
    cd "$BACKEND_DIR"
    exec uvicorn app.main:app --reload --port "$BACKEND_PORT" \
      >> "$BACKEND_LOG" 2>&1
  ) &
  local pid=$!
  echo "$pid" > "$BACKEND_PID_FILE"
  log "Backend process started (PID $pid) — waiting for port $BACKEND_PORT …"

  if wait_for_port "$BACKEND_PORT" "$BACKEND_READY_TIMEOUT"; then
    ok "Backend ready → ${BOLD}http://localhost:$BACKEND_PORT${RESET}"
    ok "API docs     → ${BOLD}http://localhost:$BACKEND_PORT/docs${RESET}"
  else
    warn "Backend did not open port $BACKEND_PORT within ${BACKEND_READY_TIMEOUT}s"
    warn "Check logs: tail -f $BACKEND_LOG"
  fi
}

# ── frontend ──────────────────────────────────────────────────────────────────
start_frontend() {
  log "Starting ${BOLD}frontend${RESET} (Vite/React on :$FRONTEND_PORT) …"

  if is_process_alive "$FRONTEND_PID_FILE"; then
    warn "Frontend already running (PID $(cat "$FRONTEND_PID_FILE")) — skipping"
    return
  fi

  if is_port_in_use "$FRONTEND_PORT"; then
    die "Port $FRONTEND_PORT is already in use by another process. Run ./stop.sh first."
  fi

  (
    cd "$FRONTEND_DIR"
    exec npm run dev >> "$FRONTEND_LOG" 2>&1
  ) &
  local pid=$!
  echo "$pid" > "$FRONTEND_PID_FILE"
  log "Frontend process started (PID $pid) — waiting for port $FRONTEND_PORT …"

  if wait_for_port "$FRONTEND_PORT" 30; then
    ok "Frontend ready → ${BOLD}http://localhost:$FRONTEND_PORT${RESET}"
  else
    warn "Frontend did not open port $FRONTEND_PORT within 30s"
    warn "Check logs: tail -f $FRONTEND_LOG"
  fi
}

# ── main ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  StockSense — starting dev servers${RESET}"
echo "  ────────────────────────────────"

$START_BACKEND  && start_backend
$START_FRONTEND && start_frontend

echo ""
echo -e "${BOLD}  Running servers${RESET}"
$START_BACKEND  && echo "    Backend   http://localhost:$BACKEND_PORT"
$START_FRONTEND && echo "    Frontend  http://localhost:$FRONTEND_PORT"
echo ""
echo "  Logs"
$START_BACKEND  && echo "    tail -f $BACKEND_LOG"
$START_FRONTEND && echo "    tail -f $FRONTEND_LOG"
echo ""
echo "  Stop with: ${BOLD}./stop.sh${RESET}"
echo ""
