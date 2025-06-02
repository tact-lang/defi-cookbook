import "./tep-89-discovery-proxy";

// CALLCC resets c0 and c1 to default quit-cont (extraordinary continuation),
// so after implicit RET we will call quit-cont
asm fun exit() { <{ }> PUSHCONT CALLCC }

asm fun sliceWithOneZeroBit(): Slice {
    b{0} PUSHSLICE
}

extends mutates fun normalizeForwardPayload(self: JettonNotification) {
    if (self.forwardPayload.loadBit()) {
        let ref = self.forwardPayload.loadRef();
        self.forwardPayload.endParse();
        self.forwardPayload = ref.asSlice();
    }
}

trait UseJetton {
    jettonMaster: Address;
    jettonWallet: Address?; // Should be deployed with null

    receive(msg: JettonNotification) {
        if (self.jettonWallet == null) {
            let action = inMsg().asCell();
            // This function proofs that jetton wallet is valid
            // This function throws if proof is invalid
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
                // Doesn't really matter, so just for consistency - all internal protocol messages are not bounceable
                bounce: false,
                init: prooferStateInit,
            });
            // We don't need to save state init, so we just need to exit() quickly
            exit();
        }

        // Maybe someone messed up with address, so let's try to send jettons back
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
                    forwardPayload: sliceWithOneZeroBit(),
                }.toCell(),
                value: 0,
                to: sender(),
                bounce: true,
            });
            commit();
            require(false, "UseJetton: Sender must be jetton wallet");
        }

        msg.normalizeForwardPayload();
        self.receiveJettonHandler(msg);
    }

    receive(msg: TEP89DiscoveryResult) {
        let proxyStateInit = initOf TEP89DiscoveryProxy(self.jettonMaster, myAddress(), msg.expectedJettonWallet, msg.action, msg.discoveryId);
        require(proxyStateInit.hasSameBasechainAddress(sender()), "UseJetton: Sender must be a valid TEP-89 proxy");

        let jettonNotification = JettonNotification.fromCell(msg.action);
        jettonNotification.normalizeForwardPayload();

        if (msg.expectedJettonWallet == msg.actualJettonWallet) {
            self.jettonWallet = msg.actualJettonWallet;
            self.receiveJettonHandler(jettonNotification);
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
                    forwardPayload: sliceWithOneZeroBit(),
                }.toCell(),
                value: 0,
                to: msg.expectedJettonWallet,
                bounce: true,
            });
            commit();
            require(false, "UseJetton: Expected and Actual wallets are not equal");
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

    abstract inline fun receiveJettonHandler(msg: JettonNotification);
}
