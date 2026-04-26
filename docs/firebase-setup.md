# Firebase セットアップ

蒸留器のコーパスを Firestore に永続化し、複数端末（PC / Mac / iPhone）から同じコーパスへアクセスするための設定手順。

3 つの動作モードがある:

| モード | 条件 | 振る舞い |
|---|---|---|
| ローカル専用 | Firebase 未設定 or 未サインイン | localStorage のみ。端末ロック |
| サインイン済み | Firebase 設定済 + サインイン済み | Firestore に保存、複数端末で同期。localStorage はオフラインミラー |
| ミドルウェア基本認証 | `BASIC_USER` / `BASIC_PASS` 設定時 | サイト全体に basic 認証ゲート（Firebase Auth と独立） |

## 1. Firebase プロジェクト作成

1. [Firebase Console](https://console.firebase.google.com/) → 「プロジェクトを追加」
2. 任意の名前（例: `word-distiller`）
3. Google Analytics は不要（オフで可）

## 2. Firestore 有効化

1. 左メニュー「Firestore Database」→「データベースを作成」
2. ロケーション: `asia-northeast1`（東京）を推奨
3. セキュリティルール: 「本番環境モード」を選択

### セキュリティルール

Firebase Console → Firestore → ルール:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // クライアントからの直接アクセスは全拒否。
    // Admin SDK（サーバー）のみアクセス可。
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Admin SDK はルールをバイパスするためアプリは正常動作する。
ユーザーごとのスコープは API 側で `uid` フィールドで強制している。

## 3. Authentication 有効化

サインイン機能を使う場合（推奨）:

1. 左メニュー「Authentication」→「始める」
2. 「Sign-in method」タブで以下を有効化:
   - **Google**: トグルを ON、サポートメールを選択して保存
   - **メール / パスワード**: トグルを ON（「メールリンク（パスワードなし）」は OFF のまま）

### 認可ドメイン

「Authentication → 設定 → 承認済みドメイン」に以下を追加:

- `localhost`（開発）
- 本番ドメイン（例: `your-app.vercel.app` または独自ドメイン）

## 4. Web アプリ登録（クライアント SDK 設定取得）

1. Firebase Console → 歯車アイコン →「プロジェクトの設定」
2. 「全般」タブの最下部「マイアプリ」→ ウェブアイコン `</>` を選択
3. アプリのニックネーム（例: `distiller-web`）→「アプリを登録」
4. 表示される設定オブジェクトから 4 つの値を控える:

```js
const firebaseConfig = {
  apiKey: "AIza...",                // → NEXT_PUBLIC_FIREBASE_API_KEY
  authDomain: "xxx.firebaseapp.com",// → NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  projectId: "your-project-id",     // → NEXT_PUBLIC_FIREBASE_PROJECT_ID
  storageBucket: "...",             // 未使用
  messagingSenderId: "...",         // 未使用
  appId: "1:1234:web:abcd..."       // → NEXT_PUBLIC_FIREBASE_APP_ID
}
```

`NEXT_PUBLIC_*` プレフィックスはクライアントへ露出することを示す。Firebase の Web 設定はクライアント露出が前提なので問題ない（セキュリティはルールと API 認可で担保）。

## 5. サービスアカウントキー取得（Admin SDK 用）

1. Firebase Console → 歯車 →「プロジェクトの設定」
2. 「サービスアカウント」タブ → 「新しい秘密鍵の生成」→ JSON ダウンロード
3. JSON から 3 つの値を `.env.local` に転記:

| JSONキー | 環境変数 |
|---|---|
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` |

## 6. `.env.local` に記入

```bash
# Admin SDK（サーバー側）
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"

# Web SDK（クライアント側 / Auth）
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef1234567890
```

`FIREBASE_PRIVATE_KEY` の注意:
- ダブルクォートで囲む（改行 `\n` を含むため）
- 改行は文字列の `\n` のまま（実改行に変換しない）

## 7. 動作確認

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開き、ヘッダー右上に表示が:

| 表示 | 意味 |
|---|---|
| `サインイン` ボタン | Firebase Web SDK 設定済み・未ログイン |
| メールアドレス + サインアウト | サインイン済み |
| `ローカル専用` | `NEXT_PUBLIC_FIREBASE_*` 未設定 |

サインイン後、断片を採用するとフッターが「DB同期」になる。

## 8. Vercel デプロイ

Vercel Dashboard → Settings → Environment Variables に **7 つ全て** を追加:

- `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`
- `NEXT_PUBLIC_FIREBASE_API_KEY` / `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` / `NEXT_PUBLIC_FIREBASE_PROJECT_ID` / `NEXT_PUBLIC_FIREBASE_APP_ID`

`FIREBASE_PRIVATE_KEY` は「Sensitive」にチェック。値は JSON から取り出した文字列をそのままペースト。

デプロイ後、本番ドメインを Firebase Console → Authentication → 承認済みドメインに追加すること。

## アーキテクチャ

```
[ブラウザ]
  ├── Firebase Web SDK (Auth) ─→ ID トークン取得
  ├── localStorage（オフラインミラー）
  └── /api/corpus, /api/distill
        ↓ Authorization: Bearer <idToken>

[Next.js API Route]
  ├── verifyAuth() → uid を取得
  ├── /api/corpus  → Firestore に uid scope で読み書き
  └── /api/distill → uid scope の採用断片を取得 → プロンプト生成

[Firestore]
  corpus/
    {auto-id}: { uid, text, verdict, ... }
```

未サインイン時は API は 401 を返し、クライアントは localStorage のみで動作する。
