import "../single-feed-man/single-feed-man";

contract SampleConsumer(
    feedId: Int as uint256,
    lastFetchedPriceData: PriceData,
    priceFeed: Address,
) {
    receive() {
        message(MessageParameters {
            value: 0,
            to: self.priceFeed,
            bounce: false,
            mode: SendRemainingValue | SendBounceIfActionFail,
            body: ReadPrice {
                feedId: self.feedId,
            }.toCell(),
        });
    }

    receive(msg: PriceResponse) {
        require(sender() == self.priceFeed, "Only price feed can send price response");
        require(msg.feedId == self.feedId, "Feed ID mismatch");

        self.lastFetchedPriceData = msg.priceData;
    }

    get fun lastFetchedPriceData(): PriceData {
        return self.lastFetchedPriceData;
    }
}
