@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting Solar Knowledge Base ...
"C:\Users\73873\.workbuddy\binaries\python\versions\3.13.12\python.exe" server.py
pause
