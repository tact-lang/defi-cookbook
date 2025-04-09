import "../impl/governance/messages.tact";

/// Struct that represents Governance (USDT) Jetton Wallet state init. It's used to calculate the address of the Jetton Wallet
///
/// This struct is different from the Tact standard Jetton Wallet state init, as it includes the `status` field, that is used for
/// Governance mechanism.
struct GovernanceJettonWalletStateInit {
    status: Int as uint4 = 0;
    balance: Int as coins = 0;
    owner: Address;
    minter: Address;
}

/// The only difference between receiving the Tact Jetton (basic) and the Governance Jetton (USDT) is the `status` field in Governance State Init,
/// that changes how we calculate the address of the Governance Jetton Wallet.
///
/// The res of the code is the same as the Tact Jetton Receiver.
contract JettonReceiverGovernance(
    minterAddress: Address,
    jettonWalletCode: Cell,
    amountChecker: Int as coins,
    payloadChecker: Slice,
) {
    inline fun getGovernanceJettonWalletStateInit(owner: Address): Cell {
        return GovernanceJettonWalletStateInit {
            owner,
            minter: self.minterAddress,
        }.toCell();
    }

    inline fun calculateJettonWalletAddress(owner: Address): Address {
        let initData = self.getGovernanceJettonWalletStateInit(owner);
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
