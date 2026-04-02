# 蒸留器

詩の断片生成・コーパス蓄積ツール / private

---

## セットアップ

```bash
# 1. セットアップ（初回のみ）
chmod +x setup.sh start.sh deploy.sh
./setup.sh

# 2. 開発サーバー起動
./start.sh
# → http://localhost:3000
```

---

## Supabaseテーブル作成

`supabase/schema.sql` の内容を  
Supabase Dashboard → SQL Editor に貼り付けて実行してください。

---

## Vercelデプロイ

```bash
./deploy.sh
```

---

## 環境変数

| 変数 | 説明 |
|---|---|
| `BASIC_USER` | ベーシック認証ユーザー名 |
| `BASIC_PASS` | ベーシック認証パスワード |
| `ANTHROPIC_API_KEY` | Anthropic APIキー（サーバー側・無料枠用） |
| `GEMINI_API_KEY` | Gemini APIキー（サーバー側・無料枠用） |
| `OPENAI_API_KEY` | OpenAI APIキー（サーバー側・無料枠用） |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Supabase service key（サーバー側のみ） |

---

## モデル構成

| API | 無料枠（サーバーキー） | 上位（ユーザーキー） |
|---|---|---|
| Anthropic | Claude Haiku | Claude Sonnet |
| Gemini | Gemini 2.5 Flash | Gemini 2.5 Pro |
| OpenAI | gpt-4o-mini | gpt-4o |

UIでAPIキーを入力すると上位モデルが解放されます。

---

## ディレクトリ構成

```
distiller/
├── app/
│   ├── api/distill/route.ts     # 生成API
│   ├── api/corpus/route.ts      # コーパスCRUD
│   ├── api/corpus/[id]/route.ts # コーパス削除
│   ├── layout.tsx
│   └── page.tsx                 # メインUI
├── components/
│   ├── ApiSettings.tsx
│   ├── FragmentCard.tsx
│   ├── Corpus.tsx
│   └── Overlay.tsx
├── lib/
│   ├── api/anthropic.ts
│   ├── api/gemini.ts
│   ├── api/openai.ts
│   ├── models.ts
│   ├── prompt.ts
│   ├── supabase.ts
│   └── types.ts
├── styles/globals.css
├── supabase/schema.sql
├── setup.sh
├── start.sh
└── deploy.sh
```
