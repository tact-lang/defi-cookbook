// VENDOR LOCK
// https://github.com/tact-lang/dex/blob/01d2e9fc19a74dbedbb839d835a597822c64da0e/sources/contracts/vaults/proofs/tep-89-discovery-proxy.tact

import "../impl/basic/messages";

/// TEP89DiscoveryResult Message
///
/// Response message sent by the discovery proxy back to the `discoveryRequester`
/// after completing the wallet discovery process, whether successful or failed.
///
/// Fields:
/// • `discoveryId` – unique identifier echoed from the proxy; the requester
///   recomputes the StateInit locally and verifies that the sender has the same
///   basechain address, ensuring the message originates from the expected proxy
/// • `expectedJettonWallet` – the wallet address initially provided by the
///   requester (from the original notification sender)
/// • `actualJettonWallet` – the verified wallet address returned by the jetton
///   master, or `null` if discovery failed
/// • `action` – the original `JettonNotification` preserved as a Cell for
///   re-processing after validation
message(0x7a1267fd) TEP89DiscoveryResult {
    discoveryId: Int as uint64;
    expectedJettonWallet: Address;
    actualJettonWallet: Address?;
    action: Cell;
}

/// TEP89DiscoveryProxy Contract
/// ----------------------------
/// A lightweight helper contract for jetton wallet address discovery using the
/// TEP-89 standard. The canonical `ProvideWalletAddress` request does not support
/// arbitrary forward payloads, but the `UseJetton` trait needs to preserve the
/// original `JettonNotification` during the discovery process.
///
/// This single-use proxy contract solves this limitation by storing the original
/// notification and managing the discovery workflow independently.
///
/// Lifecycle:
/// 1. `receive()` – forwards `ProvideWalletAddress` request to the jetton master
/// 2. `receive(TakeWalletAddress)` – successful discovery path, sends result and self-destructs
/// 3. `bounced(ProvideWalletAddress)` – failed discovery path, sends result with null address
///
/// Parameters:
/// • `jettonMaster` – address of the Jetton Master contract that manages wallets
/// • `discoveryRequester` – contract that deployed this proxy and awaits the result
/// • `expectedJettonWallet` – wallet address claimed by the original notification sender
/// • `action` – the original `JettonNotification` wrapped as a Cell for preservation
/// • `discoveryId` – unique salt (typically `curLt()`) ensuring unique contract addresses
///
/// The contract automatically self-destructs after delivering results, preventing
/// storage rent accumulation.
///
/// Reference: https://github.com/ton-blockchain/TEPs/blob/master/text/0089-jetton-standard.md
contract TEP89DiscoveryProxy(
    jettonMaster: Address,
    discoveryRequester: Address,
    expectedJettonWallet: Address,
    action: Cell, // Original JettonNotification stored as Cell for efficiency
    discoveryId: Int as uint64, // Unique discovery identifier
) {
    /// Initiates the discovery process immediately after deployment.
    ///
    /// Validates that the caller is the expected `discoveryRequester` and sends
    /// a `ProvideWalletAddress` message to the jetton master. The proxy forwards
    /// all remaining value while retaining only the minimum required for operation.
    receive() {
        require(sender() == self.discoveryRequester, "TEP89 proxy: Sender must be the discovery requester");

        // Request wallet address from jetton master
        message(MessageParameters {
            to: self.jettonMaster,
            bounce: true, // So we can save some tons (we won't pay storage fees for JettonMaster)
            value: 0,
            mode: SendRemainingValue,
            body: ProvideWalletAddress {
                queryId: 0,
                ownerAddress: self.discoveryRequester,
                includeAddress: false,
            }.toCell(),
        });
    }

    /// Handles successful wallet address discovery.
    ///
    /// Validates that the response originates from the jetton master, packages
    /// the discovery result, and sends it to the requester. The proxy then
    /// transfers its remaining balance and self-destructs to free resources.
    receive(msg: TakeWalletAddress) {
        require(sender() == self.jettonMaster, "TEP89 proxy: TakeWalletAddress must be sent by the jetton master");

        // Send successful discovery result to requester
        message(MessageParameters {
            to: self.discoveryRequester,
            bounce: false,
            value: 0,
            mode: SendRemainingBalance | SendDestroyIfZero,
            body: TEP89DiscoveryResult {
                discoveryId: self.discoveryId,
                expectedJettonWallet: self.expectedJettonWallet,
                actualJettonWallet: msg.walletAddress,
                action: self.action,
            }.toCell(),
        });
    }

    /// Handles failed wallet address discovery.
    ///
    /// This bounce handler is invoked when the jetton master cannot provide
    /// the requested wallet address. The proxy sends a discovery result with
    /// `actualJettonWallet` set to `null`, allowing the requester to distinguish
    /// between successful and failed discovery attempts. The proxy still
    /// self-destructs to prevent resource leaks.
    bounced(msg: bounced<ProvideWalletAddress>) {
        // Send failed discovery result to requester
        message(MessageParameters {
            to: self.discoveryRequester,
            bounce: false,
            value: 0,
            mode: SendRemainingBalance | SendDestroyIfZero,
            body: TEP89DiscoveryResult {
                discoveryId: self.discoveryId,
                expectedJettonWallet: self.expectedJettonWallet,
                actualJettonWallet: null,
                action: self.action,
            }.toCell(),
        });
    }
}
