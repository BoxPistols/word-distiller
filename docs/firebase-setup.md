# Firebase セットアップ

蒸留器のコーパスをFirestore（クラウド）に永続化するための手順。
未設定でもlocalStorageで動作するため、設定は任意。

## なぜFirebaseか

- localStorageはブラウザ・端末に紐づく。別の端末やブラウザからは参照できない
- Firestoreに保存すると、どこからでも同じコーパスにアクセスできる
- ブラウザのデータ消去でコーパスが消えるリスクがなくなる

## 1. Firebaseプロジェクト作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」→ 任意の名前（例: `word-distiller`）
3. Google Analytics は不要（オフでOK）

## 2. Firestore 有効化

1. 左メニュー「Firestore Database」→「データベースを作成」
2. ロケーション: `asia-northeast1`（東京）を推奨
3. セキュリティルール: 「本番環境モード」を選択

### セキュリティルール

Firebase Console → Firestore → ルール で以下に置き換える:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // サーバーサイド（Admin SDK）からのみアクセス。
    // クライアントからの直接アクセスは全拒否。
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Admin SDK はセキュリティルールをバイパスするため、この設定でアプリは正常に動作する。

## 3. サービスアカウントキーの取得

1. Firebase Console → 歯車アイコン →「プロジェクトの設定」
2. 「サービスアカウント」タブ
3. 「新しい秘密鍵の生成」→ JSONファイルがダウンロードされる

このJSONから3つの値を `.env.local` に転記する:

| JSONのキー | 環境変数 |
|---|---|
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` |

## 4. `.env.local` に記入

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

`FIREBASE_PRIVATE_KEY` の注意点:
- JSONファイル内の `private_key` をそのままコピー
- ダブルクォートで囲む（改行文字 `\n` を含むため）
- 改行は `\n` のまま（実際の改行に変換しない）

## 5. 動作確認

```bash
npm run dev
```

サーバーログにFirebase関連のエラーがなければ接続成功。
ブラウザで蒸留器を開き、断片を判定して「コーパス」セクションに表示されれば完了。

## 6. Vercelにデプロイする場合

Vercel Dashboard → Settings → Environment Variables に同じ3つの変数を追加する。

`FIREBASE_PRIVATE_KEY` は Vercel上では以下に注意:
- 「Sensitive」にチェックを入れる
- 値はJSONから取り出した文字列をそのままペースト

## 現在のアーキテクチャ

```
[ブラウザ]
  ├── localStorage（即時保存・オフライン対応）
  └── /api/corpus → Firestore（設定時のみ有効）

[生成時のRAG]
  ブラウザのlocalStorageから採用コーパスを取得し
  /api/distill にリクエストボディとして送信
```

Firebase設定後も、localStorageが一次キャッシュとして機能する。
