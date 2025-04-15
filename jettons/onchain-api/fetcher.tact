import "../impl/basic/messages.tact";

message(0x9de952d9) FetchJettonAddressOnChain {
    ownerAddress: Address;
    jettonMinterAddress: Address;
}

message(0xf2300ed) FetchJettonBalanceOnChain {
    jettonWalletAddress: Address;
}

contract Fetcher(
    requests: map<Address, Bool>,
    verifiedAddresses: map<Address, Address>,
    latestFetchedBalance: Int,
) {
    // in this receiver we send on-chain request to minter
    receive(msg: FetchJettonAddressOnChain) {
        // we need map to store the requests and later verify the responses
        self.requests.set(msg.jettonMinterAddress, true);

        message(MessageParameters {
            to: msg.jettonMinterAddress,
            value: 0,
            body: ProvideWalletAddress {
                queryId: 0,
                includeAddress: true,
                ownerAddress: msg.ownerAddress,
            }.toCell(),
            mode: SendRemainingValue,
        });
    }

    // receiver for the response from the jetton minter;
    // the message is defined in the tep-89
    receive(msg: TakeWalletAddress) {
        require(self.requests.get(sender()), "Request not found");
        let _ = self.requests.del(sender());

        let jettonWalletAddress = msg.walletAddress;
        // here we can do something with the jetton wallet address
        // for example, we can use it to send or receive jettons from this wallet, or some other logic

        // let jettonOwnerCell = msg.ownerAddress.beginParse().loadMaybeRef();
        let jettonOwner = msg.ownerAddress!!.beginParse().loadAddress();
        // map <jettonOwnerAddress> -> <jettonWalletAddress>
        self.verifiedAddresses.set(jettonOwner, jettonWalletAddress);
    }

    receive(msg: FetchJettonBalanceOnChain) {
        message(MessageParameters {
            to: msg.jettonWalletAddress,
            value: 0,
            body: ProvideWalletBalance {
                receiver: myAddress(),
                includeVerifyInfo: true,
            }.toCell(),
            mode: SendRemainingValue,
        });
    }

    // beware, that in general case, while the jetton balance response will reach
    // your contract, balance of this jetton could potentially change
    receive(msg: TakeWalletBalance) {
        let jettonBalance = msg.balance;

        // here you can either use msg.verifyInfo to proof this balance
        // or trust the specific jetton addresses and use this info in your logic
        self.latestFetchedBalance = jettonBalance;
    }

    // deploy
    receive() {}

    get fun getKnownJettonOwners(): map<Address, Address> {
        return self.verifiedAddresses;
    }

    get fun lastFetchedBalance(): Int {
        return self.latestFetchedBalance;
    }
}
