# 行動ガチャ

衝動を抑えず、ガチャを通じて計画的な行動に変換するアプリ。

何かしたくなった瞬間にガチャを回し、出てきた「2〜5分で始められる行動」に着手するだけ。
抽選はランダムに見えて、裏側では年・月・週の計画、期限、疲れ、これまでの行動履歴を考慮して中身を調整します。
自由に動いている感覚のまま、引きで見ると必要なことが進んでいる状態を目指します。

設計の詳細は [DESIGN.md](./DESIGN.md) を参照。

## 開発

```bash
npm install
npm run dev     # 開発サーバー
npm test        # 抽選ロジックのテスト
npm run build   # 本番ビルド(PWA)
```

- React 18 + TypeScript + Vite
- 状態管理: zustand(localStorage に永続化)
- PWA 対応(ホーム画面に追加・オフライン動作)

## 構成

```
src/
  domain/      抽選ロジック(engine.ts)・型・プリセット行動
  store/       zustand ストア
  components/  画面(ガチャ / 週 / 月 / 年 / 行動 / 初回設定)
```
