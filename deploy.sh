#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "  蒸留器 — Vercel デプロイ"
echo "  ──────────────────────────"
echo ""

# Vercel CLIチェック
if ! command -v vercel &> /dev/null; then
  echo -e "${YELLOW}→ Vercel CLI をインストールしています...${NC}"
  npm install -g vercel
fi

echo -e "${GREEN}✓ Vercel CLI 準備完了${NC}"
echo ""

# .env.local から環境変数を読み込んでVercelに設定
if [ -f ".env.local" ]; then
  echo -e "${YELLOW}→ 環境変数をVercelに設定しています...${NC}"

  while IFS='=' read -r key value; do
    # コメントと空行をスキップ
    [[ "$key" =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue

    value="${value//\"/}"  # クォート除去
    if [ -n "$value" ]; then
      echo "  設定: $key"
      echo "$value" | vercel env add "$key" production --force 2>/dev/null || true
    fi
  done < .env.local

  echo -e "${GREEN}✓ 環境変数を設定しました${NC}"
  echo ""
fi

# デプロイ
echo -e "${YELLOW}→ デプロイしています...${NC}"
vercel --prod

echo ""
echo -e "${GREEN}  デプロイ完了${NC}"
echo ""
