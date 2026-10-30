# Arc LuckyPass

**日本語 | [English](#english)**

Built with [Arc Studio](https://studio.arc.io)

---

## 日本語

### サービス概要

Arc LuckyPass は、Arc ブロックチェーン上で動作する、限定商品・イベントチケットの抽選販売プラットフォームです。店舗が抽選ロットを作成し、お客さんが応募・購入・引換まで一貫してウォレットで操作できます。

- **検証可能な公平な抽選** — D20DAO VRF（Verifiable Random Function）による改ざん不可能な当選者選出
- **USDC 直接決済** — 購入代金はコントラクトを経由せず、購入と同時に店舗ウォレットへ直接送金
- **SBT チケット** — ERC-5192 ソウルバウンドトークンとして発行。転送・転売不可
- **EIP-712 引換** — 会場スタッフがお客さんのウォレット署名を検証してチケットを引換
- **マルチストア対応** — Platform Admin が店舗を承認。各店舗が独立してロットを管理

### お客さんの利用方法

1. ウォレット（MetaMask など）を接続して Arc Testnet に切り替える
2. 「抽選に参加」タブでロット一覧を確認し、応募期間中に応募する
3. 抽選後に当選通知が表示されたら、USDC を承認して購入する
4. 購入完了後に SBT チケットと QR コードが発行される
5. 会場でウォレット署名を送信し、スタッフが引換を確認する

### 店舗（マーチャント）の利用方法

1. Platform Admin にウォレットアドレスを伝えて承認を受ける
2. 「運営管理」タブからロットを作成（名前、価格、定員、応募期間、支払い期限を設定）
3. 応募締切後に抽選を実行（VRF 抽選費用は USDC で自動計算）
4. 抽選結果確定後、当選者が支払い期限内に購入するまで待つ
5. 会場スタッフのウォレットアドレスを登録し、引換を委任する

### 主要機能

| 機能 | 詳細 |
|---|---|
| VRF 抽選 | D20DAO VRF でオンチェーン検証可能なランダム性を保証 |
| 応募期間設定 | 応募開始日時（任意）・応募締切日時（必須）をカレンダーで指定 |
| 支払い期限 | 「当選後○時間」の相対指定、または「指定日時まで」の絶対日時指定 |
| タイムゾーン | JST（日本時間）と UTC を切り替えて日時を入力・表示 |
| 補欠繰り上げ | 相対期限方式では期限切れスロットに補欠を繰り上げ（誰でも実行可） |
| 店舗管理 | Platform Admin がイベントログから承認済み店舗一覧を取得・管理 |
| 多言語対応 | 日本語・英語を切り替え（ブラウザ設定で自動検出、localStorage で保存） |

### 技術構成

| レイヤー | 使用技術 |
|---|---|
| コントラクト | Solidity 0.8.28 / Foundry / OpenZeppelin 5.1 / @d20dao/vrf-sdk |
| フロントエンド | React 18 / Vite / TypeScript / Tailwind CSS |
| Web3 | wagmi v2 / viem v2 / ConnectKit |
| チェーン | Arc Testnet (Chain ID: 5042002) / Arc Mainnet (Chain ID: 5042) / USDC がネイティブガストークン |
| 開発環境 | Arc Studio（Built with Arc Studio） |

### デプロイ済みコントラクト（Arc Testnet）

| バージョン | アドレス | エクスプローラー |
|---|---|---|
| v3 — 応募期間・絶対日時締切（現行） | `0xab7678c528f1d517d642c13e3fd97124a743abe8` | [View](https://explorer.testnet.arc.io/address/0xab7678c528f1d517d642c13e3fd97124a743abe8) |
| v2 — マルチストア（非推奨） | `0x101c391d239a647d590d8493aae1dd5770f4a33a` | [View](https://explorer.testnet.arc.io/address/0x101c391d239a647d590d8493aae1dd5770f4a33a) |

> Mainnet コントラクトは別途デプロイ後にアドレスをここに追加します。

### セットアップ手順

**前提条件:** [Bun](https://bun.sh) と [Foundry](https://book.getfoundry.sh) がインストール済みであること。

```bash
# 1. リポジトリをクローン
git clone https://github.com/nato-san/arc-luckypass.git
cd arc-luckypass

# 2. 依存関係をインストール
bun install

# 3. 環境変数を設定
cp .env.example .env
# .env を編集して VITE_WALLETCONNECT_PROJECT_ID を設定

# 4. 開発サーバーを起動
bun run dev
```

### コントラクトのビルドとテスト

```bash
# コンパイル
bun run contracts:build   # forge build

# テスト（69テスト）
bun run contracts:test    # forge test

# 型チェック + lint
bun run check
```

### GitHub への更新手順

```bash
# 変更をコミット
git add <変更ファイル>
git commit -m "変更内容の説明"

# Push（ターミナルで Fine-Grained Token を使って認証）
git push origin main
# Username: nato-san
# Password: <Fine-Grained Token（arc-luckypass リポジトリ限定・Contents: Read & Write）>
```

**注意:** `.env`・`traces.jsonl`・`console.jsonl`・`arc-studio-plans/`・`docs/` は `.gitignore` で除外済みです。`git add .` を使う場合も自動的にスキップされます。

### Arc Studio での開発

このプロジェクトは [Arc Studio](https://studio.arc.io) で開発されました。Arc Studio はウォレット接続、コントラクトの作成・デプロイ・テスト、フロントエンドの構築をチャット形式で行える開発環境です。

Arc Testnet への再デプロイは Arc Studio から実行できます。プロジェクトを開いて「`contracts/LuckyPass.sol` を Arc Testnet にデプロイしてください」と伝えるだけで対応します。

---

<a id="english"></a>

## English

### Overview

Arc LuckyPass is a lottery-based platform for limited-edition merchandise and event tickets, running on the Arc blockchain. Stores create lottery lots; customers apply, purchase, and redeem tickets entirely through their wallets.

- **Provably fair draws** — D20DAO VRF ensures tamper-proof winner selection
- **Direct USDC settlement** — Purchase payments go directly to the merchant wallet; no contract treasury
- **Soulbound tickets** — ERC-5192 non-transferable tokens; no resale
- **EIP-712 redemption** — Venue staff verify the ticket holder's wallet signature on-site
- **Multi-store** — Platform Admin approves stores; each store manages its own lots independently

### How it works — Customers

1. Connect a wallet (MetaMask etc.) and switch to Arc Testnet
2. Browse lots in the **Enter Lottery** tab and apply during the entry window
3. After the draw, approved winners approve USDC and purchase
4. An SBT ticket with a QR code is minted on purchase
5. At the venue, sign a challenge with your wallet; staff confirm redemption

### How it works — Stores (Merchants)

1. Submit your wallet address to the Platform Admin for approval
2. Create a lot from the **Operator Dashboard** (name, price, supply, entry window, payment deadline)
3. After entries close, trigger the VRF draw (fee auto-calculated in USDC)
4. Wait for winners to purchase within the deadline
5. Register venue staff wallets to delegate ticket redemption

### Key Features

| Feature | Details |
|---|---|
| VRF draw | On-chain verifiable randomness via D20DAO VRF |
| Entry window | Optional open time + required close time, set by calendar |
| Payment deadline | Relative ("N hours after draw") or absolute datetime |
| Timezone | JST ↔ UTC toggle for all datetime inputs and display |
| Waitlist promotion | For relative-deadline lots, expired winner slots are filled from the waitlist (permissionless) |
| Store management | Platform Admin views approved stores from on-chain event logs |
| i18n | Japanese / English toggle with browser auto-detect |

### Tech Stack

| Layer | Technology |
|---|---|
| Contract | Solidity 0.8.28 / Foundry / OpenZeppelin 5.1 / @d20dao/vrf-sdk |
| Frontend | React 18 / Vite / TypeScript / Tailwind CSS |
| Web3 | wagmi v2 / viem v2 / ConnectKit |
| Chain | Arc Testnet (Chain ID: 5042002) / Arc Mainnet (Chain ID: 5042) / USDC as native gas token |
| Development | Arc Studio |

### Deployed Contracts (Arc Testnet)

| Version | Address | Explorer |
|---|---|---|
| v3 — entry window + fixed deadline (current) | `0xab7678c528f1d517d642c13e3fd97124a743abe8` | [View](https://explorer.testnet.arc.io/address/0xab7678c528f1d517d642c13e3fd97124a743abe8) |
| v2 — multi-store (deprecated) | `0x101c391d239a647d590d8493aae1dd5770f4a33a` | [View](https://explorer.testnet.arc.io/address/0x101c391d239a647d590d8493aae1dd5770f4a33a) |

> Mainnet contract address will be added here after deployment.

### Setup

**Prerequisites:** [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh) installed.

```bash
# 1. Clone
git clone https://github.com/nato-san/arc-luckypass.git
cd arc-luckypass

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env and set VITE_WALLETCONNECT_PROJECT_ID

# 4. Start dev server
bun run dev
```

### Contract Build & Test

```bash
# Compile
bun run contracts:build   # forge build

# Run tests (69 tests)
bun run contracts:test    # forge test

# Lint + typecheck
bun run check
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_WALLETCONNECT_PROJECT_ID` | Optional | Reown/WalletConnect Project ID. Without it, only injected wallets work. Get one free at [cloud.reown.com](https://cloud.reown.com). |
| `VITE_CHAIN` | Optional | Set to `mainnet` to target Arc Mainnet. Omit or leave blank for Testnet (default). |
| `VITE_LUCKY_PASS_ADDRESS_MAINNET` | Required for Mainnet | Address of the LuckyPass contract deployed on Arc Mainnet. |
| `VITE_DEPLOY_BLOCK_MAINNET` | Recommended for Mainnet | Deploy block number — used as the getLogs lower bound to speed up event scans. |

### Pushing updates to GitHub

```bash
# Stage and commit changes
git add <changed files>
git commit -m "describe your change"

# Push (authenticate in the terminal with a Fine-Grained Token)
git push origin main
# Username: nato-san
# Password: <Fine-Grained Token — arc-luckypass repo only, Contents: Read & Write>
```

**Note:** `.env`, `traces.jsonl`, `console.jsonl`, `arc-studio-plans/`, and `docs/` are excluded by `.gitignore` and will never be staged by `git add .`.

### Developing with Arc Studio

This project was built with [Arc Studio](https://studio.arc.io). Arc Studio is a conversational development environment for onchain apps — it handles wallet integration, smart contract writing, security review, testing, and deployment.

To re-deploy to Arc Testnet from Arc Studio, open the project and ask Arc Studio to deploy `contracts/LuckyPass.sol` to Arc Testnet with your wallet address as `initialOwner`.

### License

MIT
