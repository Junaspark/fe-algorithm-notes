$ErrorActionPreference = "Stop"
$repoUrl = "https://github.com/Junaspark/fe-algorithm-notes.git"

if (-not (Test-Path ".git")) {
  git init
  git branch -M main
}

git remote remove origin 2>$null
git remote add origin $repoUrl
git add .
git commit -m "feat: publish frontend algorithm handbook"
git push -u origin main

Write-Host ""
Write-Host "代码已推送。接下来打开："
Write-Host "https://github.com/Junaspark/fe-algorithm-notes/settings/pages"
Write-Host "将 Source 设置为 GitHub Actions。"
Write-Host ""
Write-Host "部署完成后的默认地址预计为："
Write-Host "https://junaspark.github.io/fe-algorithm-notes/"
