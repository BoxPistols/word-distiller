# 蒸留器 (word-distiller)

詩の断片生成・コーパス蓄積・組詩編集ツール。

## 構成

| 系統 | URL | 機能 |
|---|---|---|
| 本体（要 Vercel デプロイ）| 未デプロイ | 蒸留器・コーパス・組詩・サインイン・RAG |
| 公開ページ（GitHub Pages）| https://boxpistols.github.io/word-distiller/random-word/ | ランダム流し場（AI 不要、純クライアント）|

## 機能

- **蒸留**: 入力から詩の断片を生成（OpenAI / Gemini、ユーザーキー入力で上位モデル解放）
- **判定**: 採用/却下を理由・タグ付きで記録
- **コーパス**: 採用断片をベクトル化（OpenAI `text-embedding-3-small` 1536 dim）し top-k 類似検索で次回生成に渡す（RAG）
- **再評価**: 既存断片の本文・採用却下・理由・タグを後から編集可能
- **組詩**: 採用断片やランダム語を行として組み、下書き → 清書 → 製本版 と昇華させる。drag&drop / ↑↓ 並べ替え / Markdown 書き出し
- **ランダム流し場**: 純クライアント。具体名詞辞書から流し続け、無意味度 5 段階で挙動が変化（純ランダム / ほぼランダム / 中庸 / 連想 / 詩寄り）

## セットアップ

```bash
./setup.sh   # 初回（.env.local テンプレート＋npm install）
./start.sh   # 開発サーバー（http://localhost:3000）
```

## デプロイ

- **本体（Vercel）**: 手順は [`docs/vercel-setup.md`](docs/vercel-setup.md)
- **公開ページ（GitHub Pages）**: `main` の `/docs` フォルダから自動配信

```bash
./deploy.sh   # .env.local の env を Vercel に登録 → 本番デプロイ
```

## 環境変数

`.env.local.example` をコピーして使用。詳細は `.env.local.example` のコメント参照。

| キー | 用途 |
|---|---|
| `OPENAI_API_KEY` | OpenAI（蒸留 + embedding 共通）|
| `GEMINI_API_KEY` | Gemini（蒸留・任意）|
| `BASIC_USER` / `BASIC_PASS` | ベーシック認証（任意）|
| `FIREBASE_PROJECT_ID` / `_CLIENT_EMAIL` / `_PRIVATE_KEY` | Firebase Admin SDK（サーバー側）|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase Web SDK（クライアント側、Auth 用）|

Firebase 設定の詳細は [`docs/firebase-setup.md`](docs/firebase-setup.md) 参照。

## モデル構成

| API | 無料枠（サーバーキー） | 上位（ユーザーキー） |
|---|---|---|
| OpenAI | gpt-4o-mini | gpt-4o |
| Gemini | gemini-2.5-flash | gemini-2.5-pro |

UI で API キーを入力すると上位モデルが解放される。

## ディレクトリ構成

```
word-distiller/
├── app/
│   ├── api/
│   │   ├── distill/route.ts        # 蒸留 API
│   │   ├── corpus/route.ts         # コーパス GET/POST
│   │   ├── corpus/[id]/route.ts    # コーパス PATCH/DELETE
│   │   ├── poems/route.ts          # 組詩 GET/POST
│   │   └── poems/[id]/route.ts     # 組詩 PATCH/DELETE
│   ├── layout.tsx
│   └── page.tsx                    # メイン UI
├── components/
│   ├── ApiSettings.tsx
│   ├── Auth.tsx
│   ├── Corpus.tsx                  # コーパス + 編集
│   ├── FragmentCard.tsx
│   ├── Overlay.tsx
│   ├── Poems.tsx                   # 組詩ステージ
│   └── RandomWord.tsx              # ランダム流し場
├── lib/
│   ├── api/                        # OpenAI / Gemini クライアント
│   ├── auth-context.tsx            # Firebase Auth クライアント
│   ├── auth-server.ts              # IDトークン検証
│   ├── embedding.ts                # OpenAI text-embedding-3-small
│   ├── firebase.ts                 # Firebase Admin SDK
│   ├── firebase-client.ts          # Firebase Web SDK
│   ├── models.ts
│   ├── prompt.ts
│   ├── random-words.ts             # 具体名詞辞書（カテゴリ別）
│   ├── abstract-words.ts           # 抽象語・形容詞辞書（Lv1+ 用）
│   └── types.ts
├── docs/
│   ├── index.html                  # GitHub Pages トップ
│   ├── random-word/index.html      # ランダム流し場（公開版）
│   ├── firebase-setup.md           # Firebase セットアップ
│   └── vercel-setup.md             # Vercel デプロイ手順
├── styles/globals.css
├── setup.sh / start.sh / deploy.sh
└── README.md
```

## テスト

```bash
npm test     # vitest run
```

## ライセンス

private 利用前提。public リポジトリだが他者利用は想定していない。
