import "../impl/basic/messages";
import "./tep-89-proofer";

// CALLCC resets c0 and c1 to default quit-cont (extraordinary continuation),
// so after implicit RET we will call quit-cont
asm fun exit() { <{ }> PUSHCONT CALLCC }

extends mutates fun resolveEitherSliceRef(self: Slice) {
    if (self.loadBit()) {
        let ref = self.loadRef();
        self.endParse();
        self = ref.asSlice();
    }
}

extends mutates fun normalizeForwardPayload(self: JettonNotification) {
    self.forwardPayload.resolveEitherSliceRef();
}

trait UseJetton {
    jettonMaster: Address;
    jettonWallet: Address?; // Should be deployed with null

    receive(msg: JettonNotification) {
        if (self.jettonWallet == null) {
            let action = inMsg().asCell();
            // This function proofs that jetton wallet is valid
            // This function throws if proof is invalid
            let prooferStateInit = initOf TEP89Proofer(
                self.jettonMaster,
                myAddress(),
                sender(),
                action,
            );

            deploy(DeployParameters {
                mode: SendRemainingValue,
                value: 0,
                // Doesn't really matter, so just for consistency - all internal protocol messages are not bounceable
                bounce: false,
                init: prooferStateInit,
                body: TEP89ProofRequest {
                    jettonMaster: self.jettonMaster,
                    possibleJettonWallet: sender(),
                    action,
                }.toCell(),
            });
            // We don't need to save state init, so we just need to exit() quickly
            exit();
        }

        require(sender() == self.jettonWallet, "JettonVault: Sender must be jetton wallet");

        msg.normalizeForwardPayload();
        self.receiveJettonHandler(msg);
    }

    // We will receive this message only if TEP-89 proofer will successfully validate jettonWallet
    receive(msg: TEP89ProofResponse) {
        let prooferStateInit = initOf TEP89Proofer(self.jettonMaster, myAddress(), msg.proofedJettonWallet, msg.action);
        require(prooferStateInit.hasSameBasechainAddress(sender()), "JettonVault: Sender must be a valid proofer");
        self.jettonWallet = msg.proofedJettonWallet;

        let jettonNotification = JettonNotification.fromCell(msg.action);
        jettonNotification.normalizeForwardPayload();
        self.receiveJettonHandler(jettonNotification);
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

    abstract inline fun receiveJettonHandler(msg: JettonNotification);
}
