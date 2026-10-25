# Arc LuckyPass — Agent Notes

> This file is project memory for Arc Studio and other coding agents.
> Human-readable documentation is in README.md.

---

## Deployed Contracts

| Version | Network | Address | Status |
|---|---|---|---|
| v1 (single-owner, deprecated) | Arc Testnet | `0x6ce25001fa6bf148454eb21edf251d603ba0fa5f` | Superseded |
| v2 (multi-store, **active**) | Arc Testnet | `0x101c391d239a647d590d8493aae1dd5770f4a33a` | Active |

- Deploy tx (v2): `0x36969bf1c1f03d59aa6f7abba7d81e9b69e3aea109e6c7a133333a93a195309c`
- Deployed: 2026-10-23
- Platform Admin (initialOwner): `0x9e9f0C0aaE3D365FAcBa4ffbbf8d58Df792f5345`
- Arc Studio deployer (no contract rights): `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`

**Mainnet: not deployed.**

---

## External Contracts

| Contract | Network | Address |
|---|---|---|
| D20DAO VRF Coordinator | Arc Testnet (5042002) | `0xd20DA0FF9087d053f0291524Eac12abA1ADBd945` |
| D20DAO VRF Coordinator | Arc Mainnet (5042) | `0xd20da057469C45928912d983F45790C41e290571` |
| USDC ERC-20 | Arc Testnet + Mainnet | `0x3600000000000000000000000000000000000000` |

---

## Key Design Decisions

- `createLot` requires `entryCloseAt > 0` (mandatory). `entryOpenAt` is optional (0 = open immediately).
- `fixedDeadlineAt > 0` = absolute payment deadline. Must be >= `entryCloseAt + MIN_PROMOTE_LEAD` (3600s).
- Fixed-deadline lots: initial winner `paymentDeadline = fixedDeadlineAt` directly. Waitlist promotion disabled.
- Relative-deadline lots: `paymentDeadline = block.timestamp + paymentWindow` at `selectWinners` time. Waitlist promotion enabled (permissionless).
- `requestDraw` and `selectWinners` block when `block.timestamp >= fixedDeadlineAt - 3600`.
- `closeLot` accepts both `ACTIVE` and `WORD_RECEIVED` states (VRF-delay recovery).
- VRF fee paid by merchant at `requestDraw` via `msg.value`. No contract treasury (`receive()` removed).
- Store approval tracked by `isApprovedStore` mapping + `StoreApproved`/`StoreRevoked` events.

---

## Contract ABI — createLot (9 args)

```
createLot(
  string name,
  string description,
  uint256 priceUsdc,       // 6-decimal USDC
  uint32 supply,
  uint64 paymentWindow,    // seconds; 0 if fixedDeadlineAt is set
  uint32 maxEntrants,      // max 500
  uint64 entryOpenAt,      // 0 = open immediately
  uint64 entryCloseAt,     // required (> 0)
  uint64 fixedDeadlineAt   // 0 = relative mode
)
```

## getLot return order (12 values)

name, description, priceUsdc, supply, paymentWindow, merchantAddress, state(uint8), ticketsMinted, maxEntrants, entryOpenAt, entryCloseAt, fixedDeadlineAt

---

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28, Foundry, OpenZeppelin 5.1, @d20dao/vrf-sdk 0.6.2
- Chain: Arc Testnet (Chain ID: 5042002) — USDC is the native gas token
- Token: USDC at `0x3600000000000000000000000000000000000000` (6 decimals ERC-20 / 18 decimals native)
- Tests: 69 Foundry unit tests (contracts/test/LuckyPass.t.sol)

## Key Files

| File | Purpose |
|---|---|
| `contracts/LuckyPass.sol` | Main contract |
| `contracts/test/LuckyPass.t.sol` | 69 Foundry unit tests |
| `src/lib/luckypass-abi.ts` | ABI + `LUCKY_PASS_ADDRESS` constant |
| `src/hooks/useLuckyPass.ts` | All wagmi read/write hooks |
| `src/components/OperatorDashboard.tsx` | Store management UI (create lot, draw, winners) |
| `src/components/StoreManager.tsx` | Platform Admin UI (approve/revoke stores) |
| `src/components/DateTimePicker.tsx` | Timezone-safe datetime input (JST/UTC) |
| `src/i18n/translations.ts` | Japanese/English strings |
| `src/App.tsx` | App shell, navigation, permission gates |

## Scripts

```bash
bun run dev               # Vite dev server
bun run contracts:build   # forge build
bun run contracts:test    # forge test
bun run check             # oxlint + tsc --noEmit
```
