import "./tep-89-discovery-proxy";

/// UseJetton Trait
/// ---------------
/// The `UseJetton` trait encapsulates the implementation required for contracts
/// to correctly accept incoming jetton transfers and determine the corresponding
/// jetton wallet address during the first transfer.
///
/// The trait uses a lightweight helper contract (`TEP89DiscoveryProxy`) to perform
/// wallet address discovery via the standard TEP-89 protocol. This approach is
/// necessary because the original TEP-89 `ProvideWalletAddress` message does not
/// support arbitrary forward payloads that need to be preserved for the receiver.
///
/// After wallet address discovery, the trait stores the address in `jettonWallet`
/// and forwards all valid `JettonNotification` messages to the `receiveJettonHandler`
/// callback that the implementing contract must provide. The trait automatically
/// protects against malicious messages by refunding jettons from unauthorized
/// senders or wallets that do not match the discovered address.
trait UseJetton {
    jettonMaster: Address;
    jettonWallet: Address?; // Must be deployed with null value

    /// Entry point for JettonNotification messages
    ///
    /// FIRST TRANSFER:
    /// When `jettonWallet` is not initialized, the trait cannot verify the
    /// sender address. Instead of using unreliable address calculation methods,
    /// the trait deploys a `TEP89DiscoveryProxy` that queries the Jetton Master
    /// using the canonical TEP-89 protocol. The proxy preserves the original
    /// notification and returns it after address discovery.
    ///
    /// SUBSEQUENT TRANSFERS:
    /// For all subsequent calls, the trait verifies the `sender()` against the
    /// cached `jettonWallet` address and either:
    /// • Processes the notification if the sender is valid
    /// • Refunds the jettons and terminates execution if the sender is invalid
    receive(msg: JettonNotification) {
        if (self.jettonWallet == null) {
            let action = inMsg().asCell();
            // Deploy discovery proxy to validate jetton wallet address
            let prooferStateInit = initOf TEP89DiscoveryProxy(
                self.jettonMaster,
                myAddress(),
                sender(),
                action,
                curLt(),
            );

            deploy(DeployParameters {
                mode: SendRemainingValue,
                value: 0,
                // Internal protocol messages are not bounceable for consistency
                bounce: false,
                init: prooferStateInit,
            });
            stopExecution();
        }

        // Refund jettons if sender address does not match discovered wallet
        if (sender() != self.jettonWallet) {
            message(MessageParameters {
                mode: SendRemainingValue | SendIgnoreErrors,
                body: JettonTransfer {
                    queryId: msg.queryId,
                    amount: msg.amount,
                    destination: msg.sender,
                    responseDestination: msg.sender,
                    customPayload: null,
                    forwardTonAmount: 1,
                    forwardPayload: emptyForwardPayload(),
                }.toCell(),
                value: 0,
                to: sender(),
                bounce: true,
            });
            stopExecution();
        }

        msg.normalizeForwardPayload();
        self.receiveJettonHandler(msg);
    }

    receive(msg: TEP89DiscoveryResult) {
        let proxyStateInit = initOf TEP89DiscoveryProxy(
            self.jettonMaster,
            myAddress(),
            msg.expectedJettonWallet,
            msg.action,
            msg.discoveryId,
        );
        require(
            proxyStateInit.hasSameBasechainAddress(sender()),
            "UseJetton: Sender must be a valid TEP-89 proxy",
        );

        let jettonNotification = JettonNotification.fromCell(msg.action);
        jettonNotification.normalizeForwardPayload();

        if (msg.expectedJettonWallet == msg.actualJettonWallet) {
            self.jettonWallet = msg.actualJettonWallet;
            self.receiveJettonHandler(jettonNotification);
            return;
        } else {
            message(MessageParameters {
                mode: SendRemainingValue | SendIgnoreErrors,
                body: JettonTransfer {
                    queryId: jettonNotification.queryId,
                    amount: jettonNotification.amount,
                    destination: jettonNotification.sender,
                    responseDestination: jettonNotification.sender,
                    customPayload: null,
                    forwardTonAmount: 1,
                    forwardPayload: emptyForwardPayload(),
                }.toCell(),
                value: 0,
                to: msg.expectedJettonWallet,
                bounce: true,
            });
            return;
        }
    }

    get fun jettonWalletInited(): Bool {
        return self.jettonWallet != null;
    }

    get fun jettonWallet(): Address? {
        return self.jettonWallet;
    }

    get fun jettonMaster(): Address {
        return self.jettonMaster;
    }

    /// Jetton Transfer Handler
    ///
    /// This callback is the only method required for trait implementation. It is
    /// guaranteed to be invoked when all of the following conditions are met:
    /// • The jetton wallet address has been discovered and stored
    /// • The message sender matches the stored wallet address
    /// • The forward payload has been normalized for immediate consumption
    /// • All validation logic has completed successfully
    ///
    /// This method represents a "confirmed deposit" event. Implement your business
    /// logic here (balance updates, event emissions, etc.).
    abstract inline fun receiveJettonHandler(msg: JettonNotification);
}

/// Forward Payload Normalization
///
/// TEP-74 (Section 3.1 Jetton Transfer) specifies that `forward_payload` may be
/// delivered in two different wire formats:
/// 1. Inline format: First bit is `0`, remaining bits contain the payload
/// 2. Reference format: First bit is `1` followed by a reference containing the payload
///
/// The `JettonNotification` structure exposes `forwardPayload` in its raw format,
/// requiring application code to handle both variants manually. This would result
/// in repetitive validation code:
///
/// ```tact
/// if (notification.forwardPayload.loadBit()) {
///     let ref = notification.forwardPayload.loadRef();
///     notification.forwardPayload.endParse();
///     notification.forwardPayload = ref.asSlice();
/// }
/// ```
///
/// Additionally, Tact's type system does not support pattern matching on slice
/// content, preventing the use of enums for type-safe variant handling.
///
/// This helper function normalizes `forwardPayload` in-place, ensuring the slice
/// always points to the actual payload content regardless of the original encoding.
extends mutates fun normalizeForwardPayload(self: JettonNotification) {
    if (self.forwardPayload.loadBit()) {
        let ref = self.forwardPayload.loadRef();
        self.forwardPayload.endParse();
        self.forwardPayload = ref.asSlice();
    }
}

/// Low-level Utility Functions

/// Optimized execution termination without state persistence.
///
/// Unlike the high-level `return` statement, this function does not trigger
/// the implicit state save operation that Tact inserts at exit points. This
/// optimization is safe when the contract state remains unchanged. The function
/// creates an empty continuation and performs `CALLCC`, transferring control
/// to the default quit continuation and saving gas costs for unchanged state
/// serialization.
asm fun stopExecution() { <{ }> PUSHCONT CALLCC }

/// Creates an empty inline forward payload.
///
/// Produces a single-bit slice `b{0}` representing "inline payload, but empty".
/// According to TEP-74, this is the standard method for indicating no payload
/// when the receiver expects the inline variant (bit = 0).
///
/// This approach is more efficient than creating a separate cell, as the
/// ready-made slice avoids additional VM operations and saves approximately
/// 500 gas units per call.
asm fun emptyForwardPayload(): Slice {
    b{0} PUSHSLICE
}
