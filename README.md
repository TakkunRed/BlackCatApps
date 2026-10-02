# Black Cat Apps

レトロなガジェットへのオマージュから独自のオリジナルゲームまで、ブラウザだけで遊べるスマホ向け PWA (Progressive Web App) のコレクションです。
ビルド不要の素の HTML / CSS / JavaScript で実装し、GitHub Pages でそのまま公開することを想定しています。

## 収録アプリ

### オリジナル

| アプリ | 概要 |
|---|---|
| [MEGA MERGE](apps/mega-merge/) | 数字ブロックを撃って合体させ2048を目指す、オリジナルのパズル×シューティング(詳細は各READMEを参照) |

### レトロへのオマージュ

| アプリ | 概要 |
|---|---|
| [SNAKE BYTE](apps/snake/) | 古典的なスネークゲームへのオマージュ(詳細は各READMEを参照) |
| [BRICK BLITZ](apps/breakout/) | 1976年の古典的なブロック崩しへのオマージュ(詳細は各READMEを参照) |
| [GALAXY SIEGE](apps/space-invaders/) | 1978年の古典的な固定画面シューティングへのオマージュ(詳細は各READMEを参照) |
| [電卓インベーダー](apps/calculator-invader/) | CASIO「ゲーム電卓 SL-880」へのオマージュ。電卓UIに載せた数字撃墜シューティング(詳細は各READMEを参照) |

今後も `apps/` 配下にアプリを追加していく予定です。

## 構成

```
BlackCatApps/
  index.html        アプリ一覧(ランチャー)ページ
  apps/
    calculator-invader/   各アプリは自己完結したPWAとして実装
      index.html
      manifest.json
      sw.js
      ...
```

各アプリは `apps/<app-name>/` 配下に自己完結する形で配置し、それぞれ独自の `manifest.json` / Service Worker を持たせることで、
ホーム画面に個別のアプリとして追加できるようにしています。

## ローカル確認

```bash
npx --yes serve .
```

ルートの `index.html` からアプリ一覧に、各アプリの `index.html` から個別アプリに遷移できます。

## GitHub Pages への公開

リポジトリの Settings → Pages で公開ブランチ(例: `main`)のルートを指定するだけで、
`https://<user>.github.io/BlackCatApps/` にランチャーページが、
`https://<user>.github.io/BlackCatApps/apps/calculator-invader/` に各アプリが公開されます。

## ライセンス・免責

各アプリの実装(計算ロジック・ゲームロジック・UI)はすべて独自実装のオリジナルコードです。
モチーフにした実機・商品の商標・意匠の権利は各権利者に帰属し、本プロジェクトはそれらの非公式ファンメイド作品です。
