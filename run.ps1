$ErrorActionPreference = 'Stop'

# 自动探测可用的 Python
$python = $null
foreach ($candidate in @(
    (Get-Command python -ErrorAction SilentlyContinue),
    (Get-Command py -ErrorAction SilentlyContinue)
)) {
    if ($candidate) { $python = $candidate.Source; break }
}
if (-not $python) {
    # py 启动器需要 -3 参数
    if (Get-Command py -ErrorAction SilentlyContinue) { $python = 'py' }
}
if (-not $python) { throw "未找到 Python。请先安装 Python 3.10+ 并勾选 'Add to PATH'。" }

if ($python -eq 'py') {
    & py -3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
} else {
    & $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
}
