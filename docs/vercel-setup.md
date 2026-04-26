# Vercel デプロイ手順

本体（蒸留器・コーパス・組詩・サインイン）を Vercel にデプロイする手順。GitHub Pages 上の `random-word/` は別系統（静的ページ）として継続する。

## 前提

- Firebase プロジェクトが作成済み（`docs/firebase-setup.md` を参照）
- ローカルで `.env.local` が動作確認済み
- Vercel アカウントを保有（無料枠で OK）

## 1. Vercel CLI 準備

```bash
npm install -g vercel
vercel login   # ブラウザ認証
```

## 2. プロジェクト作成（初回のみ）

リポジトリ直下で:

```bash
vercel link
```

質問に答える:
- Set up and deploy: **Y**
- Link to existing project?: **N**（初回）
- Project name: 例 `word-distiller`
- Directory: `./`（デフォルト）

## 3. 環境変数を Vercel に登録

### CLI で一括登録（推奨）

`.env.local` を作成済みなら同梱の `deploy.sh` で自動登録:

```bash
./deploy.sh
```

### 手動登録（Vercel Dashboard）

Project → Settings → Environment Variables → 各キーを `Production` / `Preview` / `Development` 全環境で追加。

| キー | 用途 |
|---|---|
| `OPENAI_API_KEY` | OpenAI（蒸留 + embedding 共通）|
| `GEMINI_API_KEY` | Gemini（蒸留・任意）|
| `BASIC_USER` / `BASIC_PASS` | ベーシック認証（任意、設定時のみ有効）|
| `FIREBASE_PROJECT_ID` | Firebase Admin SDK |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin SDK |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK（**改行は `\n` のままで OK**、Vercel は文字列を保持）|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web SDK（クライアントへ露出）|
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Web SDK |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Web SDK |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web SDK |

`FIREBASE_PRIVATE_KEY` の改行は `lib/firebase.ts` 側で `\\n → \n` に変換しているので、Vercel UI 上では 1 行の文字列（`\n` を含む）で OK。

## 4. 本番デプロイ

```bash
vercel --prod
```

または `deploy.sh` の末尾で自動実行される。

完了すると `https://word-distiller-xxxxx.vercel.app/` 等の URL が発行される。

## 5. Firebase 側の認可ドメイン追加

サインインを動かすため、Firebase Console で:

1. Authentication → Settings → Authorized domains
2. Vercel が発行したドメイン（例 `word-distiller.vercel.app`）を追加
3. カスタムドメインを使う場合はそちらも追加

## 6. 動作確認

- `https://<your-vercel-url>/` を開く → 蒸留器 UI が表示される
- 「Google でサインイン」→ Firebase 認証が通る
- 蒸留・採用 → コーパスが Firestore に保存される
- 組詩を作成 → `poems` コレクションに保存される
- footer に「DB同期」表示が出れば成功

## トラブル

### サインインで `auth/unauthorized-domain`
→ Firebase Console の認可ドメインに Vercel ドメインを追加していない。手順 5 をやり直す。

### 蒸留が `Firebase未設定` で失敗
→ サーバー側 env（`FIREBASE_PROJECT_ID` / `_CLIENT_EMAIL` / `_PRIVATE_KEY`）が未設定。Vercel Dashboard で確認。

### `FIREBASE_PRIVATE_KEY` のフォーマットエラー
→ Vercel UI で値を貼る時、JSON ファイルの `private_key` フィールドをそのまま（`\n` 文字を含めて）コピペすれば OK。手で改行を入れるとエラーになる。

## GitHub Pages（`random-word/`）との関係

- `https://boxpistols.github.io/word-distiller/random-word/` は**静的ページ**として GitHub Pages から配信され続ける
- Vercel は本体（API routes が必要な機能）を担当
- 2 系統は独立。データも共有しない
