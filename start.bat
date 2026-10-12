@echo off
REM Jackpot Samguk local server (ES Modules need http, not file://)
start "" http://localhost:8790/index.html
python "%~dp0serve.py" 8790
