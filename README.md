# Arc LuckyPass 🎟️

**A Verifiable Lottery Platform for Limited-Edition Merchandise and Event Tickets**

Built with [Arc Studio](https://studio.arc.io/) · Deployed on **Arc Mainnet**

[English](#english) | [日本語](#日本語)

## Project Links

| Resource | Link |
|---|---|
| Live Application | [Arc LuckyPass](https://arc-luckypass.vercel.app/) |
| Source Code | [GitHub Repository](https://github.com/nato-san/arc-luckypass) |
| Network | Arc Mainnet — Chain ID `5042` |
| Smart Contract | [Arc Explorer](https://explorer.arc.io/address/0x4903a272dde8eA12E264fdEecfA0591764b3dABB) |
| Contract Address | `0x4903a272dde8eA12E264fdEecfA0591764b3dABB` |

---

## English

### Overview

**Arc LuckyPass** is an onchain lottery sales platform for limited-edition merchandise, collectibles, and event tickets.

Merchants create lottery campaigns, participants enter during the application period, and winners are selected through verifiable randomness. Selected participants purchase their items using USDC on Arc Mainnet and receive non-transferable tickets that can be redeemed through wallet signatures and QR codes.

The application and smart contract were developed using **Arc Studio** and deployed on **Arc Mainnet**.

### Why Arc LuckyPass?

Popular products and event tickets can sell out quickly, creating challenges for ordinary customers and opportunities for automated purchasing and resale.

Arc LuckyPass introduces a lottery-based distribution model with:

- **Verifiable winner selection** — D20DAO VRF provides publicly verifiable randomness.
- **USDC settlement** — Successful purchases are paid directly to merchant wallets.
- **Non-transferable tickets** — ERC-5192 Soulbound Tokens help discourage ticket resale.
- **Wallet-based redemption** — EIP-712 signatures and QR codes support ticket verification.
- **Merchant management** — Approved merchants can independently create and manage lottery campaigns.

### How It Works

**For Customers**

1. Connect a wallet to Arc Mainnet.
2. Browse available lottery lots and enter during the entry period.
3. Wait for the D20DAO VRF draw.
4. If selected, complete the USDC purchase before the payment deadline.
5. Receive a non-transferable SBT ticket.
6. Sign a message with the wallet to generate a redemption QR code.
7. Present the QR code for verification and redemption at the venue.

**For Merchants**

1. Obtain merchant approval from the Platform Admin.
2. Open the Operator Dashboard and create a lottery lot.
3. Configure product details, price, supply, entry period, and payment deadline.
4. Close entries and request a verifiable random draw.
5. Allow selected winners to complete their USDC purchases.
6. Register authorized venue staff for ticket redemption.
7. Verify and redeem tickets while preventing duplicate redemption.

### Key Features

| Feature | Description |
|---|---|
| Verifiable Random Draw | D20DAO VRF for onchain randomness |
| USDC Payments | Direct settlement to merchant wallets |
| Soulbound Tickets | ERC-5192 non-transferable tickets |
| QR Redemption | EIP-712 wallet signatures for ticket verification |
| Lottery Scheduling | Configurable entry periods and deadlines |
| Payment Deadlines | Relative or fixed-date purchase deadlines |
| Waitlist Promotion | Replacement of expired winning slots for supported lottery configurations |
| Multi-Store Management | Admin-approved merchants manage independent lots |
| Product Images | Onchain description metadata supports image URLs for newly created lots |
| Multilingual Interface | English and Japanese |
| Timezone Support | JST and UTC display options |

### Roadmap

Arc LuckyPass aims to evolve into a flexible lottery-based commerce platform for limited-edition products, collectibles, and event experiences.

**Phase 1 — Arc Mainnet MVP**

- Lottery creation and entry management
- Verifiable winner selection using D20DAO VRF
- USDC payments on Arc Mainnet
- ERC-5192 non-transferable tickets
- EIP-712 signature-based QR redemption
- Merchant management and multilingual interface

**Phase 2 — Identity Verification & Anti-Resale Protection**

- Optional identity verification for high-demand products and events
- Link verified participant information to wallet ownership
- Strengthen protections against duplicate entries and multiple-wallet abuse
- Explore short-lived, dynamic QR codes to reduce screenshot-based misuse
- Improve on-site identity and ticket-holder verification
- Keep personal information offchain with privacy-conscious data handling

**Phase 3 — Expanded Lottery Modes**

*Live Mode*

A lottery-based ticketing mode for live performances, livestreams, and limited-time events.

*Limited Edition Mode*

A specialized lottery mode for limited-edition merchandise and collectibles, with configurable eligibility requirements and purchase restrictions.

**Phase 4 — Merchant Tools & Ecosystem Expansion**

- Merchant onboarding guides and operational manuals
- Improved product pages and image management
- Sales analytics and transaction history
- More flexible campaign settings
- Transaction-fee and performance measurements on Arc
- Integrations for event organizers, creators, and merchandise brands

*The roadmap describes planned development directions. Future features are not yet available in the live application.*

### Technical Architecture

| Layer | Technology |
|---|---|
| Development Environment | Arc Studio |
| Blockchain | Arc Mainnet — Chain ID `5042` |
| Smart Contract | Solidity 0.8.28, Foundry, OpenZeppelin 5.1 |
| Randomness | D20DAO VRF SDK |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Wallet Integration | wagmi v2, viem v2, ConnectKit |
| Payments | USDC on Arc |
| Ticket Standard | ERC-5192 |
| Redemption Authentication | EIP-712 |
| Hosting | Vercel |

### Arc Mainnet Deployment

**LuckyPass Contract**

`0x4903a272dde8eA12E264fdEecfA0591764b3dABB`

- Network: Arc Mainnet
- Chain ID: `5042`
- Deployment Block: `28664042`
- [Contract on Arc Explorer](https://explorer.arc.io/address/0x4903a272dde8eA12E264fdEecfA0591764b3dABB)
- [Deployment Transaction](https://explorer.arc.io/tx/0x2c2761d9773ed8ceb7c3118daaec6bc3247a6173e24bdf140bd9337c8ec49691)

The application supports real USDC purchases on Arc Mainnet. Purchase transactions can be independently verified using Arc Explorer.

### Development with Arc Studio

Arc LuckyPass was built using [Arc Studio](https://studio.arc.io/), including smart contract development, frontend implementation, wallet integration, and testing.

Arc Testnet was used during earlier development and testing. The live application is deployed on Arc Mainnet.

### Local Setup

**Prerequisites:** [Bun](https://bun.sh/) and [Foundry](https://book.getfoundry.sh/).

```bash
git clone https://github.com/nato-san/arc-luckypass.git
cd arc-luckypass
bun install
cp .env.example .env
bun run dev
```

Configure wallet connection and network environment variables as required.

### Environment Variables

| Variable | Description |
|---|---|
| `VITE_CHAIN` | Set to `mainnet` for Arc Mainnet |
| `VITE_LUCKY_PASS_ADDRESS_MAINNET` | Mainnet LuckyPass contract address |
| `VITE_DEPLOY_BLOCK_MAINNET` | Deployment block used for event scanning |
| `VITE_WALLETCONNECT_PROJECT_ID` | Optional WalletConnect/Reown project ID |

Example Mainnet configuration:

```env
VITE_CHAIN=mainnet
VITE_LUCKY_PASS_ADDRESS_MAINNET=0x4903a272dde8eA12E264fdEecfA0591764b3dABB
VITE_DEPLOY_BLOCK_MAINNET=28664042
```

### Smart Contract Testing

```bash
bun run contracts:build
bun run contracts:test
```

The Foundry test suite has passed **69 tests** covering core lottery and ticket operations.

### License

MIT

---

## 日本語

### サービス概要

**Arc LuckyPass** は、限定グッズ・コレクターズアイテム・イベントチケットを抽選方式で販売する、Arcブロックチェーン上のプラットフォームです。

店舗が抽選商品を作成し、参加者は応募期間中に抽選へ参加します。当選者はArc Mainnet上のUSDCで購入し、譲渡できないSBTチケットを受け取ります。会場ではウォレット署名とQRコードを使って引換を行えます。

アプリとスマートコントラクトは **Arc Studio** で開発し、**Arc Mainnet** にデプロイしています。

### Arc LuckyPassが目指すもの

人気商品やイベントチケットの販売では、一般の購入者が不利になったり、自動購入や転売が問題になったりします。

Arc LuckyPassでは、次の仕組みを組み合わせています。

- **検証可能な当選者選出：** D20DAO VRFによる検証可能なランダム抽選
- **USDC決済：** 購入代金を店舗ウォレットへ直接送金
- **譲渡不可チケット：** ERC-5192準拠のSBTで転売を抑制
- **ウォレットによる引換：** EIP-712署名とQRコードでチケットを検証
- **店舗管理：** 承認された店舗が独立して抽選を作成・管理

### お客さんの利用方法

1. ウォレットをArc Mainnetに接続する。
2. 抽選商品を確認し、応募期間中に参加する。
3. D20DAO VRFによる抽選結果を待つ。
4. 当選した場合、支払い期限内にUSDCで購入する。
5. 譲渡できないSBTチケットを受け取る。
6. ウォレットでメッセージに署名し、引換用QRコードを生成する。
7. 会場でQRコードを提示し、スタッフによる確認・引換を受ける。

### 店舗の利用方法

1. Platform Adminから店舗ウォレットの承認を受ける。
2. 運営管理画面で抽選商品を作成する。
3. 商品情報、価格、定員、応募期間、支払い期限を設定する。
4. 応募を締め切り、VRF抽選を実行する。
5. 当選者のUSDC決済を受け付ける。
6. 会場スタッフのウォレットを登録する。
7. QRコードを検証してチケットを引き換え、二重引換を防止する。

### 主要機能

| 機能 | 内容 |
|---|---|
| VRF抽選 | D20DAO VRFによる検証可能なランダム抽選 |
| USDC決済 | 購入代金を店舗ウォレットへ直接送金 |
| SBTチケット | ERC-5192準拠の譲渡不可チケット |
| QR引換 | EIP-712署名による引換確認 |
| 応募期間 | 開始・終了日時の設定 |
| 支払い期限 | 相対期限・固定日時に対応 |
| 補欠繰り上げ | 対応する抽選方式で期限切れ当選枠を繰り上げ |
| マルチストア | 管理者が店舗を承認し、店舗ごとに抽選を管理 |
| 商品画像 | 新規ロットの商品説明メタデータに画像URLを保存 |
| 多言語対応 | 英語・日本語 |
| タイムゾーン | JST・UTCの表示切り替え |

### 今後の開発計画

Arc LuckyPassは、限定商品・コレクターズアイテム・イベント向けの柔軟な抽選販売プラットフォームへ発展することを目指しています。

**Phase 1 — Arc Mainnet MVP**

- 抽選商品の作成と応募管理
- D20DAO VRFによる検証可能な抽選
- Arc MainnetでのUSDC決済
- ERC-5192準拠の譲渡不可チケット
- EIP-712署名を利用したQR引換
- 店舗管理と多言語対応

**Phase 2 — 本人確認と転売対策の強化**

- 人気商品・イベント向けの任意の本人確認機能
- ウォレットと確認済み本人情報の紐付け
- 複数ウォレットを利用した重複応募への対策
- QRコードのスクリーンショット悪用を抑える短時間有効の動的QR
- 会場での本人確認とチケット所有者確認の強化
- 個人情報をオンチェーンに直接保存しないプライバシー配慮

**Phase 3 — 抽選モードの拡張**

*ライブモード*

ライブイベントや配信、期間限定イベントなどの入場券に対応した抽選販売モード。

*限定品モード*

限定グッズやコレクターズアイテムに特化し、応募資格や購入制限を柔軟に設定できる抽選販売モード。

**Phase 4 — 店舗向け機能とエコシステムの拡張**

- 店舗向け操作マニュアル・導入ガイド
- 商品ページと画像管理の改善
- 売上分析と取引履歴
- キャンペーン設定の拡張
- Arc上の手数料・処理時間の計測
- イベント主催者・クリエイター・ブランドとの連携

*このロードマップは将来の開発構想です。すべての機能が現在利用できることを意味するものではありません。*

### 技術構成

| 項目 | 技術 |
|---|---|
| 開発環境 | Arc Studio |
| ブロックチェーン | Arc Mainnet（Chain ID: 5042） |
| スマートコントラクト | Solidity 0.8.28 / Foundry / OpenZeppelin 5.1 |
| 抽選 | D20DAO VRF SDK |
| フロントエンド | React 18 / TypeScript / Vite / Tailwind CSS |
| ウォレット | wagmi v2 / viem v2 / ConnectKit |
| 決済 | Arc上のUSDC |
| チケット | ERC-5192 |
| 引換署名 | EIP-712 |
| ホスティング | Vercel |

### Arc Mainnet デプロイ情報

**LuckyPassコントラクト**

`0x4903a272dde8eA12E264fdEecfA0591764b3dABB`

- ネットワーク：Arc Mainnet
- Chain ID：`5042`
- デプロイブロック：`28664042`
- [Arc Explorerでコントラクトを見る](https://explorer.arc.io/address/0x4903a272dde8eA12E264fdEecfA0591764b3dABB)
- [デプロイトランザクション](https://explorer.arc.io/tx/0x2c2761d9773ed8ceb7c3118daaec6bc3247a6173e24bdf140bd9337c8ec49691)

本番アプリではArc Mainnet上のUSDC購入に対応しています。購入履歴はArc Explorerで第三者も確認できます。

### Arc Studioでの開発

本プロジェクトは [Arc Studio](https://studio.arc.io/) を使用して、コントラクト、フロントエンド、ウォレット連携、テストなどを開発しました。

開発初期にはArc Testnetを使用し、現在の公開アプリはArc Mainnetで稼働しています。

### ローカル環境での起動

**必要なもの：** Bun、Foundry

```bash
git clone https://github.com/nato-san/arc-luckypass.git
cd arc-luckypass
bun install
cp .env.example .env
bun run dev
```

必要に応じてウォレット接続やチェーン設定の環境変数を設定してください。

### 環境変数

| 変数 | 内容 |
|---|---|
| `VITE_CHAIN` | `mainnet` でArc Mainnetを使用 |
| `VITE_LUCKY_PASS_ADDRESS_MAINNET` | Mainnetコントラクトアドレス |
| `VITE_DEPLOY_BLOCK_MAINNET` | イベント取得開始ブロック |
| `VITE_WALLETCONNECT_PROJECT_ID` | 任意のWalletConnect/Reown Project ID |

### コントラクトのビルドとテスト

```bash
bun run contracts:build
bun run contracts:test
```

Foundryのテストは**69件PASS**しています。

### ライセンス

MIT
