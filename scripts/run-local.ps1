$ErrorActionPreference = "Stop"

if (Get-Command python -ErrorAction SilentlyContinue) {
  $python = "python"
} elseif (Test-Path "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe") {
  $python = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
} else {
  throw "Python was not found. Install Python 3.12 or add it to PATH."
}

& $python -m pip install -r requirements.txt
& $python -m uvicorn backend.app.main:app --reload --port 8000
