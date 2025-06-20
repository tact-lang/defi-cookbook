import "@ton/test-utils"
import {SandboxContract, TreasuryContract, Blockchain} from "@ton/sandbox"
import {SampleConsumer} from "../../output/SampleConsumer_SampleConsumer"
import {
    feedIdToBigInt,
    getRedstoneSignedDataPackages,
    getRedstoneSigners,
    serializeSignedDataPackages,
    serializeSigners,
    signersToBigInt,
} from "../utils"
import {
    SingleFeedMan,
    storeReadPrice,
    storeUpdatePrice,
    UpdatePrice,
} from "../../output/SampleConsumer_SingleFeedMan"
import {beginCell, Cell, toNano} from "@ton/core"

describe("SampleConsumer tests", () => {
    let blockchain: Blockchain
    let deployer: SandboxContract<TreasuryContract>
    let sampleConsumer: SandboxContract<SampleConsumer>
    let singleFeedMan: SandboxContract<SingleFeedMan>

    const feedId = "TON"

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

        sampleConsumer = blockchain.openContract(
            await SampleConsumer.fromInit(
                feedIdToBigInt(feedId),
                {
                    $$type: "PriceData",
                    timestamp: 0n,
                    price: 0n,
                },
                singleFeedMan.address,
            ),
        )
    })

    it("should deploy sample consumer and correctly fetch price", async () => {
        const fetchPriceResult = await sampleConsumer.send(
            deployer.getSender(),
            {value: toNano("0.05"), bounce: false},
            null,
        )

        expect(fetchPriceResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: sampleConsumer.address,
            op: undefined,
            outMessagesCount: 1,
            body: new Cell(),
            success: true,
            deploy: true,
        })

        expect(fetchPriceResult.transactions).toHaveTransaction({
            from: sampleConsumer.address,
            to: singleFeedMan.address,
            op: SingleFeedMan.opcodes.ReadPrice,
            body: beginCell()
                .store(
                    storeReadPrice({
                        $$type: "ReadPrice",
                        feedId: feedIdToBigInt(feedId),
                    }),
                )
                .endCell(),
            success: true,
            outMessagesCount: 1,
        })

        expect(fetchPriceResult.transactions).toHaveTransaction({
            from: singleFeedMan.address,
            to: sampleConsumer.address,
            op: SingleFeedMan.opcodes.PriceResponse,
            success: true,
        })

        const lastFetchedPriceData = await sampleConsumer.getLastFetchedPriceData()
        // console.log(lastFetchedPriceData);
        expect(lastFetchedPriceData.price).toBeGreaterThan(0n)
        expect(lastFetchedPriceData.timestamp).toBeGreaterThan(0n)
    })
})
