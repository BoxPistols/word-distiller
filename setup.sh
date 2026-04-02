#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "  蒸留器 — セットアップ"
echo "  ────────────────────────"
echo ""

# Node.jsチェック
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js が見つかりません。https://nodejs.org からインストールしてください。${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# npmチェック
if ! command -v npm &> /dev/null; then
  echo -e "${RED}✗ npm が見つかりません。${NC}"
  exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

echo ""

# .env.local の作成
if [ ! -f ".env.local" ]; then
  echo -e "${YELLOW}→ .env.local を作成します${NC}"
  cp .env.local.example .env.local

  echo ""
  echo "  以下の情報を入力してください（Enterでスキップ）"
  echo ""

  read -p "  BASIC_USER (ログインユーザー名) [admin]: " BASIC_USER
  BASIC_USER=${BASIC_USER:-admin}

  read -s -p "  BASIC_PASS (ログインパスワード): " BASIC_PASS
  echo ""

  read -p "  ANTHROPIC_API_KEY [sk-ant-...]: " ANTHROPIC_KEY
  read -p "  GEMINI_API_KEY [AI...]: " GEMINI_KEY
  read -p "  OPENAI_API_KEY [sk-...]: " OPENAI_KEY

  echo ""
  read -p "  SUPABASE_URL [https://xxx.supabase.co]: " SUPABASE_URL
  read -p "  SUPABASE_ANON_KEY [eyJ...]: " SUPABASE_ANON
  read -p "  SUPABASE_SERVICE_KEY [eyJ...]: " SUPABASE_SVC

  # .env.local に書き込み
  cat > .env.local << EOF
BASIC_USER=${BASIC_USER}
BASIC_PASS=${BASIC_PASS}

ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
GEMINI_API_KEY=${GEMINI_KEY}
OPENAI_API_KEY=${OPENAI_KEY}

NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON}
SUPABASE_SERVICE_KEY=${SUPABASE_SVC}
EOF

  echo -e "${GREEN}✓ .env.local を作成しました${NC}"
else
  echo -e "${GREEN}✓ .env.local が既に存在します${NC}"
fi

echo ""

# 依存関係インストール
echo -e "${YELLOW}→ 依存パッケージをインストールしています...${NC}"
npm install
echo -e "${GREEN}✓ インストール完了${NC}"

echo ""
echo -e "${GREEN}  セットアップ完了${NC}"
echo ""
echo "  次のコマンドで起動できます:"
echo ""
echo -e "    ${YELLOW}./start.sh${NC}         # 開発サーバー起動"
echo -e "    ${YELLOW}./deploy.sh${NC}        # Vercelにデプロイ"
echo ""
echo "  Supabaseのテーブル作成は supabase/schema.sql を"
echo "  Supabase Dashboard > SQL Editor で実行してください。"
echo ""
