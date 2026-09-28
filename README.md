# Tap Bird

スマホ向けのシンプルなタップゲームです。タップで鳥を羽ばたかせ、土管の間をくぐり抜けてスコアを伸ばしましょう。

**プレイする:** https://acidnyan.github.io/tap-bird/

## 遊び方

- **タップ / クリック** で羽ばたく
- キーボードでは **Space / ↑ / Enter**
- ベストスコアはブラウザ（localStorage）に保存されます

ホーム画面に追加すると全画面の PWA として遊べます。

## 構成

ビルド不要の素の HTML / CSS / JavaScript（Canvas）です。

| ファイル | 内容 |
|---|---|
| `index.html` | エントリーポイント |
| `game.js` | ゲームロジックと描画 |
| `style.css` | レイアウト |
| `manifest.json` / `icon.svg` | PWA 設定とアイコン |

## ローカルで動かす

```sh
npx serve .
```

または `index.html` をブラウザで直接開いてください。

## License

[MIT](./LICENSE)
