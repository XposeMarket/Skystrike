@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py launch.py
) else (
  python launch.py
)
pause
