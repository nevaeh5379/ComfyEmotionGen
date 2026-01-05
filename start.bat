@echo off
setlocal

set PYTHON_VER=3.11.9
set PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VER%/python-%PYTHON_VER%-embed-amd64.zip
set ENV_DIR=python_embed
set PYTHON_EXE=%ENV_DIR%\python.exe
set PIP_URL=https://bootstrap.pypa.io/get-pip.py

title ComfyEmotionGen Launcher

echo ===================================================
echo      ComfyEmotionGen Launcher (Setup ^& Run)
echo ===================================================

if exist "%PYTHON_EXE%" (
    echo [OK] Python environment found.
) else (
    echo [1/4] Setting up standalone Python environment...
    if not exist "%ENV_DIR%" mkdir "%ENV_DIR%"
    
    echo    - Downloading Python %PYTHON_VER%...
    curl -L -o python.zip %PYTHON_URL%
    
    echo    - Extracting...
    tar -xf python.zip -C "%ENV_DIR%"
    del python.zip
    
    echo    - Patching .pth file to enable imports...
    powershell -Command "$pth = Get-ChildItem '%ENV_DIR%\python*._pth' | Select-Object -First 1; (Get-Content $pth.FullName) -replace '#import site', 'import site' | Set-Content $pth.FullName"
    
    echo    - Installing pip...
    curl -L -o get-pip.py %PIP_URL%
    "%PYTHON_EXE%" get-pip.py --no-warn-script-location
    del get-pip.py
    
    echo [OK] Python setup complete.
)

echo [2/4] Checking and installing requirements...
"%PYTHON_EXE%" -m pip install -r requirements.txt --quiet --disable-pip-version-check

echo [3/4] Ready to launch!
echo ===================================================
echo.

echo [4/4] Launching ComfyEmotionGen...
"%PYTHON_EXE%" gui_main.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] An error occurred during execution.
    pause
)