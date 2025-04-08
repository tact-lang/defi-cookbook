import "../impl/basic/messages.tact";

/// Struct that represents Tact Jetton Wallet state init. It's used to calculate the address of the Jetton Wallet
///
/// Different Jettons implementations may have different state init structures. For example, Governance Jetton Wallet (USDT)
/// has this:
/// ```tact
/// struct GovernanceJettonWalletStateInit {
///     status: Int as uint4 = 0,
///     balance: Int as coins = 0,
///     owner: Address,
///     master: Address,
/// }
/// ```
struct TactJettonWalletStateInit {
    balance: Int as coins = 0;
    owner: Address;
    minter: Address;
}

contract JettonReceiver(
    minterAddress: Address,
    jettonWalletCode: Cell,
    amountChecker: Int as coins,
    payloadChecker: Slice,
) {
    inline fun getTactJettonWalletStateInit(owner: Address): Cell {
        return TactJettonWalletStateInit {
            owner,
            minter: self.minterAddress,
        }.toCell();
    }

    inline fun calculateJettonWalletAddress(owner: Address): Address {
        let initData = self.getTactJettonWalletStateInit(owner);
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
