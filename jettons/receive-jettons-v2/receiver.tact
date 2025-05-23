import "../impl/basic/messages";
import "../use-jetton/use-jetton";

contract JettonReceiver(
    // variables for UseJetton trait
    jettonMaster: Address,
    jettonWallet: Address?, // should be null during deploy
    //
    amountChecker: Int as coins,
    payloadChecker: Slice,
) with UseJetton {
    override fun receiveJettonHandler(msg: JettonNotification) {
        self.amountChecker += msg.amount;
        self.payloadChecker = msg.forwardPayload;
        return;
    }

    // deploy
    receive() {}

    // for testing
    get fun amountChecker(): Int {
        return self.amountChecker;
    }

    get fun payloadChecker(): Slice {
        return self.payloadChecker;
    }
}
