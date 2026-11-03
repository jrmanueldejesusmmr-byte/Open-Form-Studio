#!/usr/bin/env bash
# diag-electron.sh — diagnóstico del arranque "sin ventana" de ArqStudio 3D.
#
# Uso:
#   bash scripts/diag-electron.sh            # arranque normal (con Fase 3)
#   ARQ_SAFE_BOOT=1 bash scripts/diag-electron.sh   # arranque seguro (sin Gemini)
#
# Hace:
#   1. Compila con `npx electron-vite build`.
#   2. Lanza `npx electron . --no-sandbox --disable-gpu` con
#      ELECTRON_ENABLE_LOGGING=1 durante 20 s.
#   3. Cierra Electron y vuelca todo a logs/electron-diag.txt
#      (o logs/electron-diag-safe.txt con ARQ_SAFE_BOOT=1) para comparar.
#
# Qué mirar en el log (buscar "[ArqStudio]"):
#   - "[arranque] app lista (whenReady)"      => el main arrancó.
#   - "[preload] puente arqStudio expuesto"   => el preload cargó bien.
#   - "[arranque] ready-to-show recibido"     => el renderer pintó y se mostró.
#   - "[arranque] ready-to-show no llegó..."  => se usó el respaldo de 3 s.
#   - "[arranque:<origen>]"                   => el error concreto
#     (did-fail-load, preload-error, render-process-gone, createWindow,
#      database-init, gemini-init, ...). Ver también logs/main-error.log.
set -u
cd "$(dirname "$0")/.."
mkdir -p logs
if [ "${ARQ_SAFE_BOOT:-0}" = "1" ]; then
  LOG="logs/electron-diag-safe.txt"
  export ARQ_SAFE_BOOT=1
else
  LOG="logs/electron-diag.txt"
  unset ARQ_SAFE_BOOT || true
fi
{
  echo "=== diag $(date -u '+%Y-%m-%d %H:%M:%S UTC') ARQ_SAFE_BOOT=${ARQ_SAFE_BOOT:-0} ==="
  echo "--- 1/3 build (electron-vite build) ---"
  npx electron-vite build 2>&1
  # shellcheck disable=SC2181
  echo "build_exit=$?"
  echo "--- 2/3 electron 20 s (ELECTRON_ENABLE_LOGGING=1, --no-sandbox --disable-gpu) ---"
  ELECTRON_ENABLE_LOGGING=1 npx electron . --no-sandbox --disable-gpu 2>&1 &
  EPID=$!
  echo "electron_pid=$EPID"
  sleep 20
  echo "--- procesos electron tras 20 s ---"
  pgrep -af electron || echo "(sin procesos electron)"
  echo "--- cerrando electron (pid $EPID) ---"
  kill "$EPID" 2>/dev/null || true
  sleep 2
  kill -9 "$EPID" 2>/dev/null || true
  echo "--- 3/3 cola de logs/main-error.log ---"
  if [ -f logs/main-error.log ]; then
    tail -40 logs/main-error.log
  else
    echo "(sin logs/main-error.log: el main no registró errores)"
  fi
  echo "=== fin diag ==="
} | tee "$LOG" 2>&1
echo "Diagnóstico guardado en $LOG"
