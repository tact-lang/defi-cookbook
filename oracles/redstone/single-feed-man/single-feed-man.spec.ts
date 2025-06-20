import "@ton/test-utils"
import {SandboxContract, TreasuryContract, Blockchain} from "@ton/sandbox"
import {
    ReadPrice,
    SingleFeedMan,
    storeReadPrice,
    storeUpdatePrice,
    UpdatePrice,
} from "../../output/SingleFeedMan_SingleFeedMan"
import {beginCell, toNano} from "@ton/core"
import {
    getRedstoneSigners,
    getRedstoneSignedDataPackages,
    serializeSignedDataPackages,
    serializeSigners,
    signersToBigInt,
    feedIdToBigInt,
    deserializeSigners,
} from "../utils"

describe("SingleFeedMan tests", () => {
    let blockchain: Blockchain
    let deployer: SandboxContract<TreasuryContract>
    let singleFeedMan: SandboxContract<SingleFeedMan>
    let feedId = "TON"

    beforeAll(async () => {
        blockchain = await Blockchain.create()
        deployer = await blockchain.treasury("deployer")

        const signers = getRedstoneSigners()

        singleFeedMan = blockchain.openContract(
            await SingleFeedMan.fromInit(
                feedIdToBigInt(feedId),
                serializeSigners(signersToBigInt(signers)),
                BigInt(Math.min(signers.length, 3)),
                {
                    $$type: "PriceData",
                    timestamp: 0n,
                    price: 0n,
                },
            ),
        )

        const deployResult = await singleFeedMan.send(
            deployer.getSender(),
            {value: toNano("0.05"), bounce: false},
            null,
        )

        expect(deployResult.transactions).toHaveTransaction({
            to: singleFeedMan.address,
            deploy: true,
            success: true,
        })
    })

    it("should deploy", async () => {
        const res = await singleFeedMan.getFeedId()
        expect(res).toBe(feedIdToBigInt(feedId))

        const res2 = await singleFeedMan.getLastPriceData()
        expect(res2.price).toBe(0n)
        expect(res2.timestamp).toBe(0n)
    })

    it("should check data packages and return correct price and timestamp (test getPriceData)", async () => {
        const signers = deserializeSigners(await singleFeedMan.getSigners())
        const signedDataPackages = await getRedstoneSignedDataPackages(feedId, signers)

        const signedDataPackagesCell = serializeSignedDataPackages(signedDataPackages, signers)

        const res = await singleFeedMan.getPriceData(signedDataPackagesCell.asSlice())

        const prices = signedDataPackages.map(signedDataPackage =>
            BigInt(
                ~~((signedDataPackage.dataPackage.dataPoints[0].toObj().value as number) * 10 ** 8),
            ),
        )
        const timestamps = signedDataPackages.map(signedDataPackage =>
            BigInt(~~(signedDataPackage.dataPackage.timestampMilliseconds / 1000)),
        )

        // console.log(prices)
        // console.log(timestamps)
        const getMedian = (arr: bigint[]) => {
            const sorted = arr.sort((a, b) => Number(a - b))
            const len = sorted.length
            const q = Math.floor(len / 2)
            const r = len % 2
            return (sorted[q] + sorted[q - 1 + r] + 1n) / 2n
        }

        const medianPrice = getMedian(prices)
        const minTimestamp = timestamps.reduce(
            (min, curr) => (min < curr ? min : curr),
            timestamps[0],
        )

        expect(res.price).toBe(medianPrice)
        expect(res.timestamp).toBe(minTimestamp)
    })

    it("should correctly update price and read price (test UpdatePrice and ReadPrice)", async () => {
        const signers = deserializeSigners(await singleFeedMan.getSigners())
        const signedDataPackages = await getRedstoneSignedDataPackages(feedId, signers)

        const signedDataPackagesCell = serializeSignedDataPackages(signedDataPackages, signers)

        const bodyStruct: UpdatePrice = {
            $$type: "UpdatePrice",
            feedId: feedIdToBigInt(feedId),
            dataPackages: signedDataPackagesCell.asSlice(),
        }

        const res = await singleFeedMan.send(
            deployer.getSender(),
            {value: toNano("0.05")},
            bodyStruct,
        )

        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            to: singleFeedMan.address,
            success: true,
            op: SingleFeedMan.opcodes.UpdatePrice,
            outMessagesCount: 1,
            body: beginCell().store(storeUpdatePrice(bodyStruct)).endCell(),
        })

        expect(res.transactions).toHaveTransaction({
            from: singleFeedMan.address,
            to: deployer.address,
            op: SingleFeedMan.opcodes.PriceResponse,
        })

        const body2Struct: ReadPrice = {
            $$type: "ReadPrice",
            feedId: feedIdToBigInt(feedId),
        }

        const res2 = await singleFeedMan.send(
            deployer.getSender(),
            {value: toNano("0.05")},
            body2Struct,
        )

        expect(res2.transactions).toHaveTransaction({
            from: deployer.address,
            to: singleFeedMan.address,
            op: SingleFeedMan.opcodes.ReadPrice,
            outMessagesCount: 1,
            body: beginCell().store(storeReadPrice(body2Struct)).endCell(),
        })

        expect(res2.transactions).toHaveTransaction({
            from: singleFeedMan.address,
            to: deployer.address,
            op: SingleFeedMan.opcodes.PriceResponse,
        })
    })
})
