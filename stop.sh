#!/usr/bin/env bash
# stop.sh — Cleanly shut down the StockSense backend and frontend dev servers.
#
# Usage:
#   ./stop.sh            # stop both servers
#   ./stop.sh --backend  # backend only
#   ./stop.sh --frontend # frontend only
#   ./stop.sh --force    # SIGKILL immediately (skip graceful shutdown)
#
# Sends SIGTERM and waits up to GRACEFUL_TIMEOUT seconds; falls back to SIGKILL.

set -uo pipefail

# ── paths ─────────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT/.pids"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"

BACKEND_PORT=8000
FRONTEND_PORT=5173
GRACEFUL_TIMEOUT=10   # seconds to wait for SIGTERM before escalating to SIGKILL

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
STOP_BACKEND=true
STOP_FRONTEND=true
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --backend)  STOP_FRONTEND=false ;;
    --frontend) STOP_BACKEND=false  ;;
    --force)    FORCE=true          ;;
    --help|-h)
      echo "Usage: $0 [--backend|--frontend] [--force]"
      exit 0
      ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

# ── helpers ───────────────────────────────────────────────────────────────────

# Stop a process by PID file, with optional fallback to port-based detection.
# Args: <label> <pid_file> <port>
stop_server() {
  local label="$1" pid_file="$2" port="$3"
  local pid=""

  # Prefer PID file
  if [[ -f "$pid_file" ]]; then
    pid=$(cat "$pid_file")
  fi

  # If no PID file or the stored PID is dead, try to find by port
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    local port_pid
    port_pid=$(lsof -ti tcp:"$port" 2>/dev/null | head -1 || true)
    if [[ -n "$port_pid" ]]; then
      warn "$label: PID file stale; found process $port_pid on port $port"
      pid="$port_pid"
    else
      warn "$label: not running (no PID file and port $port is free)"
      [[ -f "$pid_file" ]] && rm -f "$pid_file"
      return
    fi
  fi

  log "Stopping ${BOLD}$label${RESET} (PID $pid) …"

  if $FORCE; then
    kill -9 "$pid" 2>/dev/null || true
    ok "$label stopped (SIGKILL)"
  else
    # Graceful SIGTERM first
    kill -TERM "$pid" 2>/dev/null || true

    local elapsed=0
    while kill -0 "$pid" 2>/dev/null; do
      sleep 1
      (( elapsed++ )) || true
      if (( elapsed >= GRACEFUL_TIMEOUT )); then
        warn "$label did not exit within ${GRACEFUL_TIMEOUT}s — sending SIGKILL"
        kill -9 "$pid" 2>/dev/null || true
        break
      fi
    done

    if ! kill -0 "$pid" 2>/dev/null; then
      ok "$label stopped"
    else
      warn "$label may still be running; check manually: kill -9 $pid"
    fi
  fi

  # Clean up any child processes that inherited the port (e.g. vite sub-processes)
  local orphans
  orphans=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [[ -n "$orphans" ]]; then
    warn "Cleaning up orphaned process(es) on port $port: $orphans"
    echo "$orphans" | xargs kill -9 2>/dev/null || true
  fi

  [[ -f "$pid_file" ]] && rm -f "$pid_file"
}

# ── main ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  StockSense — stopping dev servers${RESET}"
echo "  ────────────────────────────────"
echo ""

$STOP_BACKEND  && stop_server "Backend"  "$BACKEND_PID_FILE"  "$BACKEND_PORT"
$STOP_FRONTEND && stop_server "Frontend" "$FRONTEND_PID_FILE" "$FRONTEND_PORT"

echo ""

# Verify ports are free
all_clear=true
if $STOP_BACKEND  && lsof -ti tcp:"$BACKEND_PORT"  &>/dev/null; then
  warn "Port $BACKEND_PORT is still in use"
  all_clear=false
fi
if $STOP_FRONTEND && lsof -ti tcp:"$FRONTEND_PORT" &>/dev/null; then
  warn "Port $FRONTEND_PORT is still in use"
  all_clear=false
fi

if $all_clear; then
  ok "All ports free — shutdown complete"
fi
echo ""
