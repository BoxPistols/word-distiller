# 詠 / yomu (word-distiller)

言葉と音声・映像の総合詩作ツール。詩の断片生成からコーパス蓄積、組詩編集、AI 作曲、抽象映像、TTS 連続再生まで、最終的に「製本版の詩作品」へ昇華させるワークフローを提供する。

## 構成

| 系統 | URL | 機能 |
|---|---|---|
| 本体（Vercel）| https://word-distiller-delta.vercel.app/ | 全機能（要サインイン） |
| 公開ページ（GitHub Pages）| https://boxpistols.github.io/word-distiller/random-word/ | ランダム流し場（AI 不要、純クライアント） |

## 主要機能

7 タブ + 使い方タブで構成。

- **歌集 (Anthology)**: 完成品（清書・製本版）の通読、全曲書き出し（テキスト / Markdown / JSON）、全曲連続 TTS（chunk queue + pause/resume + 進捗）
- **組詩 (Poems)**: 詩の組み立て中心。8 種のセクション（イントロ / A メロ / B メロ / プリサビ / サビ / ブリッジ / アウトロ / 自由）、状態 3 段階（下書き / 清書 / 製本版）、↑↓ + drag&drop、シャッフル 3 種、**重複行の俯瞰と一括削除**、組詩同士マージ、AI 意味付け
- **作曲 (Composer)**: 3 つの生成方式
  - **メロディ（LLM・歌詞同期）**: 歌詞を**モーラ単位（1 文字 1 ノート）**に分割し OpenAI / Gemini にメロディ JSON 生成。Tone.js で再生中は文字単位ハイライト同期。テンポ / キー / 旋法（長調・短調・ペンタ・陰旋法・陽旋法・ドリアン）/ ランダム度（0〜4）を指定可能
  - **インスト BGM（Replicate MusicGen）**: 5〜30 秒のインスト音源を AI 生成（BYOK、$0.005/秒）
  - **歌入り音源（Suno API）**: 歌詞 + style から完成音源（BYOK、wrapper endpoint も指定可能）
- **映像 (Visualizer)**: 歌詞同期の Canvas 2D 抽象映像。**朝霧 / 雨 / 雪 / 文字粒子** 4 スタイル切替、密度（疎・中・密）と速度（遅・中・速）調整
- **コーパス (Corpus)**: 採用断片の倉庫、再評価（採用 ⇄ 却下、embedding 自動同期）、重複検知、編集
- **蒸留 (Distill)**: AI 断片生成 → 採用 / 却下。採用時に embedding 自動生成（OpenAI `text-embedding-3-small` 1536 dim）し top-k cosine 類似で RAG
- **ランダム (RandomWord)**: 純クライアント、辞書ベース、無意味度 5 段階（Lv0〜Lv4）
- **使い方 (HelpGuide)**: クイックスタート / 各タブ解説 / 用語集 / トラブルシュート

### 認証 + 同期

- Firebase Auth（Google + メール/パスワード）
- Firestore でユーザー uid scope のリアルタイム同期（`onSnapshot`）
- 未サインイン時は localStorage のみ

### TTS provider 抽象化

- ブラウザ標準（無料・機械音声）
- xAI Grok TTS（自然・BYOK）
- VOICEVOX（ずんだもん 4 種・四国めたん 2 種等 14 スタイル、自前ホスト）

## セットアップ

```bash
./setup.sh   # 初回（.env.local テンプレート + npm install）
npm run dev  # 開発サーバー（http://localhost:3100）
```

## デプロイ

- **本体（Vercel）**: 手順は [`docs/vercel-setup.md`](docs/vercel-setup.md)
- **公開ページ（GitHub Pages）**: `main` の `/docs` フォルダから自動配信

```bash
./deploy.sh   # .env.local の env を Vercel に登録 → 本番デプロイ
```

## 環境変数

`.env.local.example` をコピーして使用。詳細は同ファイルのコメント参照。

| キー | 用途 |
|---|---|
| `OPENAI_API_KEY` | OpenAI（蒸留 + embedding + 作曲メロディ生成 + AI 意味付け）|
| `GEMINI_API_KEY` | Gemini（蒸留・任意） |
| `XAI_API_KEY` | xAI Grok TTS（任意、サーバー fallback。BYOK は localStorage `d_xai_key`）|
| `REPLICATE_API_TOKEN` | Replicate MusicGen（任意、BYOK は localStorage `d_replicate_key`）|
| `SUNO_API_KEY` / `SUNO_API_URL` | Suno API（任意、BYOK は localStorage `d_suno_key` / `d_suno_endpoint`）|
| `BASIC_USER` / `BASIC_PASS` | ベーシック認証（任意）|
| `FIREBASE_PROJECT_ID` / `_CLIENT_EMAIL` / `_PRIVATE_KEY` | Firebase Admin SDK（サーバー側）|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase Web SDK（クライアント側）|

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
│   │   ├── distill/route.ts        # 蒸留
│   │   ├── corpus/route.ts         # コーパス GET/POST
│   │   ├── corpus/[id]/route.ts    # コーパス PATCH/DELETE
│   │   ├── poems/route.ts          # 組詩 GET/POST
│   │   ├── poems/[id]/route.ts     # 組詩 PATCH/DELETE
│   │   ├── poetize/route.ts        # AI 意味付け
│   │   ├── compose/route.ts        # メロディ生成（モーラ単位）
│   │   ├── musicgen/route.ts       # Replicate MusicGen インスト BGM
│   │   ├── suno/route.ts           # Suno API 歌入り
│   │   └── tts/route.ts            # xAI / VOICEVOX TTS proxy
│   ├── layout.tsx
│   └── page.tsx                    # メイン UI（7 タブ + 使い方）
├── components/
│   ├── Anthology.tsx               # 歌集（連続表示・連続 TTS）
│   ├── Poems.tsx                   # 組詩ステージ
│   ├── Composer.tsx                # 作曲（3 モード）
│   ├── Visualizer.tsx              # 映像（4 スタイル）
│   ├── Corpus.tsx                  # コーパス + 編集
│   ├── FragmentCard.tsx            # 蒸留断片カード
│   ├── RandomWord.tsx              # ランダム流し場
│   ├── HelpGuide.tsx               # 使い方ガイド
│   ├── Auth.tsx, ApiSettings.tsx, Overlay.tsx
├── lib/
│   ├── api/                        # OpenAI / Gemini クライアント
│   ├── tts/                        # TTS provider 抽象化（browser / xai / voicevox）
│   ├── auth-context.tsx, auth-server.ts
│   ├── firebase.ts, firebase-client.ts, sync.ts
│   ├── embedding.ts                # OpenAI embedding
│   ├── lyric-mora.ts               # 歌詞モーラ分割
│   ├── pitch.ts                    # 半音単位移調
│   ├── dedupe.ts                   # 重複検知
│   ├── random-words.ts, abstract-words.ts
│   └── types.ts
├── docs/                           # GitHub Pages 配信
├── styles/globals.css
├── firestore.rules, firebase.json
└── README.md
```

## テスト

```bash
npm test     # vitest run（53 件: cosineSimilarity / parseFragments / dedupe / lyric-mora / pitch / TTS chunk）
```

## ライセンス

private 利用前提。public リポジトリだが他者利用は想定していない。
