# 🚀 light-TODO

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> タスク管理ツール自体の作成にかかる手間を削減

サイトはこちら https://light-todo-24f87.web.app/

[スクリーンショット](/media/image.png)

## 📖 概要

このプロジェクトはタスク管理をできる限り楽にするために開発しました。
タスク管理ツールで管理することに時間を取られて、実際にタスクに割く時間が減ってしまうという課題を、入力を直感的に、情報量を減らすというアプローチで解決しています。

### なぜ作ったのか（モチベーション）

- 既存のタスク管理ツールには入力する情報が多いという課題があった
- メモ感覚でタスクを管理するツールが存在しなかった

## ✨ 主な機能

- 1 行でタスクを入力するだけでカードを追加
- `今日` / `明日` / `4/2` / `4月2日` などから日付を自動判定
- タスクを日付ごとに整理して表示
- Firebase Authentication で Google ログインと匿名ログインに対応
- Firestore へ同期して複数端末で同じデータを共有
- ダークテーマ対応とテーマ切り替え
- モバイル・PC 両対応のレスポンシブ UI
- ドラッグ操作でタスクを移動（セクション間移動）

## 🛠 技術スタック

| カテゴリ | 技術 |
|:--|:--|
| フロントエンド | React 19 |
| バンドラー | Vite 8 |
| 認証 | Firebase Authentication |
| データベース | Firebase Firestore |
| スタイリング | CSS / レスポンシブレイアウト |
| リント | ESLint |

## 🔧 プロジェクト構成

- `src/App.jsx` - メイン UI、タスク操作、Firebase 認証・Firestore 同期
- `src/firebase.js` - Firebase 初期化と認証プロバイダー設定
- `src/App.css` - 全体スタイルとレスポンシブ / ダークテーマ対応
- `package.json` - 依存関係とビルドスクリプト
- `.gitignore` - ビルド成果物 / 環境情報の除外設定

## 🚀 はじめ方

### 前提条件

- Node.js 20.x 以上
- npm

### セットアップ

```bash
git clone https://github.com/yourname/project.git
cd zatu-todo本体
npm install
npm run dev
```

開発サーバーが立ち上がったら、`http://localhost:5173` にアクセスしてください。

### 本番ビルド

```bash
npm run build
npm run preview
```

### 静的チェック

```bash
npm run lint
```

## 🔐 Firebase の注意

Firebase のプロジェクト設定は `src/firebase.js` に記述されています。
公開リポジトリに機密情報を残さない場合は、`.env` などに切り出して管理してください。

## 📝 ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。
