# Arc LuckyPass — Implementation Plan

## Summary
Arc LuckyPass is a lottery-based sales platform for limited-edition merchandise and event tickets on Arc Testnet. Participants enter draws for free with a connected wallet; verifiably random winner selection (via external VRF integration) gates USDC purchases, and winners receive non-transferable ERC-5192 soulbound tickets redeemable at venues via QR code with onchain double-use prevention.

## Architecture

- **Blockchain:** Arc Testnet — USDC is the native gas token, giving stable and predictable fees for all ticket purchase transactions; sub-second finality ensures immediate winner confirmation
- **Contract:** Single `LuckyPass.sol` managing multiple lots. Key responsibilities:
  - Lot creation and lifecycle (OPEN → DRAWING → ACTIVE → CLOSED)
  - Free lottery entry registry per lot
  - VRF randomness fulfillment entrypoint (owner-callable, fed by external VRF result)
  - Winner mapping + payment deadline enforcement
  - Atomic USDC `transferFrom` + ERC-5192 SBT mint in one `purchase()` call
  - Onchain redemption flag per token, settable by a designated operator wallet
  - Waitlist promotion when payment deadline expires
- **External VRF dependency:** The contract exposes a `fulfillRandomness(lotId, randomWord)` function callable only by the contract owner. The operator runs the VRF request off-chain (e.g. Gelato VRF or Pyth Entropy), then submits the result in a single owner tx. This is a documented manual step in the operator dashboard — no keeper/automation contract is in scope.
- **Frontend:** React + Tailwind, four views:
  1. Public / Entrant view — browse open lots, enter draws, check winner status, purchase ticket
  2. Winner purchase flow — approve USDC + call `purchase()`, download QR after mint
  3. Operator dashboard — create lots, submit VRF result, promote waitlist, manage operators
  4. Redemption view — venue operator scans QR, submits `redeem(tokenId)` tx
- **Wallet:** ConnectKit (already configured in `src/config.ts`)
- **USDC:** `0x3600000000000000000000000000000000000000` on Arc Testnet (read from `@/onchain-facts`)

## VRF Integration Note

Because Chainlink VRF is not deployed on Arc Testnet, the integration works as a two-step owner-mediated flow:

1. Operator closes entries and calls the VRF service off-chain (Gelato VRF or Pyth Entropy are the practical choices for a hackathon).
2. Operator submits the returned random word to `fulfillRandomness(lotId, randomWord)` on Arc. The contract then computes winners deterministically from that word and the frozen entrant list.

This is verifiable (the random word and entrant snapshot are both onchain) and manipulation-resistant (the entrant list is frozen before the word is submitted). It requires operator trust for the submission step — this tradeoff is documented in the UI.

## Files to Create/Modify

1. `contracts/LuckyPass.sol` — core contract: lot management, entry, VRF fulfillment, winner selection, USDC purchase + ERC-5192 SBT mint, operator-gated redemption, waitlist promotion
2. `src/App.tsx` — root app shell with route/view switching, ConnectKit provider wiring, wallet-gated navigation
3. `src/config.ts` — extend existing wagmi config to include ConnectKit setup (currently uses `injected()` only)
4. `src/components/LotCard.tsx` — displays a single lot: name, item count, deadline, entry/status button
5. `src/components/LotGrid.tsx` — grid of all lots fetched from contract
6. `src/components/EntryButton.tsx` — calls `enterLottery(lotId)`, handles tx states
7. `src/components/PurchaseFlow.tsx` — two-step approve + purchase for winners, shows deadline countdown
8. `src/components/TicketQR.tsx` — generates QR from `tokenId + contractAddress`; links to explorer; displayed post-mint
9. `src/components/OperatorDashboard.tsx` — create lot, submit VRF word, promote waitlist, add/remove operators
10. `src/components/RedemptionScanner.tsx` — displays redeem form (tokenId input + optional camera QR scan), calls `redeem(tokenId)`, shows onchain status
11. `src/hooks/useLuckyPass.ts` — wagmi `useReadContract` / `useWriteContract` hooks for all contract interactions, typed against ABI
12. `src/lib/qr.ts` — thin wrapper around a QR generation library (`qrcode` npm package)
13. `src/lib/luckypass-abi.ts` — exported ABI constant (copied from build artifact post-deploy)

## Build Sequence

1. **Write and deploy `LuckyPass.sol`** — balanced security review + Slither + pre-deploy fork verification, then deploy to Arc Testnet. Contract covers: lot lifecycle, entry, VRF fulfillment, winner selection (N winners + ordered waitlist), atomic USDC payment + ERC-5192 mint, operator-gated redemption, deadline-based waitlist promotion.
2. **Wire ABI and contract address** — copy deployed address + ABI into `src/lib/luckypass-abi.ts`; create `useLuckyPass.ts` hook covering all read and write calls
3. **Public entrant UI** — build `LotCard`, `LotGrid`, `EntryButton`; wire to hooks; show lot state, entry status, winner badge
4. **Winner purchase flow** — build `PurchaseFlow` (approve USDC, purchase, deadline countdown) and `TicketQR` (QR code display post-mint)
5. **Operator dashboard** — build `OperatorDashboard`: create lot form, VRF word submission, waitlist promotion, operator management; access-gated by wallet address check against `owner`/`isOperator`
6. **Redemption view** — build `RedemptionScanner`: tokenId input + camera QR scan, `redeem()` call, onchain status display; access-gated to operator wallets
7. **App shell + navigation** — wire all views into `App.tsx`, add role-based nav (public / winner / operator), install `qrcode` package, finalize Tailwind styling

## Done When

- [ ] `LuckyPass.sol` deploys successfully to Arc Testnet with no unresolved Critical/High findings
- [ ] A wallet can enter an open lot and the entry is recorded onchain
- [ ] Owner can submit a VRF random word; contract selects exactly N winners and builds an ordered waitlist from remaining entrants
- [ ] A winner wallet can approve USDC and call `purchase()` in one flow; SBT mints atomically and USDC transfers to the contract
- [ ] A non-winner or already-purchased wallet cannot call `purchase()` (reverts)
- [ ] `locked(tokenId)` returns `true` and transfer attempts revert (ERC-5192 enforced)
- [ ] A QR code is displayed post-mint encoding `contractAddress:tokenId`
- [ ] An operator wallet can scan/enter the QR and call `redeem(tokenId)`; status flips onchain
- [ ] Attempting to redeem an already-redeemed ticket reverts
- [ ] After payment deadline, `promoteWaitlist(lotId)` promotes the next waitlist entry to winner status
- [ ] Non-operator wallets cannot call `redeem()` or `promoteWaitlist()` (reverts)

## Pre-Build Notes

- **VRF step is manual:** When ready to run a draw, obtain a random word from an off-chain VRF source (Gelato VRF or Pyth Entropy) and submit via the operator dashboard. This is the only non-automated part of the system.
- **Testnet USDC:** Get from https://faucet.circle.com before testing purchases.
- **QR scanning on mobile:** Requires HTTPS — deploy to Hugging Face Spaces or similar for camera access.
- **OpenZeppelin version:** Pinned at 5.1.0 (Paris EVM target). ERC-721 and access control are unaffected.
