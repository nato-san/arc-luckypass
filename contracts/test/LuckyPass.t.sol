// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm, console2} from "forge-std/Test.sol";
import {LuckyPass} from "../LuckyPass.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// ─── Mock VRF Coordinator ────────────────────────────────────────────────────
// Simulates D20DAO coordinator: stores requests, allows test to trigger callback.

contract MockVRFCoordinator {
    uint256 private _nextId = 1;
    uint256 public lastFee;
    mapping(uint256 => address) public requestConsumer;
    mapping(uint256 => uint32) public requestCallbackGas;

    error IncorrectFee(uint256 expected, uint256 actual);

    // Minimal quoteFee — always returns 0.001 ether (native token) in tests
    function quoteFee(uint32 /*callbackGasLimit*/) external pure returns (uint256) {
        return 0.001 ether;
    }

    function requestRandomness(
        bytes32, /*clientSeed*/
        uint32 callbackGasLimit,
        address /*refundAddress*/
    ) external payable returns (uint256 requestId) {
        uint256 fee = 0.001 ether;
        if (msg.value < fee) revert IncorrectFee(fee, msg.value);
        requestId = _nextId++;
        requestConsumer[requestId] = msg.sender;
        requestCallbackGas[requestId] = callbackGasLimit;
        lastFee = msg.value;
    }

    // Test helper: simulate the keeper delivering a random word
    function deliverRandomness(uint256 requestId, bytes32 word) external {
        address consumer = requestConsumer[requestId];
        require(consumer != address(0), "unknown request");
        // Call rawFulfillRandomness on the consumer (this is what the real keeper does)
        (bool ok, ) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomness(uint256,bytes32)", requestId, word)
        );
        require(ok, "callback failed");
    }

    // Test helper: simulate refundRequest
    function simulateRefund(uint256 requestId) external {
        address consumer = requestConsumer[requestId];
        require(consumer != address(0), "unknown request");
        (bool ok, ) = consumer.call(
            abi.encodeWithSignature("onRefund(uint256)", requestId)
        );
        require(ok, "refund callback failed");
    }
}

