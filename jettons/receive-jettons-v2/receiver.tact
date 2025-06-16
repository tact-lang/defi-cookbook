import "../impl/basic/messages";
import "../use-jetton/use-jetton";

/// JettonReceiver Contract
/// ----------------------
/// A demonstration contract that integrates the `UseJetton` trait to receive
/// jetton transfers securely. This contract accumulates received jetton amounts
/// and preserves transfer payloads for testing and verification purposes.
///
/// The contract serves as a practical example of `UseJetton` integration,
/// showing the minimal implementation required to handle jetton transfers.
contract JettonReceiver(
    // Required variables for UseJetton trait
    jettonMaster: Address,
    jettonWallet: Address?, // Must be null during deployment
    // Testing and verification variables
    amountChecker: Int as coins,
    payloadChecker: Slice,
) with UseJetton {
    /// Handler for validated jetton transfer notifications.
    ///
    /// This method is invoked by the `UseJetton` trait after the jetton wallet
    /// address has been discovered and the incoming transfer has passed all
    /// security validations.
    ///
    /// The implementation accumulates the received amount and stores the
    /// forward payload for testing purposes.
    override fun receiveJettonHandler(msg: JettonNotification) {
        self.amountChecker += msg.amount;
        self.payloadChecker = msg.forwardPayload;
        return;
    }

    /// Accepts the initial deployment message.
    /// All subsequent message validation is handled automatically by the trait.
    receive() {}

    /// Returns the cumulative amount of jettons received.
    /// Used for testing and verification.
    get fun amountChecker(): Int {
        return self.amountChecker;
    }

    /// Returns the most recent forward payload received.
    /// Used for testing and verification.
    get fun payloadChecker(): Slice {
        return self.payloadChecker;
    }
}
