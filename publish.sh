#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/Junaspark/fe-algorithm-notes.git"

if [ ! -d .git ]; then
  git init
  git branch -M main
fi

git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

git add .
git commit -m "feat: publish frontend algorithm handbook" || true
git push -u origin main

echo
echo "代码已推送。接下来打开："
echo "https://github.com/Junaspark/fe-algorithm-notes/settings/pages"
echo "将 Source 设置为 GitHub Actions。"
echo
echo "部署完成后的默认地址预计为："
echo "https://junaspark.github.io/fe-algorithm-notes/"