// ─── Mock USDC (ERC-20) ──────────────────────────────────────────────────────

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "not allowed");
        balanceOf[from] -= amount;
        allowance[from][msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

contract LuckyPassTest is Test {
    LuckyPass public lp;
    MockVRFCoordinator public coord;
    MockUSDC public usdc;

    address owner    = address(0xA0);
    address merchant = address(0xA1);
    address venue    = address(0xA2);
    address alice    = address(0xA3);
    address bob      = address(0xA4);
    address carol    = address(0xA5);
    address dave     = address(0xA6);

    uint256 private aliceKey = 0xA11CE1;
    uint256 private bobKey   = 0xB0B001;

    // Lot params
    uint256 constant PRICE   = 10e6;   // 10 USDC (6 decimals)
    uint32  constant SUPPLY  = 2;      // 2 winners
    uint64  constant WINDOW  = 1 days;

    // VRF fee constant
    uint256 constant VRF_FEE = 0.001 ether;

    // Default time params for setUp lot (lot 1).
    // entryCloseAt is 100s in the future at setUp time.
    // Tests that need to enter() use the open window; tests that need
    // requestDraw() use vm.warp to step past closeAt.
    uint64 internal LOT1_CLOSE_AT;

    function setUp() public {
        coord = new MockVRFCoordinator();
        usdc  = new MockUSDC();

        vm.prank(owner);
        lp = new LuckyPass(address(coord), address(usdc), owner);

        // Fund all test accounts with USDC and native token for VRF fees
        usdc.mint(alice, 100e6);
        usdc.mint(bob,   100e6);
        usdc.mint(carol, 100e6);
        usdc.mint(dave,  100e6);
        vm.deal(alice,    1 ether);
        vm.deal(bob,      1 ether);
        vm.deal(carol,    1 ether);
        vm.deal(dave,     1 ether);
        vm.deal(owner,    1 ether);
        vm.deal(merchant, 1 ether);

        // createLot is now permissionless — no approveStore needed.
        // entryOpenAt=0 (open immediately), entryCloseAt=now+100, fixedDeadlineAt=0

        LOT1_CLOSE_AT = uint64(block.timestamp + 100);

        vm.prank(merchant);
        lp.createLot(
            "Test Lot", "A test item",
            PRICE, SUPPLY, WINDOW, uint32(100),
            0,              // entryOpenAt
            LOT1_CLOSE_AT,  // entryCloseAt
            0               // fixedDeadlineAt
        );

        // Add venue operator — only the lot's merchant can do this
        vm.prank(merchant);
        lp.setVenueOperator(1, venue, true);
    }

    // ─── Lot creation ─────────────────────────────────────────────────────────

    function test_createLot() public view {
        (
            string memory name,
            string memory description,
            uint256 price,
            uint32 supply,
            ,
            address merch,
            LuckyPass.LotState state,
            ,
            ,
            ,
            ,
        ) = lp.getLot(1);
        assertEq(name, "Test Lot");
        assertEq(description, "A test item");
        assertEq(price, PRICE);
        assertEq(supply, SUPPLY);
        assertEq(merch, merchant);
        assertEq(uint8(state), uint8(LuckyPass.LotState.OPEN));
    }

    // ─── Entry ────────────────────────────────────────────────────────────────

    function test_enter() public {
        vm.prank(alice);
        lp.enter(1);
        assertEq(lp.entrantCount(1), 1);
        assertTrue(lp.hasEntered(1, alice));
    }

    function test_revert_duplicateEntry() public {
        vm.prank(alice);
        lp.enter(1);
        vm.prank(alice);
        vm.expectRevert(LuckyPass.AlreadyEntered.selector);
        lp.enter(1);
    }

    function test_revert_entryWhenDrawing() public {
        _requestDraw();
        vm.prank(carol);
        vm.expectRevert(LuckyPass.LotNotOpen.selector);
        lp.enter(1);
    }

    // ─── VRF draw ─────────────────────────────────────────────────────────────

    function test_requestDraw_freezesEntries() public {
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        _requestDraw();

        (, , , , , , LuckyPass.LotState state, , , , , ) = lp.getLot(1);
        assertEq(uint8(state), uint8(LuckyPass.LotState.DRAWING));
    }

    function test_requestDraw_revert_alreadyInFlight() public {
        vm.prank(alice); lp.enter(1);
        _requestDraw();
        vm.prank(merchant);
        vm.expectRevert(LuckyPass.LotNotOpen.selector); // state is DRAWING, not OPEN
        lp.requestDraw{value: VRF_FEE}(1);
    }

    function test_fulfillRandomness_storesWord() public {
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        uint256 rid = _requestDraw();

        bytes32 word = keccak256("test-word");
        coord.deliverRandomness(rid, word);

        (, , , , , , LuckyPass.LotState state, , , , , ) = lp.getLot(1);
        assertEq(uint8(state), uint8(LuckyPass.LotState.WORD_RECEIVED));
    }

    function test_revert_unexpectedCallback() public {
        vm.prank(alice); lp.enter(1);
        _requestDraw();

        // Coordinator sends a callback for a request ID that was never issued
        vm.prank(address(coord));
        vm.expectRevert(LuckyPass.UnexpectedVrfCallback.selector);
        lp.rawFulfillRandomness(9999, bytes32(0));
    }

    function test_onRefund_allowsRedraw() public {
        vm.prank(alice); lp.enter(1);
        uint256 rid = _requestDraw();

        // Simulate expired request refund
        coord.simulateRefund(rid);

        (, , , , , , LuckyPass.LotState state, , , , , ) = lp.getLot(1);
        assertEq(uint8(state), uint8(LuckyPass.LotState.OPEN));

        // Should be able to request again
        uint256 rid2 = _requestDraw();
        assertTrue(rid2 != rid);
    }

    // ─── Winner selection ─────────────────────────────────────────────────────

    function test_selectWinners_setsWinnersAndWaitlist() public {
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        vm.prank(carol); lp.enter(1);
        vm.prank(dave);  lp.enter(1);

        uint256 rid = _requestDraw();
        bytes32 word = keccak256("lucky-word");
        coord.deliverRandomness(rid, word);

        lp.selectWinners(1); // callable by anyone

        (, , , , , , LuckyPass.LotState state, , , , , ) = lp.getLot(1);
        assertEq(uint8(state), uint8(LuckyPass.LotState.ACTIVE));

        // Exactly SUPPLY (2) winners
        uint32 winners;
        address[4] memory candidates = [alice, bob, carol, dave];
        for (uint i = 0; i < 4; i++) {
            if (lp.isWinner(1, candidates[i])) winners++;
        }
        assertEq(winners, SUPPLY);

        // Waitlist has remaining 2
        assertEq(lp.waitlistLength(1), 2);
    }

    function test_selectWinners_noduplicates() public {
        // Even with many entrants, winners must be unique
        address[] memory addrs = new address[](10);
        for (uint160 i = 0; i < 10; i++) {
            addrs[i] = address(uint160(0xBEEF) + i);
            vm.prank(addrs[i]); lp.enter(1);
        }
        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("no-dupes"));
        lp.selectWinners(1);

        uint32 winners;
        for (uint i = 0; i < 10; i++) {
            if (lp.isWinner(1, addrs[i])) winners++;
        }
        assertEq(winners, SUPPLY);
    }

    function test_revert_selectWinnersBeforeWord() public {
        vm.prank(alice); lp.enter(1);
        _requestDraw();
        vm.expectRevert(LuckyPass.LotNotWordReceived.selector);
        lp.selectWinners(1);
    }

    // ─── Purchase ─────────────────────────────────────────────────────────────

    function test_purchase_mintsTokenAndPaysmerchant() public {
        _fullDrawWith2Winners();

        address winner = _getFirstWinner();
        _approvePurchase(winner);

        uint256 merchantBefore = usdc.balanceOf(merchant);

        vm.prank(winner);
        uint256 tokenId = lp.purchase(1);

        // SBT minted
        assertEq(lp.ownerOf(tokenId), winner);
        // USDC went to merchant
        assertEq(usdc.balanceOf(merchant), merchantBefore + PRICE);
        // Token is locked
        assertTrue(lp.locked(tokenId));
    }

    function test_purchase_revert_nonWinner() public {
        _fullDrawWith2Winners();
        _approvePurchase(carol);

        vm.prank(carol);
        vm.expectRevert(LuckyPass.NotWinner.selector);
        lp.purchase(1);
    }

    function test_purchase_revert_afterDeadline() public {
        _fullDrawWith2Winners();
        address winner = _getFirstWinner();
        _approvePurchase(winner);

        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(winner);
        vm.expectRevert(LuckyPass.DeadlineExpired.selector);
        lp.purchase(1);
    }

    function test_purchase_revert_doublePurchase() public {
        _fullDrawWith2Winners();
        address winner = _getFirstWinner();
        _approvePurchase(winner);

        vm.prank(winner); lp.purchase(1);
        _approvePurchase(winner);
        vm.prank(winner);
        vm.expectRevert(LuckyPass.AlreadyPurchased.selector);
        lp.purchase(1);
    }

    // ─── ERC-5192 soulbound ───────────────────────────────────────────────────

    function test_transferReverts() public {
        _fullDrawWith2Winners();
        address winner = _getFirstWinner();
        _approvePurchase(winner);
        vm.prank(winner);
        uint256 tokenId = lp.purchase(1);

        vm.prank(winner);
        vm.expectRevert();
        lp.transferFrom(winner, bob, tokenId);
    }

    function test_supportsERC5192() public view {
        assertTrue(lp.supportsInterface(0xb45a3c0e));
    }

    // ─── Waitlist promotion ───────────────────────────────────────────────────

    function test_promoteWaitlist_afterDeadline() public {
        // 4 entrants, 2 winner slots
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        vm.prank(carol); lp.enter(1);
        vm.prank(dave);  lp.enter(1);

        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("promo-word"));
        lp.selectWinners(1);

        // Find slot 0 winner and let deadline expire
        vm.warp(block.timestamp + WINDOW + 1);

        // Anyone can call promoteWaitlist
        lp.promoteWaitlist(1, 0);

        // Waitlist head advanced
        assertEq(lp.waitlistHead(1), 1);
    }

    function test_promoteWaitlist_revert_beforeDeadline() public {
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        vm.prank(carol); lp.enter(1);
        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("w"));
        lp.selectWinners(1);

        vm.expectRevert(LuckyPass.DeadlineNotReached.selector);
        lp.promoteWaitlist(1, 0);
    }

    function test_promoteWaitlist_revert_noWaitlist() public {
        // Only 2 entrants = only winners, no waitlist
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("w2"));
        lp.selectWinners(1);

        vm.warp(block.timestamp + WINDOW + 1);
        vm.expectRevert(LuckyPass.NoWaitlistRemaining.selector);
        lp.promoteWaitlist(1, 0);
    }

    // ─── EIP-712 Redemption ───────────────────────────────────────────────────

    function test_redeem_validSignature() public {
        uint256 alicePrivKey = 0xA11CE;
        address aliceAddr = vm.addr(alicePrivKey);

        // Mint alice some USDC and native for VRF fee
        usdc.mint(aliceAddr, 100e6);
        vm.deal(aliceAddr, 1 ether);

        // Create a new lot as merchant (already approved in setUp)
        uint64 lotCloseAt = uint64(block.timestamp + 50);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Lot2", "desc",
            PRICE, 1, WINDOW, uint32(100),
            0, lotCloseAt, 0
        );
        vm.prank(merchant);
        lp.setVenueOperator(lotId, venue, true);
        vm.prank(aliceAddr); lp.enter(lotId);
        vm.warp(lotCloseAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("alice-wins"));
        lp.selectWinners(lotId);

        vm.prank(aliceAddr);
        usdc.approve(address(lp), PRICE);
        vm.prank(aliceAddr);
        uint256 tokenId = lp.purchase(lotId);

        // Build EIP-712 challenge
        uint256 nonce = lp.redemptionNonce(tokenId);
        uint256 ts = block.timestamp;

        bytes32 structHash = keccak256(abi.encode(
            keccak256("RedemptionChallenge(uint256 tokenId,address contractAddress,uint256 chainId,uint256 nonce,uint256 timestamp)"),
            tokenId,
            address(lp),
            block.chainid,
            nonce,
            ts
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(lp.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePrivKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Venue operator redeems
        vm.prank(venue);
        lp.redeem(tokenId, sig, nonce, ts);

        assertTrue(lp.isRedeemed(tokenId));
        assertEq(lp.redemptionNonce(tokenId), 1); // incremented
    }

    function test_redeem_revert_replayAfterRedeem() public {
        uint256 privKey = 0xA11CE;
        address holder = vm.addr(privKey);
        usdc.mint(holder, 100e6);
        vm.deal(holder, 1 ether);

        uint64 lot3CloseAt = uint64(block.timestamp + 50);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Lot3", "desc",
            PRICE, 1, WINDOW, uint32(100),
            0, lot3CloseAt, 0
        );
        vm.prank(merchant); lp.setVenueOperator(lotId, venue, true);
        vm.prank(holder); lp.enter(lotId);
        vm.warp(lot3CloseAt);
        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("holder-wins"));
        lp.selectWinners(lotId);
        vm.prank(holder); usdc.approve(address(lp), PRICE);
        vm.prank(holder); uint256 tokenId = lp.purchase(lotId);

        uint256 nonce = lp.redemptionNonce(tokenId);
        uint256 ts = block.timestamp;
        bytes32 structHash = keccak256(abi.encode(
            keccak256("RedemptionChallenge(uint256 tokenId,address contractAddress,uint256 chainId,uint256 nonce,uint256 timestamp)"),
            tokenId, address(lp), block.chainid, nonce, ts
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(lp.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // First redemption succeeds
        vm.prank(venue); lp.redeem(tokenId, sig, nonce, ts);

        // Replay with same signature must revert
        vm.prank(venue);
        vm.expectRevert(LuckyPass.AlreadyRedeemed.selector);
        lp.redeem(tokenId, sig, nonce, ts);
    }

    function test_redeem_revert_nonOperator() public {
        uint256 privKey = 0xA11CE;
        address holder = vm.addr(privKey);
        usdc.mint(holder, 100e6);
        vm.deal(holder, 1 ether);

        uint64 lot4CloseAt = uint64(block.timestamp + 50);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Lot4", "desc",
            PRICE, 1, WINDOW, uint32(100),
            0, lot4CloseAt, 0
        );
        // Note: intentionally NOT setting venue as operator for this lot
        vm.prank(holder); lp.enter(lotId);
        vm.warp(lot4CloseAt);
        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("holder-wins2"));
        lp.selectWinners(lotId);
        vm.prank(holder); usdc.approve(address(lp), PRICE);
        vm.prank(holder); uint256 tokenId = lp.purchase(lotId);

        uint256 nonce = lp.redemptionNonce(tokenId);
        uint256 ts = block.timestamp;
        bytes32 structHash = keccak256(abi.encode(
            keccak256("RedemptionChallenge(uint256 tokenId,address contractAddress,uint256 chainId,uint256 nonce,uint256 timestamp)"),
            tokenId, address(lp), block.chainid, nonce, ts
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(lp.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Random address (not a venue operator for lotId) tries to redeem
        vm.prank(address(0xDEAD));
        vm.expectRevert(LuckyPass.NotVenueOperator.selector);
        lp.redeem(tokenId, sig, nonce, ts);
    }

    function test_redeem_revert_expiredChallenge() public {
        uint256 privKey = 0xA11CE;
        address holder = vm.addr(privKey);
        usdc.mint(holder, 100e6);
        vm.deal(holder, 1 ether);

        uint64 lot5CloseAt = uint64(block.timestamp + 50);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Lot5", "desc",
            PRICE, 1, WINDOW, uint32(100),
            0, lot5CloseAt, 0
        );
        vm.prank(merchant); lp.setVenueOperator(lotId, venue, true);
        vm.prank(holder); lp.enter(lotId);
        vm.warp(lot5CloseAt);
        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("hw3"));
        lp.selectWinners(lotId);
        vm.prank(holder); usdc.approve(address(lp), PRICE);
        vm.prank(holder); uint256 tokenId = lp.purchase(lotId);

        uint256 nonce = lp.redemptionNonce(tokenId);
        // Capture ts before the warp using a concrete value so via-ir can't re-evaluate it.
        uint256 ts = uint256(lot5CloseAt); // == block.timestamp at purchase time
        bytes32 structHash = keccak256(abi.encode(
            keccak256("RedemptionChallenge(uint256 tokenId,address contractAddress,uint256 chainId,uint256 nonce,uint256 timestamp)"),
            tokenId, address(lp), block.chainid, nonce, ts
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(lp.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Warp past the 5-minute expiry window: ts + 301 > ts + 300
        vm.warp(ts + 301);
        vm.prank(venue);
        vm.expectRevert(LuckyPass.ChallengeExpired.selector);
        lp.redeem(tokenId, sig, nonce, ts);
    }

    // ─── Access control ───────────────────────────────────────────────────────

    /// @dev createLot is permissionless — any wallet can create a lot
    function test_anyoneCanCreateLot() public {
        // alice has never been approveStore'd
        uint64 closeAt = uint64(block.timestamp + 100);
        vm.prank(alice);
        uint256 newLotId = lp.createLot(
            "Alice Lot", "created by alice",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, 0
        );
        // merchantAddress must be alice (msg.sender)
        (, , , , , address merch, , , , , , ) = lp.getLot(newLotId);
        assertEq(merch, alice);
    }

    /// @dev A wallet cannot manage another wallet's lot
    function test_cannotManageOtherMerchantLot() public {
        // alice creates her own lot
        uint64 closeAt = uint64(block.timestamp + 100);
        vm.prank(alice);
        uint256 aliceLotId = lp.createLot(
            "Alice Lot", "desc",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, 0
        );

        // bob cannot set venue operator on alice's lot
        vm.prank(bob);
        vm.expectRevert(LuckyPass.NotLotMerchant.selector);
        lp.setVenueOperator(aliceLotId, bob, true);

        // merchant (lot 1 owner) cannot manage alice's lot
        vm.warp(closeAt);
        vm.prank(merchant);
        vm.expectRevert(LuckyPass.NotLotMerchant.selector);
        lp.requestDraw{value: VRF_FEE}(aliceLotId);
    }

    /// @dev Lot merchant can set themselves as venue operator and perform redemption
    function test_merchantCanSetSelfAsVenueOperator() public {
        // Use a keyed address so we can produce an EIP-712 signature
        uint256 buyerPrivKey = 0xB0B;
        address buyer = vm.addr(buyerPrivKey);
        usdc.mint(buyer, 100e6);
        vm.deal(buyer, 1 ether);

        // merchant sets themselves as venue operator for lot 1
        vm.prank(merchant);
        lp.setVenueOperator(1, merchant, true);
        assertTrue(lp.isVenueOperator(1, merchant));

        // buyer enters and wins
        uint64 closeAt = LOT1_CLOSE_AT;
        vm.prank(buyer); lp.enter(1);
        vm.warp(closeAt);
        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("merchant-self-op"));
        lp.selectWinners(1);
        require(lp.isWinner(1, buyer), "buyer must win with this seed");

        // buyer purchases
        vm.prank(buyer); usdc.approve(address(lp), PRICE);
        vm.prank(buyer); uint256 tid = lp.purchase(1);

        // Build EIP-712 redemption signature as buyer
        uint256 nonce = lp.redemptionNonce(tid);
        uint256 ts = block.timestamp;
        bytes32 structHash = keccak256(abi.encode(
            keccak256("RedemptionChallenge(uint256 tokenId,address contractAddress,uint256 chainId,uint256 nonce,uint256 timestamp)"),
            tid, address(lp), block.chainid, nonce, ts
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(lp.domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerPrivKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // merchant (as venue operator) redeems
        vm.prank(merchant);
        lp.redeem(tid, sig, nonce, ts);
        assertTrue(lp.isRedeemed(tid));
    }

    /// @dev Only the lot's merchant can set a venue operator (not arbitrary caller)
    function test_onlyMerchantCanSetOperator() public {
        vm.prank(alice);
        vm.expectRevert(LuckyPass.NotLotMerchant.selector);
        lp.setVenueOperator(1, alice, true);
    }

    function test_merchantCanSetOperatorForOwnLot() public {
        vm.prank(merchant);
        lp.setVenueOperator(1, carol, true);
        assertTrue(lp.isVenueOperator(1, carol));
    }

    // ─── Full lifecycle ───────────────────────────────────────────────────────

    function test_fullLifecycle() public {
        // 4 entrants, 2 winners, 2 waitlist
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        vm.prank(carol); lp.enter(1);
        vm.prank(dave);  lp.enter(1);

        // Draw
        uint256 rid = _requestDraw();
        bytes32 word = keccak256("full-lifecycle");
        coord.deliverRandomness(rid, word);
        lp.selectWinners(1);

        // Purchase for all winners
        address[4] memory candidates = [alice, bob, carol, dave];
        uint256 tokenId1; uint256 tokenId2;
        uint32 minted;
        for (uint i = 0; i < 4; i++) {
            if (lp.isWinner(1, candidates[i])) {
                _approvePurchase(candidates[i]);
                vm.prank(candidates[i]);
                uint256 tid = lp.purchase(1);
                if (minted == 0) tokenId1 = tid;
                else tokenId2 = tid;
                minted++;
            }
        }
        assertEq(minted, 2);

        // Verify soulbound
        assertTrue(lp.locked(tokenId1));
        assertTrue(lp.locked(tokenId2));

        // Tokens should not be redeemed yet
        assertFalse(lp.isRedeemed(tokenId1));
        assertFalse(lp.isRedeemed(tokenId2));

        // Verify merchant received USDC
        assertEq(usdc.balanceOf(merchant), PRICE * 2);

        console2.log("Full lifecycle passed. Winners:", minted);
        console2.log("Merchant balance (USDC units):", usdc.balanceOf(merchant));
    }

    // ─── approveStore / revokeStore (legacy allowlist — not enforced by createLot) ──

    /// approveStore is still onlyOwner (legacy function preserved)
    function test_approveStore_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice)
        );
        lp.approveStore(carol);
    }

    /// revokeStore is still onlyOwner (legacy function preserved)
    function test_revokeStore_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice)
        );
        lp.revokeStore(merchant);
    }

    /// approveStore/revokeStore still toggle the mapping, but do NOT gate createLot
    function test_approveStore_togglesMapping_notGating() public {
        // carol is not approved — but can still create a lot (permissionless)
        assertFalse(lp.isApprovedStore(carol));
        uint64 closeAt = uint64(block.timestamp + 100);
        vm.prank(carol);
        uint256 lotId = lp.createLot(
            "Carol Lot", "no approval needed",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, 0
        );
        assertGt(lotId, 0);

        // owner can still set the mapping (for off-chain UIs)
        vm.prank(owner);
        lp.approveStore(carol);
        assertTrue(lp.isApprovedStore(carol));

        // revokeStore removes from mapping but does NOT prevent new lots
        vm.prank(owner);
        lp.revokeStore(carol);
        assertFalse(lp.isApprovedStore(carol));

        // carol can STILL create another lot after revocation
        vm.prank(carol);
        uint256 lotId2 = lp.createLot(
            "Carol Lot 2", "still works",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, 0
        );
        assertGt(lotId2, lotId);
    }

    /// 6. A different wallet cannot requestDraw on another merchant's lot
    function test_requestDraw_notMerchant() public {
        vm.prank(alice); lp.enter(1);
        // Warp past close so draw is allowed (but still fail on auth)
        vm.warp(LOT1_CLOSE_AT);
        // alice is not the merchant for lot 1
        vm.prank(alice);
        vm.expectRevert(LuckyPass.NotLotMerchant.selector);
        lp.requestDraw{value: VRF_FEE}(1);
    }

    /// 7. A different wallet cannot closeLot on another merchant's lot
    function test_closeLot_notMerchant() public {
        // Bring lot to ACTIVE state
        _fullDrawWith2Winners();
        // alice is not the merchant for lot 1
        vm.prank(alice);
        vm.expectRevert(LuckyPass.NotLotMerchant.selector);
        lp.closeLot(1);
    }

    /// 8. A wallet that is not the lot's merchant cannot setVenueOperator
    function test_setVenueOperator_notMerchant() public {
        vm.prank(alice);
        vm.expectRevert(LuckyPass.NotLotMerchant.selector);
        lp.setVenueOperator(1, alice, true);
    }

    /// 9. Even the contract owner cannot setVenueOperator on another merchant's lot
    function test_setVenueOperator_ownerCannotBypassMerchant() public {
        // owner is not the merchant for lot 1 (merchant is address(0xA1))
        vm.prank(owner);
        vm.expectRevert(LuckyPass.NotLotMerchant.selector);
        lp.setVenueOperator(1, alice, true);
    }

    /// 10. Store A cannot requestDraw or closeLot on store B's lot
    function test_storeIsolation() public {
        address storeA = address(0xAA01);
        address storeB = address(0xBB01);
        vm.deal(storeA, 1 ether);
        vm.deal(storeB, 1 ether);

        // createLot is permissionless — no approveStore needed

        uint64 closeAt = uint64(block.timestamp + 100);

        // storeA creates lot 2, storeB creates lot 3
        vm.prank(storeA);
        uint256 lotA = lp.createLot(
            "Store A Lot", "a",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, 0
        );
        vm.prank(storeB);
        uint256 lotB = lp.createLot(
            "Store B Lot", "b",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, 0
        );

        // storeB cannot requestDraw on storeA's lot (still before close, so EntryNotClosed from wrong merchant)
        // Actually we need to test the merchant auth, not the time gate.
        // Warp past close so the time check passes and we isolate the auth check.
        vm.warp(closeAt);

        // storeB cannot requestDraw on storeA's lot
        vm.prank(storeB);
        vm.expectRevert(LuckyPass.NotLotMerchant.selector);
        lp.requestDraw{value: VRF_FEE}(lotA);

        // storeA cannot requestDraw on storeB's lot
        vm.prank(storeA);
        vm.expectRevert(LuckyPass.NotLotMerchant.selector);
        lp.requestDraw{value: VRF_FEE}(lotB);

        // Bring lotA to DRAWING via storeA (already past close)
        vm.prank(storeA);
        lp.requestDraw{value: VRF_FEE}(lotA);

        (, , , , , , LuckyPass.LotState stateA, , , , , ) = lp.getLot(lotA);
        assertEq(uint8(stateA), uint8(LuckyPass.LotState.DRAWING));

        // storeB cannot requestDraw on storeA's lot (already DRAWING → LotNotOpen from storeB)
        vm.prank(storeB);
        vm.expectRevert(LuckyPass.NotLotMerchant.selector);
        lp.requestDraw{value: VRF_FEE}(lotA);
    }

    // ─── New tests: maxEntrants hard cap, entrant limit, invalid winner slot, supply cap ───

    /// 1. createLot reverts LotNotOpen when maxEntrants > MAX_ENTRANTS (500)
    function test_createLot_maxEntrantsExceedsHardCap() public {
        vm.prank(merchant);
        vm.expectRevert(LuckyPass.LotNotOpen.selector);
        lp.createLot(
            "Cap Lot", "over the cap",
            PRICE, SUPPLY, WINDOW, uint32(501),
            0, uint64(block.timestamp + 100), 0
        );
    }

    /// 2. entering when entrant limit is reached reverts EntrantLimitReached
    function test_enter_entrantLimitReached() public {
        // Create a lot where maxEntrants == supply == 2 so the cap is hit quickly
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Small Lot", "tiny",
            PRICE, SUPPLY, WINDOW, uint32(2),
            0, uint64(block.timestamp + 100), 0
        );

        vm.prank(alice); lp.enter(lotId);
        vm.prank(bob);   lp.enter(lotId);

        // Third entrant should be rejected
        vm.prank(carol);
        vm.expectRevert(LuckyPass.EntrantLimitReached.selector);
        lp.enter(lotId);
    }

    /// 3. promoteWaitlist with winnerSlot >= actual winner count reverts InvalidWinnerSlot
    function test_promoteWaitlist_invalidSlot() public {
        // Full draw with 2 entrants → 2 winners, 0 waitlist (but that's fine; we test slot validity first)
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("slot-test"));
        lp.selectWinners(1);

        // winnerCount == SUPPLY == 2, so slot 2 is out of range
        vm.warp(block.timestamp + WINDOW + 1);
        vm.expectRevert(LuckyPass.InvalidWinnerSlot.selector);
        lp.promoteWaitlist(1, 2); // slot 2 >= winnerCount 2
    }

    /// 4. supply cap prevents over-minting
    function test_purchase_supplyCap() public {
        // Create supply=1, maxEntrants=2 lot
        uint64 capCloseAt = uint64(block.timestamp + 50);
        vm.prank(merchant);
        uint256 capLotId = lp.createLot(
            "CapLot", "supply=1",
            PRICE, 1, WINDOW, uint32(2),
            0, capCloseAt, 0
        );

        address p1 = makeAddr("p1");
        address p2 = makeAddr("p2");
        usdc.mint(p1, 100e6);
        usdc.mint(p2, 100e6);

        vm.prank(p1); lp.enter(capLotId);
        vm.prank(p2); lp.enter(capLotId);
        vm.warp(capCloseAt);

        uint256 rid2 = _requestDrawLot(capLotId);
        coord.deliverRandomness(rid2, keccak256("supply-cap-word"));
        lp.selectWinners(capLotId);

        // Identify winner (supply=1 → 1 winner, 1 waitlisted)
        address winner = lp.isWinner(capLotId, p1) ? p1 : p2;

        // Winner purchases → ticketsMinted == 1 == supply
        vm.prank(winner); usdc.approve(address(lp), PRICE);
        vm.prank(winner); lp.purchase(capLotId);

        // Verify supply filled and invariant holds
        (, , , uint32 sv2, , , , uint32 m2, , , , ) = lp.getLot(capLotId);
        assertTrue(m2 <= sv2, "ticketsMinted must never exceed supply");
    }

    // ─── closeLot happy path ──────────────────────────────────────────────────

    function test_closeLot_byMerchant() public {
        _fullDrawWith2Winners();
        vm.prank(merchant);
        lp.closeLot(1);
        (, , , , , , LuckyPass.LotState state, , , , , ) = lp.getLot(1);
        assertEq(uint8(state), uint8(LuckyPass.LotState.CLOSED));
    }

    // ─── Time-gate tests (new) ────────────────────────────────────────────────

    /// 1. enter() before entryOpenAt → EntryNotYetOpen
    function test_enter_beforeOpenAt() public {
        uint64 openAt = uint64(block.timestamp + 1000);
        uint64 closeAt = uint64(block.timestamp + 2000);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Future Lot", "not open yet",
            PRICE, 1, WINDOW, uint32(100),
            openAt, closeAt, 0
        );

        vm.prank(alice);
        vm.expectRevert(LuckyPass.EntryNotYetOpen.selector);
        lp.enter(lotId);
    }

    /// 2. enter() after entryCloseAt → EntryAlreadyClosed
    function test_enter_afterCloseAt() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Closing Lot", "soon closed",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, 0
        );

        vm.warp(closeAt + 1);
        vm.prank(alice);
        vm.expectRevert(LuckyPass.EntryAlreadyClosed.selector);
        lp.enter(lotId);
    }

    /// 3. enter() at exact entryCloseAt boundary → EntryAlreadyClosed
    function test_enter_atExactCloseAt() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Boundary Lot", "exact close",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, 0
        );

        vm.warp(closeAt); // block.timestamp == closeAt → reverts
        vm.prank(alice);
        vm.expectRevert(LuckyPass.EntryAlreadyClosed.selector);
        lp.enter(lotId);
    }

    /// 4. requestDraw() before entryCloseAt → EntryNotClosed
    function test_requestDraw_beforeCloseAt() public {
        // block.timestamp < closeAt → draw should fail
        vm.prank(merchant);
        vm.expectRevert(LuckyPass.EntryNotClosed.selector);
        lp.requestDraw{value: VRF_FEE}(1); // LOT1_CLOSE_AT is 100s in the future
    }

    /// 5. requestDraw() at exact entryCloseAt → succeeds (strictly less than check)
    function test_requestDraw_atExactCloseAt() public {
        vm.warp(LOT1_CLOSE_AT); // block.timestamp == closeAt → draw allowed
        vm.prank(merchant);
        lp.requestDraw{value: VRF_FEE}(1); // should not revert
        (, , , , , , LuckyPass.LotState state, , , , , ) = lp.getLot(1);
        assertEq(uint8(state), uint8(LuckyPass.LotState.DRAWING));
    }

    /// 6. requestDraw() when block.timestamp >= fixedDeadlineAt - MIN_PROMOTE_LEAD → DeadlineAlreadyPassed
    function test_requestDraw_fixedDeadlinePassed() public {
        // Create a lot where fixedDeadlineAt is only 3600s after closeAt.
        // Once entries close, block.timestamp >= fixedAt - 3600 → revert.
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 50 + 3600); // fixedAt - 3600 == closeAt
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Fixed Lot", "deadline",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        // Warp to exactly fixedAt - 3600 (== closeAt): check fires
        vm.warp(closeAt);
        vm.prank(merchant);
        vm.expectRevert(LuckyPass.DeadlineAlreadyPassed.selector);
        lp.requestDraw{value: VRF_FEE}(lotId);
    }

    /// 7. createLot with fixedDeadlineAt <= entryCloseAt → DeadlineBeforeClose
    function test_createLot_fixedDeadlineBeforeClose() public {
        uint64 closeAt  = uint64(block.timestamp + 200);
        uint64 fixedAt  = uint64(block.timestamp + 100); // <= closeAt
        vm.prank(merchant);
        vm.expectRevert(LuckyPass.DeadlineBeforeClose.selector);
        lp.createLot(
            "Bad Deadline", "desc",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );
    }

    /// 8. createLot with entryCloseAt == 0 → LotNotOpen
    function test_createLot_missingCloseAt() public {
        vm.prank(merchant);
        vm.expectRevert(LuckyPass.LotNotOpen.selector);
        lp.createLot(
            "No Close", "desc",
            PRICE, 1, WINDOW, uint32(100),
            0, 0, 0 // entryCloseAt == 0 → revert
        );
    }

    /// 9. selectWinners with fixedDeadlineAt → paymentDeadline == fixedDeadlineAt
    function test_selectWinners_usesFixedDeadline() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 7 days);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Fixed Deadline Lot", "fixed",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        address p1 = makeAddr("fd_p1");
        usdc.mint(p1, 100e6);
        vm.prank(p1); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("fd-word"));
        lp.selectWinners(lotId);

        // paymentDeadline is set to fixedDeadlineAt exactly
        assertEq(lp.paymentDeadline(lotId, 0), fixedAt);
    }

    /// 10. selectWinners with fixedDeadlineAt == 0 → paymentDeadline == block.timestamp + paymentWindow
    function test_selectWinners_usesRelativeWindow() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Relative Lot", "relative",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, 0
        );

        address p1 = makeAddr("rel_p1");
        usdc.mint(p1, 100e6);
        vm.prank(p1); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("rel-word"));

        uint256 selectTs = block.timestamp;
        lp.selectWinners(lotId);

        assertEq(lp.paymentDeadline(lotId, 0), uint64(selectTs + WINDOW));
    }

    /// 11. promoteWaitlist on a fixed-deadline lot → always PromotionAfterDeadline
    ///     Promotion is fully disabled for fixed-deadline lots regardless of timing.
    function test_promoteWaitlist_afterFixedDeadline() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        // fixedAt far enough in the future so requestDraw & selectWinners work
        uint64 fixedAt = uint64(block.timestamp + 4 hours);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Fixed Promo Lot", "promo",
            PRICE, 2, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        vm.prank(alice); lp.enter(lotId);
        vm.prank(bob);   lp.enter(lotId);
        vm.prank(carol); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("promo-fixed"));
        lp.selectWinners(lotId);

        // Warp past paymentDeadline (== fixedAt) so DeadlineNotReached passes,
        // then immediately hit PromotionAfterDeadline (fixed-deadline lots never allow promotion)
        vm.warp(uint256(fixedAt) + 1);
        vm.expectRevert(LuckyPass.PromotionAfterDeadline.selector);
        lp.promoteWaitlist(lotId, 0);
    }

    /// 12. promoteWaitlist on a fixed-deadline lot mid-window → PromotionAfterDeadline
    ///     Promotion is fully disabled for fixed-deadline lots. Even at a timestamp
    ///     before fixedAt, any promote call immediately reverts PromotionAfterDeadline.
    ///     paymentDeadline[slot] == fixedAt, so DeadlineNotReached fires before 
    ///     PromotionAfterDeadline when block.timestamp <= fixedAt.
    function test_promoteWaitlist_tooLateForFixed() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 4 hours);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Too Late Lot", "promo2",
            PRICE, 2, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        vm.prank(alice); lp.enter(lotId);
        vm.prank(bob);   lp.enter(lotId);
        vm.prank(carol); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("too-late"));
        lp.selectWinners(lotId);

        // paymentDeadline[slot] == fixedAt (new behaviour).
        // Before fixedAt, DeadlineNotReached fires (block.timestamp <= paymentDeadline).
        // After fixedAt, DeadlineNotReached passes, then PromotionAfterDeadline fires.
        // Either way promotion is impossible on fixed-deadline lots.
        // Warp past fixedAt so DeadlineNotReached passes, then hit PromotionAfterDeadline.
        vm.warp(uint256(fixedAt) + 1);
        vm.expectRevert(LuckyPass.PromotionAfterDeadline.selector);
        lp.promoteWaitlist(lotId, 0);
    }

    /// 13. promoteWaitlist at and after fixedDeadlineAt boundary
    ///     paymentDeadline[slot] == fixedAt (new behaviour).
    ///     At block.timestamp == fixedAt: DeadlineNotReached passes (block.timestamp > paymentDeadline
    ///     is false since they are equal — wait, check is <=, so at equality DeadlineNotReached fires).
    ///     Actually: check is `block.timestamp <= paymentDeadline` → at equality it reverts DeadlineNotReached.
    ///     At fixedAt + 1: slot expired AND fixedDeadlineAt > 0 → PromotionAfterDeadline fires.
    function test_promoteWaitlist_atExactDeadline() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 4 hours);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Exact Deadline Lot", "exact",
            PRICE, 2, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        vm.prank(alice); lp.enter(lotId);
        vm.prank(bob);   lp.enter(lotId);
        vm.prank(carol); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("exact-dl"));
        lp.selectWinners(lotId);

        // At exact fixedAt: paymentDeadline == fixedAt, check is <= so DeadlineNotReached fires.
        vm.warp(fixedAt);
        vm.expectRevert(LuckyPass.DeadlineNotReached.selector);
        lp.promoteWaitlist(lotId, 0);

        // At fixedAt + 1: slot expired (block.timestamp > paymentDeadline), then PromotionAfterDeadline.
        vm.warp(uint256(fixedAt) + 1);
        vm.expectRevert(LuckyPass.PromotionAfterDeadline.selector);
        lp.promoteWaitlist(lotId, 0);
    }

    /// 14. promoteWaitlist relative mode → new paymentDeadline == block.timestamp + paymentWindow
    function test_promoteWaitlist_relativeGivesNewWindow() public {
        // Relative mode: fixedDeadlineAt == 0
        // Use lot 1 (WINDOW = 1 day, fixedDeadlineAt=0, closeAt=now+100)
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        vm.prank(carol); lp.enter(1);
        vm.prank(dave);  lp.enter(1);

        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("rel-promo"));
        lp.selectWinners(1);

        // Expire the initial deadline
        vm.warp(block.timestamp + WINDOW + 1);
        uint256 promoteTs = block.timestamp;
        lp.promoteWaitlist(1, 0);

        // New deadline should be promoteTs + WINDOW
        assertEq(lp.paymentDeadline(1, 0), uint64(promoteTs + WINDOW));
    }

    /// 15. Full lifecycle with fixedDeadlineAt
    function test_fullLifecycle_withFixedDeadline() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 7 days);

        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Fixed Full Lot", "full fixed lifecycle",
            PRICE, 2, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );
        vm.prank(merchant);
        lp.setVenueOperator(lotId, venue, true);

        vm.prank(alice); lp.enter(lotId);
        vm.prank(bob);   lp.enter(lotId);
        vm.prank(carol); lp.enter(lotId);
        vm.prank(dave);  lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("fixed-full"));
        lp.selectWinners(lotId);

        // Payment deadline for all slots should equal fixedAt exactly
        assertEq(lp.paymentDeadline(lotId, 0), fixedAt);
        assertEq(lp.paymentDeadline(lotId, 1), fixedAt);

        // Warp to 1 second before fixedAt to confirm purchases succeed
        vm.warp(uint256(fixedAt) - 1);

        // All winners buy before the deadline
        address[4] memory candidates = [alice, bob, carol, dave];
        uint32 minted;
        for (uint i = 0; i < 4; i++) {
            if (lp.isWinner(lotId, candidates[i])) {
                vm.prank(candidates[i]);
                usdc.approve(address(lp), PRICE);
                vm.prank(candidates[i]);
                lp.purchase(lotId);
                minted++;
            }
        }
        assertEq(minted, 2);

        // Merchant received payment
        assertEq(usdc.balanceOf(merchant), PRICE * 2);
    }

    // ─── New tests (selectWinners viability + purchase slot deadline) ─────────

    /// 16. selectWinners reverts DeadlineAlreadyPassed when block.timestamp >= fixedAt - MIN_PROMOTE_LEAD
    function test_selectWinners_fixedDeadlineViabilityCheck() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        // fixedAt far enough ahead to let entry + requestDraw succeed (need closeAt < fixedAt - 3600),
        // but we will warp to fixedAt - 3600 before calling selectWinners.
        uint64 fixedAt = uint64(block.timestamp + 4 hours);

        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Viability Lot", "viability check",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        address p1 = makeAddr("via_p1");
        usdc.mint(p1, 100e6);
        vm.prank(p1); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("via-word"));

        // Warp to exactly fixedAt - MIN_PROMOTE_LEAD (3600): viability check triggers
        vm.warp(uint256(fixedAt) - 3600);
        vm.expectRevert(LuckyPass.DeadlineAlreadyPassed.selector);
        lp.selectWinners(lotId);
    }

    /// 17. purchase at fixedAt - 1 (1 second before slot deadline) → succeeds
    function test_purchase_withinSlotDeadline() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 7 days);

        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Slot Deadline Lot", "within deadline",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        address p1 = makeAddr("sd_p1");
        usdc.mint(p1, 100e6);
        vm.prank(p1); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("sd-word"));
        lp.selectWinners(lotId);

        // slot deadline = fixedAt; warp to fixedAt - 1 (1s before expiry)
        vm.warp(uint256(fixedAt) - 1);
        vm.prank(p1);
        usdc.approve(address(lp), PRICE);
        vm.prank(p1);
        uint256 tokenId = lp.purchase(lotId); // should succeed
        assertEq(lp.ownerOf(tokenId), p1);
    }

    /// 18. purchase strictly after slot deadline → reverts DeadlineExpired
    ///     slot deadline = fixedAt; purchase() checks block.timestamp > paymentDeadline.
    ///     At exactly fixedAt, the check (== paymentDeadline) does NOT revert (strict > boundary).
    ///     At fixedAt + 1 (one second past), the check fires → DeadlineExpired.
    function test_purchase_afterSlotDeadline() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 7 days);

        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Slot Expired Lot", "after deadline",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        address p1 = makeAddr("asd_p1");
        usdc.mint(p1, 100e6);
        vm.prank(p1); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("asd-word"));
        lp.selectWinners(lotId);

        // slot deadline = fixedAt.
        // Warp to fixedAt + 1 (strictly past): block.timestamp > paymentDeadline → DeadlineExpired.
        vm.warp(uint256(fixedAt) + 1);
        vm.prank(p1);
        usdc.approve(address(lp), PRICE);
        vm.prank(p1);
        vm.expectRevert(LuckyPass.DeadlineExpired.selector);
        lp.purchase(lotId);
    }

    // ─── New tests: promotion disabled for fixed-deadline, closeLot from WORD_RECEIVED, new window ────

    /// 19. promoteWaitlist on fixed-deadline lot always reverts PromotionAfterDeadline
    ///     regardless of timing — promotion is fully disabled for fixed-deadline lots.
    function test_promoteWaitlist_fixedDeadline_alwaysReverts() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 4 hours);
        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Window Lot", "promo disabled",
            PRICE, 2, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        vm.prank(alice); lp.enter(lotId);
        vm.prank(bob);   lp.enter(lotId);
        vm.prank(carol); lp.enter(lotId);
        vm.prank(dave);  lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("win-window"));
        lp.selectWinners(lotId);

        // Before paymentDeadline (== fixedAt): DeadlineNotReached fires first
        vm.warp(uint256(fixedAt) - 1000);
        vm.expectRevert(LuckyPass.DeadlineNotReached.selector);
        lp.promoteWaitlist(lotId, 0);

        // After paymentDeadline (== fixedAt): PromotionAfterDeadline fires
        vm.warp(uint256(fixedAt) + 1);
        vm.expectRevert(LuckyPass.PromotionAfterDeadline.selector);
        lp.promoteWaitlist(lotId, 0);
    }

    /// 20. closeLot from WORD_RECEIVED state → merchant can close a stuck lot
    function test_closeLot_fromWordReceived() public {
        // Bring lot 1 to WORD_RECEIVED state
        vm.prank(alice); lp.enter(1);
        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("stuck-word"));

        (, , , , , , LuckyPass.LotState stateAfterWord, , , , , ) = lp.getLot(1);
        assertEq(uint8(stateAfterWord), uint8(LuckyPass.LotState.WORD_RECEIVED));

        // Merchant can close a WORD_RECEIVED lot
        vm.prank(merchant);
        lp.closeLot(1);

        (, , , , , , LuckyPass.LotState stateFinal, , , , , ) = lp.getLot(1);
        assertEq(uint8(stateFinal), uint8(LuckyPass.LotState.CLOSED));
    }

    /// 21. promoteWaitlist relative mode: promoted winner gets block.timestamp + paymentWindow
    ///     (not the original slot deadline)
    function test_promoteWaitlist_relativeMode_newWindow() public {
        // Use lot 1 (fixedDeadlineAt=0, WINDOW=1 day)
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        vm.prank(carol); lp.enter(1);
        vm.prank(dave);  lp.enter(1);

        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("rel-newwin"));
        lp.selectWinners(1);

        // Record original slot 0 deadline
        uint64 origDeadline = lp.paymentDeadline(1, 0);

        // Let slot 0 expire
        vm.warp(block.timestamp + WINDOW + 1);
        uint256 promoteTs = block.timestamp;

        lp.promoteWaitlist(1, 0);

        // New deadline should be promoteTs + WINDOW (not the original deadline)
        uint64 newDeadline = lp.paymentDeadline(1, 0);
        assertEq(newDeadline, uint64(promoteTs + WINDOW));
        assertTrue(newDeadline > origDeadline, "New window should extend past original");
    }

    // ─── New tests: boundary purchases, closeLot after VRF arrives late, relative promotion ───

    /// N1. purchase at block.timestamp == fixedDeadlineAt → succeeds (strict > check; equality is valid)
    function test_purchase_atExactFixedDeadline() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 7 days);

        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Exact Boundary Lot", "exact deadline purchase",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        address p1 = makeAddr("ebp1");
        usdc.mint(p1, 100e6);
        vm.prank(p1); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("eb-word"));
        lp.selectWinners(lotId);

        // paymentDeadline == fixedAt; check is block.timestamp > paymentDeadline (strict).
        // At exact equality, check is false → purchase SUCCEEDS (last valid second).
        vm.warp(fixedAt);
        vm.prank(p1);
        usdc.approve(address(lp), PRICE);
        vm.prank(p1);
        uint256 tokenId = lp.purchase(lotId); // should succeed at exact boundary
        assertEq(lp.ownerOf(tokenId), p1);
    }

    /// N2. purchase at fixedDeadlineAt - 1 → succeeds
    function test_purchase_oneSecondBeforeFixedDeadline() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 7 days);

        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "One Before Lot", "1s before deadline",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        address p1 = makeAddr("obp1");
        usdc.mint(p1, 100e6);
        vm.prank(p1); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);
        coord.deliverRandomness(rid, keccak256("ob-word"));
        lp.selectWinners(lotId);

        vm.warp(uint256(fixedAt) - 1);
        vm.prank(p1);
        usdc.approve(address(lp), PRICE);
        vm.prank(p1);
        uint256 tokenId = lp.purchase(lotId);
        assertEq(lp.ownerOf(tokenId), p1);
    }

    /// N3. VRF word arrives after fixedAt - 3600 → selectWinners reverts DeadlineAlreadyPassed →
    ///     merchant can still close via closeLot (WORD_RECEIVED state accepted by closeLot).
    function test_closeLot_afterFixedDeadlinePass_wordReceived() public {
        uint64 closeAt = uint64(block.timestamp + 50);
        uint64 fixedAt = uint64(block.timestamp + 4 hours);

        vm.prank(merchant);
        uint256 lotId = lp.createLot(
            "Late VRF Lot", "word arrives too late",
            PRICE, 1, WINDOW, uint32(100),
            0, closeAt, fixedAt
        );

        address p1 = makeAddr("lv_p1");
        usdc.mint(p1, 100e6);
        vm.prank(p1); lp.enter(lotId);
        vm.warp(closeAt);

        uint256 rid = _requestDrawLot(lotId);

        // VRF word arrives after fixedAt - 3600 (too late for selectWinners)
        vm.warp(uint256(fixedAt) - 3600 + 1);
        coord.deliverRandomness(rid, keccak256("late-vrf-word"));

        // Lot is now in WORD_RECEIVED state
        (, , , , , , LuckyPass.LotState stateWR, , , , , ) = lp.getLot(lotId);
        assertEq(uint8(stateWR), uint8(LuckyPass.LotState.WORD_RECEIVED));

        // selectWinners reverts DeadlineAlreadyPassed
        vm.expectRevert(LuckyPass.DeadlineAlreadyPassed.selector);
        lp.selectWinners(lotId);

        // Merchant can still close the lot from WORD_RECEIVED state
        vm.prank(merchant);
        lp.closeLot(lotId);

        (, , , , , , LuckyPass.LotState stateClosed, , , , , ) = lp.getLot(lotId);
        assertEq(uint8(stateClosed), uint8(LuckyPass.LotState.CLOSED));
    }

    /// N4. promoteWaitlist relative mode still works after contract change
    function test_promoteWaitlist_relativeMode_stillWorks() public {
        // lot 1 is relative mode (fixedDeadlineAt == 0, WINDOW == 1 day)
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        vm.prank(carol); lp.enter(1);
        vm.prank(dave);  lp.enter(1);

        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("rel-still-works"));
        lp.selectWinners(1);

        // Let slot 0 deadline expire
        vm.warp(block.timestamp + WINDOW + 1);
        uint256 promoteTs = block.timestamp;

        // Promotion succeeds in relative mode
        lp.promoteWaitlist(1, 0);

        // waitlist head advanced
        assertEq(lp.waitlistHead(1), 1);

        // New deadline set to promoteTs + paymentWindow
        assertEq(lp.paymentDeadline(1, 0), uint64(promoteTs + WINDOW));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// @dev requestDraw for lot 1 as the merchant (lot 1's merchantAddress).
    ///      Warps past LOT1_CLOSE_AT first if needed.
    function _requestDraw() internal returns (uint256) {
        if (block.timestamp < LOT1_CLOSE_AT) {
            vm.warp(LOT1_CLOSE_AT);
        }
        return _requestDrawLot(1);
    }

    /// @dev requestDraw for any lot as its merchant
    function _requestDrawLot(uint256 lotId) internal returns (uint256 rid) {
        // Determine the merchant for this lot
        (, , , , , address lotMerchant, , , , , , ) = lp.getLot(lotId);
        // Ensure the merchant has ETH for the fee
        if (lotMerchant.balance < VRF_FEE) {
            vm.deal(lotMerchant, 1 ether);
        }
        vm.recordLogs();
        vm.prank(lotMerchant);
        lp.requestDraw{value: VRF_FEE}(lotId);
        // Pull requestId from the DrawRequested event
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint i = 0; i < logs.length; i++) {
            // DrawRequested(uint256 indexed lotId, uint256 vrfRequestId)
            if (logs[i].topics[0] == keccak256("DrawRequested(uint256,uint256)")) {
                rid = abi.decode(logs[i].data, (uint256));
                return rid;
            }
        }
        revert("DrawRequested event not found");
    }

    function _fullDrawWith2Winners() internal {
        vm.prank(alice); lp.enter(1);
        vm.prank(bob);   lp.enter(1);
        uint256 rid = _requestDraw();
        coord.deliverRandomness(rid, keccak256("2winners"));
        lp.selectWinners(1);
    }

    function _getFirstWinner() internal view returns (address) {
        // Return the winner in slot 0
        return lp.lotWinner(1, 0);
    }

    function _approvePurchase(address who) internal {
        vm.prank(who);
        usdc.approve(address(lp), PRICE);
    }
}
