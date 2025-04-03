import "../impl/messages.tact";

struct TactJettonWalletStorage {
    balance: Int as coins;
    owner: Address;
    minter: Address;
}

contract JettonReceiver(
    minterAddress: Address,
    jettonWalletCode: Cell,
    amountChecker: Int as coins,
    payloadChecker: Slice,
) {
    inline fun createJettonWalletInitData(owner: Address): Cell {
        return TactJettonWalletStorage {
            balance: 0,
            owner,
            minter: self.minterAddress,
        }.toCell();
    }

    inline fun calculateJettonWalletAddress(owner: Address): Address {
        let initData = self.createJettonWalletInitData(owner);
        return contractAddress(StateInit { code: self.jettonWalletCode, data: initData });
    }

    receive(msg: JettonNotification) {
        let thisContractJettonWallet = self.calculateJettonWalletAddress(
            myAddress(),
        );

        // Check if the sender is our jetton wallet, if not, reject the message
        require(sender() == thisContractJettonWallet, "Incorrect sender");

        // Handle incoming jetton transfer as needed by your contract logic
        // You can add your own logic here, such as updating balances or triggering events
        self.amountChecker += msg.amount;
        self.payloadChecker = msg.forwardPayload;
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
