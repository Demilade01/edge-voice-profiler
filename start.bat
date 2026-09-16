@echo off
echo ================================
echo Aethex WebRTC Voice Profiler - Startup
echo ================================
echo.

REM Check if .env files exist
if not exist "backend\.env" (
    echo [ERROR] backend\.env not found!
    echo Please create backend\.env with:
    echo   AETHEX_API_KEY=ae_live_your_key
    echo   AETHEX_AGENT_ID=your_agent_uuid
    echo   PORT=8080
    echo.
    pause
    exit /b 1
)

if not exist "frontend\.env.local" (
    echo [INFO] Creating frontend\.env.local...
    echo NEXT_PUBLIC_BACKEND_URL=http://localhost:8080 > frontend\.env.local
    echo NEXT_PUBLIC_AETHEX_AGENT_ID=your_agent_uuid >> frontend\.env.local
    echo Created frontend\.env.local
    echo.
)

echo [1/4] Starting Backend Server...
start "Backend Server" cmd /k "cd backend && npm run dev"
timeout /t 3 /nobreak > nul

echo [2/4] Waiting for backend to initialize...
timeout /t 2 /nobreak > nul

echo [3/4] Starting Frontend Server...
start "Frontend Server" cmd /k "cd frontend && npm run dev"

echo [4/4] Done!
echo.
echo ================================
echo Servers are starting...
echo ================================
echo Backend:  http://localhost:8080
echo Frontend: http://localhost:3000
echo.
echo Press any key to close this window (servers will keep running)
pause > nul
