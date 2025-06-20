import "./crypto";
import "./utils";
import "./fake-tuple";

message(0xAB0BA_0) UpdatePrice {
    feedId: Int as uint256;
    dataPackages: Slice as remaining;
}

message(0xAB0BA_1) ReadPrice {
    feedId: Int as uint256;
}

message(0xAB0BA_2) PriceResponse {
    feedId: Int as uint256;
    priceData: PriceData;
}

contract SingleFeedMan(
    // Feed ID to read from Redstone
    storedFeedId: Int as uint256,
    // // Info for checking signatures
    signers: Cell,
    signerCountThreshold: Int as uint8,
    // // Last updated price
    lastPriceData: PriceData,
) {
    receive() {}

    inline fun sendPriceResponse() {
        message(MessageParameters {
            value: 0,
            to: sender(),
            bounce: false,
            mode: SendRemainingValue | SendBounceIfActionFail,
            body: PriceResponse {
                feedId: self.storedFeedId,
                priceData: self.lastPriceData,
            }.toCell(),
        });
    }

    receive(msg: UpdatePrice) {
        require(msg.feedId == self.storedFeedId, "Feed ID mismatch");
        let priceData = self.priceData(msg.dataPackages);
        self.lastPriceData = priceData;
        self.sendPriceResponse();
    }

    receive(msg: ReadPrice) {
        require(msg.feedId == self.storedFeedId, "Feed ID mismatch");
        self.sendPriceResponse();
    }

    get fun lastPriceData(): PriceData {
        return self.lastPriceData;
    }

    get fun priceData(dataPackages: Slice): PriceData {
        let length = dataPackages.loadUint(16);

        let signersTuple = self.signers.toTuple();
        let pricesTuple = emptyTuple();
        let minTimestamp = 0xFFFFFFFFFFFFFFFF;

        repeat (length) {
            let snakeCell = dataPackages.loadRef();
            let PackagesSnake { signedPackage, cont } = PackagesSnake.fromCell(snakeCell);
            dataPackages = cont;

            let SignedDataPackageStruct { index, signature, data: dataPackage } = signedPackage;
            let DataPackageStruct { dataFeedId, price, timestamp } = dataPackage.loadDataPackage();

            let timestampIsValid = (now() - timestamp).inRange(-MAX_AHEAD_SECONDS, MAX_DELAY_SECONDS);
            let feedIdIsValid = dataFeedId == self.storedFeedId;
            let signIsValid = signersTuple.atInt(index) == recoverAddress(dataPackage.keccak(), signature);

            if (timestampIsValid && feedIdIsValid && signIsValid) {
                pricesTuple.pushInt(price);
                minTimestamp = min(minTimestamp, timestamp);
            }
        }

        require(pricesTuple.length() >= self.signerCountThreshold, "Not enough valid packages");
        require(minTimestamp > self.lastPriceData.timestamp, "Timestamp is not greater than last timestamp");

        let median = pricesTuple.median();

        return PriceData {
            timestamp: minTimestamp,
            price: median,
        };
    }

    get fun signers(): Cell {
        return self.signers;
    }

    get fun feedId(): Int {
        return self.storedFeedId;
    }
}

struct SignedDataPackageStruct {
    index: Int as uint16;
    signature: EcdsaSignature;
    data: Slice;
}

struct PackagesSnake {
    signedPackage: SignedDataPackageStruct;
    cont: Slice as remaining;
}

struct DataPackageStruct {
    timestamp: Int as uint48;
    dataFeedId: Int as uint256;
    price: Int as uint256;
}

struct PriceData {
    timestamp: Int as uint48;
    price: Int as uint256;
}

const DP_COUNT_BITS: Int = 24;
const DP_VALUE_BYTE_SIZE_BITS: Int = 32;

const FEED_ID_BITS: Int = 256;
const PRICE_BITS: Int = 256;
const TIMESTAMP_BITS: Int = 48;
const MAX_DELAY_SECONDS: Int = 900; // 15 * 60
const MAX_AHEAD_SECONDS: Int = 180; // 3 * 60

extends inline fun loadDataPackage(self: Slice): DataPackageStruct {
    // this function is veeery different from FunC because the data is arranged completely differently
    // not sure if the FunC code even works
    // fffffffffffffffffffffff
    // read package meta
    let tail = self.lastBits(DP_COUNT_BITS + DP_VALUE_BYTE_SIZE_BITS + TIMESTAMP_BITS);

    let timestamp = tail.loadUint(TIMESTAMP_BITS) / 1000;

    let valueSizeBits = tail.loadUint(DP_VALUE_BYTE_SIZE_BITS) * 8;
    require(valueSizeBits <= PRICE_BITS, "Value size bits must be less than or equal to price bits");
    require(valueSizeBits > 0, "Value size bits must be greater than 0");

    let dataPointsCount = tail.loadUint(DP_COUNT_BITS);
    require(dataPointsCount == 1, "Only one data point is supported");

    // read package data
    let head = self.loadBits(FEED_ID_BITS);

    let dataFeedId = head.loadUint(FEED_ID_BITS - head.numberTrailingZeros() / 8 * 8);

    let price = self.loadUint(valueSizeBits);

    return DataPackageStruct {
        timestamp,
        dataFeedId,
        price,
    };
}
