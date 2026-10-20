#!/bin/sh
# 安装项目 git 钩子（提交后自动 push）
# 用法：sh tools/install-hooks.sh
set -e

cd "$(git rev-parse --show-toplevel)"
src="tools/git-hooks/post-commit"
dst=".git/hooks/post-commit"

if [ ! -f "$src" ]; then
  echo "[hooks] 找不到 $src" >&2
  exit 1
fi

cp "$src" "$dst"
chmod +x "$dst"
echo "[hooks] 已安装 post-commit → 每次提交后自动 push 到 origin"
echo "[hooks] 日志：.git/autopush.log　　关闭：删除 $dst"
