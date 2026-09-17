@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%~dp0flame_generator.py" %*
    goto generated
)

if exist "%LocalAppData%\Python\pythoncore-3.14-64\python.exe" (
    "%LocalAppData%\Python\pythoncore-3.14-64\python.exe" "%~dp0flame_generator.py" %*
    goto generated
)

python "%~dp0flame_generator.py" %*

:generated
if errorlevel 1 (
    pause
    exit /b 1
)
start "" "%~dp0output\flame_viewer.html"
