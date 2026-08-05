@echo off
cd /d "%~dp0"
node scripts\generate-song-list.mjs
if errorlevel 1 pause & exit /b 1
node scripts\preview-server.mjs
pause
