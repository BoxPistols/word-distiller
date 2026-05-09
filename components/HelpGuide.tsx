'use client'

// 使い方ガイド — 読み物コンポーネント。動的処理なし。
// セクション: クイックスタート / 各タブの使い方 / 用語集 / データの保存先 / トラブルシュート

export default function HelpGuide() {
  return (
    <div style={wrap}>
      <Section title="クイックスタート" hint="まず何をするか">
        <ol style={ol}>
          <li><b>蒸留</b>タブで断片を生成し、気に入った行を「採用」する</li>
          <li><b>コーパス</b>タブに採用断片が溜まる。並び替え・編集・再評価できる</li>
          <li><b>組詩</b>タブで「新しく組む」 → 採用断片やランダム語を行として並べる</li>
          <li>整ったら状態を <b>清書</b>、最終形は <b>製本版</b> に昇格（製本版は本文編集ロック）</li>
          <li><b>歌集</b>タブで完成品を通読・全曲書き出し・全曲 TTS 連続再生</li>
        </ol>
        <p style={p}>
          <b>真のゴールは詩作品の生成</b>です。蒸留・コーパス・ランダムは素材庫であって目的ではありません。
        </p>
      </Section>

      <Section title="各タブの使い方" hint="タブ別の機能解説">
        <Block label="歌集">
          完成した詩（清書・製本版）を 1 ページで通読できる場所。状態フィルタ（製本版のみ／清書以上／全て）で絞り込み。全曲を連続表示・全曲を連続 TTS 再生・全曲を一括書き出し（テキスト／Markdown／JSON）。
        </Block>
        <Block label="組詩">
          詩を組み立てる中心の作業場。
          <ul style={ul}>
            <li><b>状態</b>: 下書き → 清書 → 製本版（製本版は本文編集ロック、状態を戻せば解除）</li>
            <li><b>セクション</b>: イントロ・A メロ・B メロ・プリサビ・サビ・ブリッジ・アウトロ・自由 の 8 種類。↑↓ ボタン or ドラッグで並べ替え</li>
            <li><b>行</b>: 各セクションに行を追加。「+空行」「+ランダム N 個」「+採用から」（コーパス採用断片を選択挿入）「AI 意味付け」（OpenAI/Gemini が短いフレーズを生成）</li>
            <li><b>シャッフル</b>: 各部の行 / 全行（境界跨ぎ）/ 部の順</li>
            <li><b>重複行</b>: <b>俯瞰</b>トグルで重複以外を淡色化、<b>全体から重複を削除</b>または<b>各セクション内のみ</b>で一括削除</li>
            <li><b>マージ</b>: 「マージ」ボタンで複数の組詩を選択 → 1 つに統合（重複統合オプション付き）</li>
            <li><b>清書化</b>: 清書タブで下書きを 1 セクション結合 TextArea にまとめて新規清書を生成（元下書きは保持）</li>
            <li><b>読み上げ</b>: ブラウザ標準 / xAI Grok / VOICEVOX を切替。BYOK キーは自端末ローカル保存</li>
          </ul>
        </Block>
        <Block label="作曲">
          歌詞のセクションを選択 → Tone.js + AI が <b>1 モーラ（1 文字）= 1 音</b> でメロディを生成。
          拗音は前と結合（きゃ・しゅ・ちょは 1 音）、促音や長音は独立、句読点は無視。再生中は文字単位で発音とハイライトが同期する。
          <b>テンポ / キー（C 〜 B）/ 旋法（長調・短調・ペンタ・陰旋法・陽旋法・ドリアン）</b>を指定可能（自動なら AI に任せる）。
          <b>ランダム度 0〜4</b> で生成の保守的さと再生時の揺らぎ（jitter / 装飾音 / ハーモニー）を制御。
          <br /><br />
          <b>生成方式の切替:</b>
          <ul style={{ paddingLeft: 22, marginTop: 4 }}>
            <li><b>メロディ（LLM・歌詞同期）</b> — 既定。1 文字 1 音で歌詞と同期</li>
            <li><b>インスト BGM（Replicate MusicGen）</b> — 5〜30 秒のインスト音源を AI 生成。Replicate API キーを「Replicate Key」欄に入れる必要あり（端末ローカル保存・BYOK、$0.005/秒程度の課金）。30〜60 秒待つ</li>
          </ul>
        </Block>
        <Block label="映像">
          歌詞の各行に同期した抽象映像。Canvas 2D で 4 スタイル（朝霧・雨・雪・文字粒子）から選択、密度（疎/中/密）と速度（遅/中/速）も調整可能。文字粒子モードでは歌詞の字自体が舞う。
        </Block>
        <Block label="コーパス">
          採用 / 却下した断片の倉庫。タグ・コメント・並び替え・編集・再評価（採用 ⇄ 却下、embedding は自動同期）。
          「重」バッジは他の組詩や同コーパス内に同一行があることを示す。「使用中」バッジは組詩から参照されている断片。
        </Block>
        <Block label="蒸留">
          AI に短い断片を生成させて、「採用 / 却下」で取捨選択する場所。
          <b>散漫度</b>スライダー（0〜4）で意味の凝集度を調整できる。採用するとコーパスに保存され、サインイン時は embedding も自動生成。
        </Block>
        <Block label="ランダム">
          辞書ベースの語彙が画面に流れ続ける場所（AI 不使用、保存なし）。<b>無意味度</b>0〜4 で語彙の混ざり方が変わる。
          気に入った語は pool に追加し、組詩の自由セクションへ送信できる。
        </Block>
      </Section>

      <Section title="用語集" hint="迷ったらここを参照">
        <DL pairs={[
          ['断片',       'AI が生成する短い 1 行。蒸留タブで採用 / 却下する単位'],
          ['採用 / 却下', 'コーパスに保存するか捨てるか。embedding は採用時のみ生成'],
          ['組詩',       'セクションと行で構成された詩の集合体。歌詞構造を持つ'],
          ['下書き',     '推敲中の組詩。本文編集自由'],
          ['清書',       '推敲が一段落した形。1 セクション結合 TextArea に統合した形でも作れる'],
          ['製本版',     '完成形。本文編集ロック。歌集タブで通読対象'],
          ['俯瞰',       '重複している行だけ通常色、それ以外を淡色化して重複箇所を一目で見るモード'],
          ['provider',   '読み上げ音声の提供元。browser（無料・機械音声）/ xAI Grok（自然・BYOK）/ VOICEVOX（ずんだもん等・自前ホスト）'],
          ['BYOK',       'Bring Your Own Key。自分の API キーを localStorage に保存して使う方式'],
          ['散漫度',     '蒸留タブのスライダー。低いほど意味が凝集、高いほど散漫'],
          ['無意味度',   'ランダムタブのスライダー。低いほど具体名詞のみ、高いほど詩寄り'],
          ['embedding',  '断片の意味ベクトル。RAG で類似断片を検索する時に使う（OpenAI text-embedding-3-small 1536 次元）'],
        ]} />
      </Section>

      <Section title="データの保存先" hint="どこに保存されているか">
        <p style={p}>
          <b>サインイン状態</b>で動作が変わります（右上のサインインボタンで切替）。
        </p>
        <DL pairs={[
          ['未サインイン', 'localStorage のみ。同端末・同ブラウザでしか見えない。RAG は採用最新 5 件をクライアント送信'],
          ['サインイン済', 'Firestore（uid ごとに分離）+ localStorage ミラー。複数端末で同期。RAG はサーバー側で top-5 cosine 類似度'],
          ['BYOK キー',   'localStorage（端末ローカル）にのみ保存。サーバーには送信されない'],
          ['組詩・コーパス削除', '削除は所有者のみ可能。他人の uid データには触れられないルール'],
        ]} />
      </Section>

      <Section title="ショートカット・操作" hint="キーボードと UI">
        <ul style={ul}>
          <li>タブ移動: Tab キーでフォーカス、Enter / Space で選択</li>
          <li>行の並べ替え: ↑↓ ボタン or 行頭の ⋮⋮ をドラッグ</li>
          <li>セクション削除: 各セクションの × ボタン（確認ダイアログあり）</li>
          <li>重複削除: <b>組詩</b>タブの編集画面、シャッフル行直下に「重複行」行が現れる</li>
          <li>歌集の連続再生: 各曲の再生ボタンを押すと次の曲へ自動継続。X / Y 文の進捗 + 一時停止 / 再開 / 停止の 3 ボタン</li>
        </ul>
      </Section>

      <Section title="トラブルシュート" hint="うまくいかない時">
        <DL pairs={[
          ['「組詩を作る」ボタンが押せない',   'マージタブでは 2 件以上、清書タブでは 1 件以上の選択が必要。tooltip で必要件数を表示'],
          ['VOICEVOX が動かない',              '本番（HTTPS）から HTTP の VOICEVOX への mixed content。自前で HTTPS リバースプロキシを立てて localStorage の d_voicevox_url にエンドポイントを設定'],
          ['xAI TTS が 401',                  'BYOK キーまたは XAI_API_KEY env を確認。サインインが必須'],
          ['同期されない',                     '右上のサインイン状態を確認。フッタの「DB同期 / ローカルのみ」も参考'],
        ]} />
      </Section>
    </div>
  )
}

