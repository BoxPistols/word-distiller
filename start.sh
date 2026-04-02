#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "  蒸留器 — 起動中"
echo "  ────────────────"
echo ""

# .env.local チェック
if [ ! -f ".env.local" ]; then
  echo "  .env.local が見つかりません。先に ./setup.sh を実行してください。"
  exit 1
fi

# node_modules チェック
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}→ 依存パッケージをインストールしています...${NC}"
  npm install
fi

echo -e "${GREEN}→ http://localhost:3000 で起動します${NC}"
echo "  停止: Ctrl+C"
echo ""

npm run dev
