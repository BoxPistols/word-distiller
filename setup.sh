#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "  word-distiller — セットアップ"
echo "  ────────────────────────────"
echo ""

# Node.js チェック
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js が見つかりません。https://nodejs.org からインストールしてください。${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# npm チェック
if ! command -v npm &> /dev/null; then
  echo -e "${RED}✗ npm が見つかりません。${NC}"
  exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"
echo ""

# .env.local の作成
if [ ! -f ".env.local" ]; then
  echo -e "${YELLOW}→ .env.local を .env.local.example からコピーします${NC}"
  cp .env.local.example .env.local
  echo -e "${GREEN}✓ .env.local を作成しました${NC}"
  echo ""
  echo -e "${YELLOW}  必要な値を埋めてください:${NC}"
  echo "    - OPENAI_API_KEY / GEMINI_API_KEY"
  echo "    - FIREBASE_* （docs/firebase-setup.md 参照）"
  echo "    - NEXT_PUBLIC_FIREBASE_*"
  echo ""
else
  echo -e "${GREEN}✓ .env.local は既に存在します${NC}"
  echo ""
fi

# 依存パッケージ
echo -e "${YELLOW}→ 依存パッケージをインストールしています...${NC}"
npm install
echo -e "${GREEN}✓ インストール完了${NC}"
echo ""

echo -e "${GREEN}  セットアップ完了${NC}"
echo ""
echo "  次のコマンド:"
echo -e "    ${YELLOW}./start.sh${NC}    # 開発サーバー（http://localhost:3000）"
echo -e "    ${YELLOW}./deploy.sh${NC}   # Vercel 本番デプロイ（docs/vercel-setup.md 参照）"
echo ""