// — ヘルパー —

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={section}>
      <header style={secHeader}>
        <h2 style={h2}>{title}</h2>
        {hint && <span style={hintStyle}>{hint}</span>}
      </header>
      <div style={secBody}>{children}</div>
    </section>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={block}>
      <h3 style={h3}>{label}</h3>
      <div style={blockBody}>{children}</div>
    </div>
  )
}

function DL({ pairs }: { pairs: [string, string][] }) {
  return (
    <dl style={dl}>
      {pairs.map(([term, desc]) => (
        <div key={term} style={dlRow}>
          <dt style={dt}>{term}</dt>
          <dd style={dd}>{desc}</dd>
        </div>
      ))}
    </dl>
  )
}

// — スタイル（寒色系・fontSize 12px 以上）—

const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 36, padding: '24px 0' }
const section: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 }
const secHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 14,
  borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  paddingBottom: 8,
}
const h2: React.CSSProperties = { fontSize: 16, fontWeight: 400, color: 'var(--bright)', letterSpacing: '.2em' }
const hintStyle: React.CSSProperties = { fontSize: 12, color: 'var(--dim)', letterSpacing: '.1em' }
const secBody: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, lineHeight: 1.7, color: 'var(--mid)' }
const block: React.CSSProperties = {
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  borderRadius: 4, padding: '14px 16px', background: 'var(--glass)',
}
const blockBody: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: 'var(--mid)' }
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 500, color: 'var(--acc)', letterSpacing: '.2em', marginBottom: 8 }
const ol: React.CSSProperties = { paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, lineHeight: 1.7 }
const ul: React.CSSProperties = { paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: 1.7, marginTop: 4 }
const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: 'var(--mid)' }
const dl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }
const dlRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14, alignItems: 'baseline', lineHeight: 1.7 }
const dt: React.CSSProperties = { color: 'var(--bright)', fontWeight: 400, letterSpacing: '.05em' }
const dd: React.CSSProperties = { color: 'var(--mid)' }
