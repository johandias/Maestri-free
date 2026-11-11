@echo off
setlocal
python "%~dp0..\core\maestri_cli.py" %*
exit /b %ERRORLEVEL%
