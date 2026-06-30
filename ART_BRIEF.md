# アバター・アート発注ブリーフ（ChatGPT用 / レイヤー合成・最小セット）

アバターは**部位パーツの重ね合わせ**で作る（全身固定スプライトはやめる）。
左右ミラー＋男女共通化＋部位分割で、最小 **41枚** に圧縮しつつ、部位ごと独立に組み替え可能。
アプリ内の現在の絵は**仮置き（プログラム生成）**で、ここで作るパーツに差し替える。

---

## 1. 軸の決定（重要）

- **体型(脂肪)＝全身一括**。キャラメイクの BMI で初期値が決まり、**その後ユーザーが自分の体に合わせて調整できる**
  （没入のため。ガリ⇄デブのスライダー的調整）。部位ごとに脂肪は持たない。
- **筋肉＝部位別**。鍛えた部位だけ育つ（腕トレ→腕、背中トレ→背中）。

→ 各パーツの「見た目状態」は **体脂肪(全身) と その部位の筋トレ段階** から選ぶ。

---

## 2. パーツ一覧と枚数（合計41）

5状態 = **ガリ / 標準 / ムキ / ムキムキ / デブ**（顔だけ脂肪3状態）。

| パーツ | 男女 | 必要数 | 状態 | 小計 |
|--------|------|--------|------|------|
| 腕（片側のみ・左右ミラー） | 共通 | 1 | 5 | 5 |
| 脚（片側のみ・左右ミラー） | 共通 | 1 | 5 | 5 |
| 腹 | 共通 | 1 | 5 | 5 |
| 胸（女性はスポーツインナー） | 性別 | 2 | 5 | 10 |
| 背中（＋後頭部） | 性別 | 2 | 5 | 10 |
| 顔 | 性別 | 2 | 3（こけ/標準/丸） | 6 |
| | | | **合計** | **41** |

---

## 3. 合成ルール

- **前面** = 顔 ＋ 胸 ＋ 腹 ＋ 腕(左右ミラー) ＋ 脚(左右ミラー)
- **背面** = 背中(＋後頭部) ＋ 腕(ミラー) ＋ 脚(ミラー)　（顔/胸/腹は使わない）
- 腕・脚は前後で共用（このドット解像度では許容。必要なら後で背面用に +10枚）。
- z順(前面): 脚 → 腹 → 胸 → 腕 → 顔。

### どの状態を出すか（アプリ側マッピング）
- その部位の筋トレ段階 tier:
  - tier0 → 体脂肪で分岐: ガリ / 標準 / デブ
  - tier1〜2 → ムキ
  - tier3〜4 → ムキムキ
- 顔は筋肉無関係 → 体脂肪のみで こけ / 標準 / 丸。
- 体脂肪は全身共通値（BMI初期 → ユーザー調整）。

---

## 4. 整列(アンカー)仕様 ※崩れ防止の肝

- 共通キャンバス **64×96px**、透過。**各パーツは“全身の中の自分の定位置”に描く**（パーツ単体を中央寄せにしない）。
  - 頭: 上端中央 / 胸: 上胴 / 腹: 中胴 / 腕: 胴の左右どちらか片側 / 脚: 下部・中心からやや外。
- 同じパーツの5状態は**位置・接続点（肩・首・腰）を1pxもズラさない**。重ねてピタッと合うこと。
- 足の接地は下端中央で全パーツ共通。

---

## 5. スタイル仕様（金銀＝ゲームボーイカラー）

- ポケモン金銀級のドット感、アンチエイリアス禁止・グラデ禁止・ぼかし禁止。
- 限定パレット（〜16色）、各素材3階調。1pxの濃いアウトライン（`#15100e`）。
- ボクサー: 赤トランクス＋金ウエストバンド、赤グローブ、ボクシングシューズ。
  男性=上半身裸 / 女性=スポーツブラ（露出を狙わない健全なアスリート表現）。男女で画風・パレット共通。

---

## 6. ChatGPTでの作り方（位置合わせのコツ）

画像生成はパーツ位置がズレやすい。**「先に基準体を作る→そこから切り出す」**手順で安定させる。

1. まず基準キャラ（男・前面・標準）を1体、上記スタイルで生成。
2. その同一キャラ・同一64×96キャンバス・同一ポーズのまま、**各パーツを“定位置に置いた透過PNG”として個別に出力**させる。
3. 各パーツの5状態を、位置を固定したまま生成。

### そのまま貼るプロンプト（パーツ生成）

```
Pixel-art body part for a layered paper-doll character, Pokémon Gold/Silver (GBC) style.
Transparent background. Canvas 64×96 px, and the part must be drawn at its anatomical
position WITHIN that full-body canvas (do NOT center the part) so layers stack pixel-perfect.

Character: a boxer (red trunks + gold waistband, red gloves, boxing boots; male = bare torso,
female = sports bra). Keep one consistent art style and palette.

Output the [PART] in 5 development states as a horizontal row, same position in every frame,
ONLY the [PART] changes:
  1 ガリ(skinny)  2 標準(normal)  3 ムキ(muscular)  4 ムキムキ(ripped)  5 デブ(soft/fat)

Hard rules: chunky GBC pixels, NO anti-aliasing, NO gradients, NO blur, limited ~16-color
palette with 3 shades, 1px near-black (#15100e) outline. Export nearest-neighbor upscaled.

[PART] = e.g. "RIGHT ARM only (rest of body invisible)", "CHEST only", "BACK only", etc.
For face use 3 states (gaunt / normal / round) instead of 5.
```

> パーツごとに `[PART]` を差し替え。腕・脚は片側だけ作る（アプリが左右ミラー）。
> 胸・背中・顔は男女別に2回。

---

## 7. 命名規約（アプリ反映用）

```
arm_{state}.png      leg_{state}.png      abs_{state}.png       // 共通(片側)
chest_{m|f}_{state}.png   back_{m|f}_{state}.png                // 性別
face_{m|f}_{gaunt|normal|round}.png                            // 性別・3状態

state = skinny | normal | musc | buff | fat   （ガリ/標準/ムキ/ムキムキ/デブ）
```

- 透過PNG・64×96基準（拡大版可、アプリ側 `image-rendering: pixelated`）。
- `public/sprites/parts/` に配置 → アプリが「体脂肪＋部位tier」で状態を選び、前面/背面を合成（左右ミラー）。
- 合成・差し替えロジックとユーザーの体型調整UIは、パーツが揃い次第アプリ側に配線する。
