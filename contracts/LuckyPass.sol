// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// ─────────────────────────────────────────────────────────────────────────────
// Arc LuckyPass
// Lottery-based limited-edition merchandise / event ticket platform on Arc.
//
// Features:
//   • Free wallet-based lottery entry per lot
//   • D20DAO VRF for verifiable winner selection (no owner-submitted words)
//   • Atomic USDC payment → merchant + ERC-5192 SBT mint
//   • EIP-712 challenge-response redemption with nonce replay prevention
//   • Per-lot merchant address and per-lot venue operator ACL
//   • Permissionless, time-locked waitlist promotion
//   • VRF refund hook enables re-draw when keeper times out
// ─────────────────────────────────────────────────────────────────────────────

import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ERC-5192 interface (Soulbound — not in OZ 5.1.0, implemented inline)
interface IERC5192 {
    event Locked(uint256 tokenId);
    function locked(uint256 tokenId) external view returns (bool);
}

contract LuckyPass is D20VRFConsumer, ERC721, Ownable, IERC5192 {
    using ECDSA for bytes32;

    // ─── Constants ───────────────────────────────────────────────────────────

    /// @dev EIP-712 typehash for redemption challenge
    bytes32 private constant REDEMPTION_TYPEHASH = keccak256(
        "RedemptionChallenge(uint256 tokenId,address contractAddress,uint256 chainId,uint256 nonce,uint256 timestamp)"
    );

    /// @dev EIP-712 domain typehash for redemption challenge signatures
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    /// @dev Maximum seconds a signed redemption challenge remains valid
    uint256 private constant REDEMPTION_EXPIRY = 300; // 5 minutes

    /// @dev Callback gas forwarded to _fulfillRandomness (stores one slot + event)
    uint32 private constant CALLBACK_GAS = 120_000;

    /// @dev Minimum seconds a promoted waitlist winner must have to pay (fixed-deadline lots only)
    uint64 private constant MIN_PROMOTE_LEAD = 3600; // 1 hour

    /// @dev Hard upper bound on entrants per lot.
    ///      Sized so worst-case selectWinners (O(n) Fisher-Yates) stays well within
    ///      Arc's block gas limit. 500 entrants ≈ 1.5 M gas; Arc block limit is 30 M.
    uint32 public constant MAX_ENTRANTS = 500;

    // ─── Lot state machine ────────────────────────────────────────────────────

    enum LotState {
        OPEN,           // Entries accepted
        DRAWING,        // VRF request in flight; entries frozen
        WORD_RECEIVED,  // VRF word stored; selectWinners() callable
        ACTIVE,         // Winners set; purchases open within deadlines
        CLOSED          // No more purchases or promotions
    }

    struct Lot {
        string  name;
        string  description;
        uint256 priceUsdc;       // 6-decimal USDC
        uint32  supply;          // Total tickets available (= number of winners drawn)
        uint64  paymentWindow;   // Seconds a winner has to pay after selection
        uint32  maxEntrants;     // Maximum entrants allowed for bounded winner selection gas
        address merchantAddress; // Receives USDC directly on purchase
        LotState state;
        uint256 vrfRequestId;    // Non-zero while a VRF request is in flight
        bytes32 vrfWord;         // Stored after callback
        uint32  ticketsMinted;   // Increments on each successful purchase
        uint64 entryOpenAt;      // Unix timestamp: 0 = open immediately at lot creation
        uint64 entryCloseAt;     // Unix timestamp: REQUIRED (> 0 enforced in createLot)
        uint64 fixedDeadlineAt;  // Unix timestamp: 0 = use paymentWindow (relative); >0 = absolute payment deadline
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @dev USDC ERC-20 on Arc (same address mainnet + testnet)
    IERC20 public immutable usdc;

    uint256 public lotCount;
    mapping(uint256 => Lot) public lots;

    /// @dev Wallets approved by the platform admin to create lots
    mapping(address => bool) public isApprovedStore;

    /// @dev Ordered entrant list per lot (frozen at DRAWING transition)
    mapping(uint256 => address[]) private _entrants;
    /// @dev Prevents duplicate entries
    mapping(uint256 => mapping(address => bool)) public hasEntered;

    /// @dev Winners per lot: winnerSlot (0-indexed) → winner address
    mapping(uint256 => mapping(uint32 => address)) public lotWinner;
    /// @dev Payment deadline per (lot, winnerSlot)
    mapping(uint256 => mapping(uint32 => uint64)) public paymentDeadline;
    /// @dev Whether a winner slot has been paid
    mapping(uint256 => mapping(uint32 => bool)) public slotPaid;
    /// @dev Winner address → winnerSlot for a lot (for purchase lookup)
    mapping(uint256 => mapping(address => uint32)) private _winnerSlot;
    /// @dev Whether an address is in the winner set for a lot
    mapping(uint256 => mapping(address => bool)) public isWinner;

    /// @dev Ordered waitlist per lot (filled by selectWinners)
    mapping(uint256 => address[]) private _waitlist;
    /// @dev Next waitlist index to promote per lot
    mapping(uint256 => uint32) public waitlistHead;

    /// @dev Tracks actual number of winner slots initialized per lot
    mapping(uint256 => uint32) private _winnerCount;

    /// @dev tokenId → lotId
    mapping(uint256 => uint256) public tokenLot;
    /// @dev tokenId → winnerSlot
    mapping(uint256 => uint32) public tokenSlot;

    /// @dev Redemption nonce per tokenId (increments on each successful redeem)
    mapping(uint256 => uint256) public redemptionNonce;
    /// @dev Whether a token has been redeemed
    mapping(uint256 => bool) public isRedeemed;
    /// @dev Purchase tx data per tokenId for the operator redemption display
    mapping(uint256 => bytes32) public purchaseTxHash;
    mapping(uint256 => uint256) public purchaseAmount;

    /// @dev Per-lot venue operators (lot => address => authorized)
    mapping(uint256 => mapping(address => bool)) public isVenueOperator;

    /// @dev VRF requestId → lotId (to route callback correctly)
    mapping(uint256 => uint256) private _requestToLot;

    uint256 private _nextTokenId = 1;

    // ─── Events ───────────────────────────────────────────────────────────────

    event LotCreated(uint256 indexed lotId, string name, uint256 priceUsdc, uint32 supply, address merchant);
    event Entered(uint256 indexed lotId, address indexed entrant);
    event DrawRequested(uint256 indexed lotId, uint256 vrfRequestId);
    event WordReceived(uint256 indexed lotId, uint256 indexed vrfRequestId);
    event WinnersSelected(uint256 indexed lotId, uint32 winnerCount, uint32 waitlistCount);
    event Purchased(uint256 indexed lotId, uint256 indexed tokenId, address indexed buyer, uint256 amount);
    event Redeemed(uint256 indexed tokenId, address indexed operator, uint256 timestamp);
    event WaitlistPromoted(uint256 indexed lotId, uint32 winnerSlot, address promoted);
    event DrawExpired(uint256 indexed lotId, uint256 vrfRequestId);
    event VenueOperatorSet(uint256 indexed lotId, address indexed operator, bool authorized);
    event LotClosed(uint256 indexed lotId);
    event StoreApproved(address indexed store);
    event StoreRevoked(address indexed store);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error LotNotOpen();
    error LotNotActive();
    error LotNotInDrawing();
    error LotNotWordReceived();
    error AlreadyEntered();
    error NotWinner();
    error DeadlineExpired();
    error AlreadyPurchased();
    error DrawAlreadyInFlight();
    error WinnersAlreadySelected();
    error NotVenueOperator();
    error AlreadyRedeemed();
    error InvalidSignature();
    error ChallengeExpired();
    error NonceMismatch();
    error DeadlineNotReached();
    error NoWaitlistRemaining();
    error InsufficientVrfFee();
    error ZeroAddress();
    error LotDoesNotExist();
    error InvalidWinnerSlot();
    error EntrantLimitReached();
    error UnexpectedVrfCallback();
    error NotApprovedStore();
    error NotLotMerchant();
    error EntryNotYetOpen();
    error EntryAlreadyClosed();
    error EntryNotClosed();
    error DeadlineBeforeClose();
    error DeadlineAlreadyPassed();
    error PromotionAfterDeadline();
    error PromotionTooLate();
    error UsdcTransferFailed();
    error Soulbound();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier lotExists(uint256 lotId) {
        if (lotId == 0 || lotId > lotCount) revert LotDoesNotExist();
        _;
    }

    modifier onlyLotMerchant(uint256 lotId) {
        if (msg.sender != lots[lotId].merchantAddress) revert NotLotMerchant();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address vrfCoordinator,
        address usdcAddress,
        address initialOwner
    )
        D20VRFConsumer(vrfCoordinator)
        ERC721("LuckyPass", "LPASS")
        Ownable(initialOwner)
    {
        if (usdcAddress == address(0)) revert ZeroAddress();
        usdc = IERC20(usdcAddress);

    }

    // ─── Lot management ───────────────────────────────────────────────────────

    /// @notice Tag an address as an approved store (legacy allowlist, not enforced by createLot).
    /// @dev createLot is permissionless; this mapping is preserved for off-chain UIs and future use.
    function approveStore(address store) external onlyOwner {
        if (store == address(0)) revert ZeroAddress();
        isApprovedStore[store] = true;
        emit StoreApproved(store);
    }

    /// @notice Remove an address from the legacy approved-store list.
    /// @dev Does NOT prevent the address from creating lots; createLot is permissionless.
    function revokeStore(address store) external onlyOwner {
        isApprovedStore[store] = false;
        emit StoreRevoked(store);
    }

    /// @notice Create a new lot. Anyone may call; msg.sender becomes the lot's merchantAddress.
    /// @dev priceUsdc is 6-decimal USDC.
    function createLot(
        string calldata name,
        string calldata description,
        uint256 priceUsdc,
        uint32 supply,
        uint64 paymentWindow,
        uint32 maxEntrants,
        uint64 entryOpenAt,
        uint64 entryCloseAt,
        uint64 fixedDeadlineAt
    ) external returns (uint256 lotId) {
        // No allowlist check — createLot is permissionless.
        if (supply == 0) revert LotNotOpen();
        if (maxEntrants == 0 || maxEntrants < supply) revert LotNotOpen();
        if (maxEntrants > MAX_ENTRANTS) revert LotNotOpen(); // hard protocol cap
        if (entryCloseAt == 0) revert LotNotOpen();
        if (entryOpenAt > 0 && entryOpenAt >= entryCloseAt) revert LotNotOpen();
        // fixedDeadlineAt must be at least MIN_PROMOTE_LEAD after entryCloseAt so requestDraw/selectWinners math
        // (fixedDeadlineAt - MIN_PROMOTE_LEAD) never underflows and the lot has a guaranteed operational window.
        if (fixedDeadlineAt > 0 && fixedDeadlineAt < entryCloseAt + MIN_PROMOTE_LEAD) revert DeadlineBeforeClose();
        if (fixedDeadlineAt == 0 && paymentWindow == 0) revert LotNotOpen();

        lotId = ++lotCount;
        lots[lotId] = Lot({
            name:            name,
            description:     description,
            priceUsdc:       priceUsdc,
            supply:          supply,
            paymentWindow:   paymentWindow,
            maxEntrants:     maxEntrants,
            merchantAddress: msg.sender,
            state:           LotState.OPEN,
            vrfRequestId:    0,
            vrfWord:         bytes32(0),
            ticketsMinted:   0,
            entryOpenAt:     entryOpenAt,
            entryCloseAt:    entryCloseAt,
            fixedDeadlineAt: fixedDeadlineAt
        });
        emit LotCreated(lotId, name, priceUsdc, supply, msg.sender);
    }

    /// @notice Set/unset a venue operator for a lot.
    function setVenueOperator(uint256 lotId, address operator, bool authorized)
        external lotExists(lotId)
    {
        if (msg.sender != lots[lotId].merchantAddress) revert NotLotMerchant();
        if (operator == address(0)) revert ZeroAddress();
        isVenueOperator[lotId][operator] = authorized;
        emit VenueOperatorSet(lotId, operator, authorized);
    }

    /// @notice Operator-triggered close.
    function closeLot(uint256 lotId) external lotExists(lotId) onlyLotMerchant(lotId) {
        Lot storage lot = lots[lotId];
        if (lot.state != LotState.ACTIVE && lot.state != LotState.WORD_RECEIVED) revert LotNotActive();
        lot.state = LotState.CLOSED;
        emit LotClosed(lotId);
    }

    // ─── Lottery entry ────────────────────────────────────────────────────────

    /// @notice Free entry into an open lot. One entry per wallet.
    function enter(uint256 lotId) external lotExists(lotId) {
        Lot storage lot = lots[lotId];
        if (lot.state != LotState.OPEN) revert LotNotOpen();
        if (lot.entryOpenAt > 0 && uint64(block.timestamp) < lot.entryOpenAt) revert EntryNotYetOpen();
        if (uint64(block.timestamp) >= lot.entryCloseAt) revert EntryAlreadyClosed();
        if (hasEntered[lotId][msg.sender]) revert AlreadyEntered();
        if (uint32(_entrants[lotId].length) >= lot.maxEntrants) revert EntrantLimitReached();
        hasEntered[lotId][msg.sender] = true;
        _entrants[lotId].push(msg.sender);
        emit Entered(lotId, msg.sender);
    }

    function entrantCount(uint256 lotId) external view lotExists(lotId) returns (uint256) {
        return _entrants[lotId].length;
    }

    function entrantAt(uint256 lotId, uint256 index) external view lotExists(lotId) returns (address) {
        return _entrants[lotId][index];
    }

    // ─── VRF draw ─────────────────────────────────────────────────────────────

    /// @notice Close entries and request VRF randomness atomically.
    ///         msg.value must be >= quoteFee(CALLBACK_GAS) from the coordinator.
    ///         Any excess becomes refund credit for msg.sender at the coordinator.
    function requestDraw(uint256 lotId) external payable lotExists(lotId) onlyLotMerchant(lotId) {
        Lot storage lot = lots[lotId];
        if (lot.state != LotState.OPEN) revert LotNotOpen();
        if (lot.vrfRequestId != 0) revert DrawAlreadyInFlight();
        if (uint64(block.timestamp) < lot.entryCloseAt) revert EntryNotClosed();
        if (lot.fixedDeadlineAt > 0 && uint64(block.timestamp) >= lot.fixedDeadlineAt - MIN_PROMOTE_LEAD) revert DeadlineAlreadyPassed();

        // Freeze entries in this transaction (SDK rule 8)
        lot.state = LotState.DRAWING;

        // Client seed commits to the frozen entrant list (SDK rule 9)
        bytes32 clientSeed = keccak256(abi.encode(lotId, _entrants[lotId]));

        // Forward msg.value; excess credited to msg.sender at coordinator
        uint256 requestId = ID20VRF(vrfCoordinator).requestRandomness{value: msg.value}(
            clientSeed, CALLBACK_GAS, msg.sender
        );

        lot.vrfRequestId = requestId;
        _requestToLot[requestId] = lotId;

        emit DrawRequested(lotId, requestId);
    }

    /// @dev Called by coordinator. Store word only; no application logic here.
    function _fulfillRandomness(uint256 requestId, bytes32 word) internal override {
        uint256 lotId = _requestToLot[requestId];
        if (lotId == 0) revert UnexpectedVrfCallback();

        Lot storage lot = lots[lotId];
        // Reject unknown or already-served callbacks
        if (lot.vrfRequestId != requestId || lot.state != LotState.DRAWING)
            revert UnexpectedVrfCallback();

        lot.vrfWord = word;
        lot.state = LotState.WORD_RECEIVED;
        emit WordReceived(lotId, requestId);
    }

    /// @dev Called by coordinator after refundRequest. Allows re-draw.
    function _onRefund(uint256 requestId) internal override {
        uint256 lotId = _requestToLot[requestId];
        if (lotId == 0) return;
        Lot storage lot = lots[lotId];
        if (lot.vrfRequestId == requestId && lot.state == LotState.DRAWING) {
            lot.vrfRequestId = 0;
            lot.state = LotState.OPEN;
            emit DrawExpired(lotId, requestId);
        }
    }

    /// @notice Compute winners and waitlist from the stored VRF word.
    ///         Callable by anyone once the word has arrived.
    function selectWinners(uint256 lotId) external lotExists(lotId) {
        Lot storage lot = lots[lotId];
        if (lot.state != LotState.WORD_RECEIVED) revert LotNotWordReceived();
        // For fixed-deadline lots, ensure enough time remains for VRF latency + at least one purchase
        if (lot.fixedDeadlineAt > 0 &&
            uint64(block.timestamp) >= lot.fixedDeadlineAt - MIN_PROMOTE_LEAD) {
            revert DeadlineAlreadyPassed();
        }

        address[] storage entrants = _entrants[lotId];
        uint256 n = entrants.length;
        uint32 supply = lot.supply;
        bytes32 word = lot.vrfWord;
        // Fixed-deadline: winners pay until fixedDeadlineAt (no promotion window needed)
        // Relative: winners pay from selectWinners time + paymentWindow
        uint64 deadline = lot.fixedDeadlineAt > 0
            ? lot.fixedDeadlineAt
            : uint64(block.timestamp) + lot.paymentWindow;

        // Build a shuffled index array using the VRF word (Fisher-Yates via keccak)
        // so winners and waitlist are drawn without replacement.
        uint256[] memory idx = new uint256[](n);
        for (uint256 i = 0; i < n; i++) idx[i] = i;

        for (uint256 i = n; i > 1; ) {
            unchecked { --i; }
            uint256 j = uint256(keccak256(abi.encode(word, i))) % (i + 1);
            (idx[i], idx[j]) = (idx[j], idx[i]);
        }

        // First `supply` shuffled indices → winners; remainder → waitlist
        uint32 winnerCount = supply < uint32(n) ? supply : uint32(n);
        for (uint32 s = 0; s < winnerCount; s++) {
            address w = entrants[idx[s]];
            lotWinner[lotId][s] = w;
            isWinner[lotId][w] = true;
            _winnerSlot[lotId][w] = s;
            paymentDeadline[lotId][s] = deadline;
        }
        _winnerCount[lotId] = winnerCount;

        uint32 waitlistLen = 0;
        for (uint256 i = winnerCount; i < n; i++) {
            _waitlist[lotId].push(entrants[idx[i]]);
            waitlistLen++;
        }

        lot.state = LotState.ACTIVE;
        emit WinnersSelected(lotId, winnerCount, waitlistLen);
    }

    // ─── Purchase (atomic USDC → merchant + SBT mint) ─────────────────────────

    /// @notice Winner calls this after approving USDC to this contract.
    function purchase(uint256 lotId) external lotExists(lotId) returns (uint256 tokenId) {
        Lot storage lot = lots[lotId];
        if (lot.state != LotState.ACTIVE) revert LotNotActive();
        if (!isWinner[lotId][msg.sender]) revert NotWinner();

        uint32 slot = _winnerSlot[lotId][msg.sender];
        if (uint64(block.timestamp) > paymentDeadline[lotId][slot]) revert DeadlineExpired();
        if (slotPaid[lotId][slot]) revert AlreadyPurchased();
        if (lots[lotId].ticketsMinted >= lots[lotId].supply) revert AlreadyPurchased();

        slotPaid[lotId][slot] = true;
        lot.ticketsMinted++;   // CEI: update state before external calls

        // Transfer USDC directly to merchant — no contract treasury
        uint256 price = lot.priceUsdc;
        bool ok = usdc.transferFrom(msg.sender, lot.merchantAddress, price);
        if (!ok) revert UsdcTransferFailed();

        // Mint SBT (effects before _safeMint interaction)
        tokenId = _nextTokenId++;
        tokenLot[tokenId] = lotId;
        tokenSlot[tokenId] = slot;
        purchaseTxHash[tokenId] = blockhash(block.number - 1); // best available; frontend records real txHash
        purchaseAmount[tokenId] = price;

        _safeMint(msg.sender, tokenId);

        emit Purchased(lotId, tokenId, msg.sender, price);
        emit Locked(tokenId); // ERC-5192
    }

    // ─── Waitlist promotion (permissionless, time-locked) ────────────────────

    /// @notice Promote the next waitlist entry for an expired winner slot.
    ///         Anyone can call this after the slot's payment deadline has passed.
    function promoteWaitlist(uint256 lotId, uint32 winnerSlot) external lotExists(lotId) {
        if (winnerSlot >= _winnerCount[lotId]) revert InvalidWinnerSlot();
        Lot storage lot = lots[lotId];
        if (lot.state != LotState.ACTIVE) revert LotNotActive();
        if (uint64(block.timestamp) <= paymentDeadline[lotId][winnerSlot]) revert DeadlineNotReached();
        // Fixed-deadline lots: promotion disabled (winners pay until fixedDeadlineAt directly)
        if (lot.fixedDeadlineAt > 0) revert PromotionAfterDeadline();
        if (slotPaid[lotId][winnerSlot]) revert AlreadyPurchased(); // slot already used

        uint32 head = waitlistHead[lotId];
        if (head >= _waitlist[lotId].length) revert NoWaitlistRemaining();

        address promoted = _waitlist[lotId][head];
        waitlistHead[lotId] = head + 1;

        // Overwrite the expired slot
        address old = lotWinner[lotId][winnerSlot];
        isWinner[lotId][old] = false;

        lotWinner[lotId][winnerSlot] = promoted;
        isWinner[lotId][promoted] = true;
        _winnerSlot[lotId][promoted] = winnerSlot;
        paymentDeadline[lotId][winnerSlot] = lot.fixedDeadlineAt > 0
            ? lot.fixedDeadlineAt
            : uint64(block.timestamp) + lot.paymentWindow;

        emit WaitlistPromoted(lotId, winnerSlot, promoted);
    }

    // ─── EIP-712 challenge-response redemption ────────────────────────────────

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes("LuckyPass")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    /// @notice Venue operator submits a ticket holder's signed challenge.
    ///         The holder must sign RedemptionChallenge off-chain with their wallet.
    function redeem(
        uint256 tokenId,
        bytes calldata signature,
        uint256 nonce,
        uint256 timestamp
    ) external {
        uint256 lotId = tokenLot[tokenId];
        if (!isVenueOperator[lotId][msg.sender]) revert NotVenueOperator();
        if (isRedeemed[tokenId]) revert AlreadyRedeemed();
        if (nonce != redemptionNonce[tokenId]) revert NonceMismatch();
        if (block.timestamp > timestamp + REDEMPTION_EXPIRY) revert ChallengeExpired();

        // Recover signer from EIP-712 hash
        bytes32 structHash = keccak256(abi.encode(
            REDEMPTION_TYPEHASH,
            tokenId,
            address(this),
            block.chainid,
            nonce,
            timestamp
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(_domainSeparator(), structHash);
        address signer = ECDSA.recover(digest, signature);

        if (signer != ownerOf(tokenId)) revert InvalidSignature();

        isRedeemed[tokenId] = true;
        redemptionNonce[tokenId]++;

        emit Redeemed(tokenId, msg.sender, block.timestamp);
    }

    // ─── ERC-5192 Soulbound ───────────────────────────────────────────────────

    /// @inheritdoc IERC5192
    function locked(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId); // reverts for non-existent tokens (ERC-5192 compliance)
        return true; // All LuckyPass tokens are permanently locked
    }

    /// @dev Block all transfers except mint (from == address(0)).
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    /// @dev ERC-165: declare ERC-5192 support
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721) returns (bool)
    {
        return interfaceId == 0xb45a3c0e // IERC5192
            || super.supportsInterface(interfaceId);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    function waitlistLength(uint256 lotId) external view lotExists(lotId) returns (uint256) {
        return _waitlist[lotId].length;
    }

    function waitlistAt(uint256 lotId, uint256 index) external view lotExists(lotId) returns (address) {
        return _waitlist[lotId][index];
    }

    function getLot(uint256 lotId) external view lotExists(lotId) returns (
        string memory name,
        string memory description,
        uint256 priceUsdc,
        uint32 supply,
        uint64 paymentWindow,
        address merchantAddress,
        LotState state,
        uint32 ticketsMinted,
        uint32 maxEntrants,
        uint64 entryOpenAt,
        uint64 entryCloseAt,
        uint64 fixedDeadlineAt
    ) {
        Lot storage lot = lots[lotId];
        name            = lot.name;
        description     = lot.description;
        priceUsdc       = lot.priceUsdc;
        supply          = lot.supply;
        paymentWindow   = lot.paymentWindow;
        merchantAddress = lot.merchantAddress;
        state           = lot.state;
        ticketsMinted   = lot.ticketsMinted;
        maxEntrants     = lot.maxEntrants;
        entryOpenAt     = lot.entryOpenAt;
        entryCloseAt    = lot.entryCloseAt;
        fixedDeadlineAt = lot.fixedDeadlineAt;
    }

    function getTicketInfo(uint256 tokenId) external view returns (
        uint256 lotId,
        uint32 slot,
        address holder,
        uint256 amount,
        bool redeemed,
        uint256 nonce
    ) {
        return (
            tokenLot[tokenId],
            tokenSlot[tokenId],
            ownerOf(tokenId),
            purchaseAmount[tokenId],
            isRedeemed[tokenId],
            redemptionNonce[tokenId]
        );
    }
}
