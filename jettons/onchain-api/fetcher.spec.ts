import "@ton/test-utils"
import {Address, beginCell, Cell, Dictionary, toNano} from "@ton/core"
import {SandboxContract, TreasuryContract, Blockchain} from "@ton/sandbox"
import {
    JettonMinter,
    JettonTransfer,
    JettonUpdateContent,
    Mint,
} from "../output/Basic Jetton_JettonMinter"
import {JettonWallet} from "../output/Basic Jetton_JettonWallet"
import {Fetcher} from "../output/JettonFetcherOnChain_Fetcher"

describe("Jetton Fetcher Tests", () => {
    let blockchain: Blockchain

    let jettonMinter: SandboxContract<JettonMinter>
    let jettonFetcherContract: SandboxContract<Fetcher>

    let deployer: SandboxContract<TreasuryContract>

    let defaultContent: Cell
    let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>

    beforeEach(async () => {
        blockchain = await Blockchain.create()

        deployer = await blockchain.treasury("deployer")

        defaultContent = beginCell().endCell()
        const msg: JettonUpdateContent = {
            $$type: "JettonUpdateContent",
            queryId: 0n,
            content: new Cell(),
        }

        // deploy jetton minter
        jettonMinter = blockchain.openContract(
            await JettonMinter.fromInit(0n, deployer.address, defaultContent, true),
        )
        const deployResult = await jettonMinter.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            msg,
        )

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
            success: true,
        })

        // deploy jetton receiver contract
        jettonFetcherContract = blockchain.openContract(
            await Fetcher.fromInit(Dictionary.empty(), Dictionary.empty(), 0n),
        )

        const testerDeployResult = await jettonFetcherContract.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            null,
        )

        expect(testerDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonFetcherContract.address,
            deploy: true,
            success: true,
        })

        // mint jettons to deployer address as part of the setup
        const mintMsg: Mint = {
            $$type: "Mint",
            queryId: 0n,
            receiver: deployer.address,
            tonAmount: 0n,
            mintMessage: {
                $$type: "JettonTransferInternal",
                queryId: 0n,
                amount: toNano(1),
                sender: deployer.address,
                forwardTonAmount: 0n,
                responseDestination: deployer.address,
                forwardPayload: beginCell().storeUint(239, 32).asSlice(),
            },
        }

        const mintResult = await jettonMinter.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            mintMsg,
        )
        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
            endStatus: "active",
            outMessagesCount: 1, // mint message
            op: JettonMinter.opcodes.Mint,
        })

        userWallet = async (address: Address) => {
            return blockchain.openContract(
                JettonWallet.fromAddress(await jettonMinter.getGetWalletAddress(address)),
            )
        }
    })

    it("should correctly on-chain get jetton wallet address", async () => {
        const fetchAddressResult = await jettonFetcherContract.send(
            deployer.getSender(),
            {
                value: toNano(0.5),
            },
            {
                $$type: "FetchJettonAddressOnChain",
                jettonMinterAddress: jettonMinter.address,
                ownerAddress: deployer.address,
            },
        )

        // on-chain request
        expect(fetchAddressResult.transactions).toHaveTransaction({
            from: jettonFetcherContract.address,
            to: jettonMinter.address,
            op: Fetcher.opcodes.ProvideWalletAddress,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // response
        })

        // on-chain response
        expect(fetchAddressResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: jettonFetcherContract.address,
            op: Fetcher.opcodes.TakeWalletAddress,
            success: true,
            exitCode: 0,
        })

        const deployerJettonWallet = await userWallet(deployer.address)
        const knownJettonOwners = await jettonFetcherContract.getGetKnownJettonOwners()

        // verify that we correctly saved wallet owner and jetton address
        expect(knownJettonOwners.get(deployer.address)).toEqualAddress(deployerJettonWallet.address)
    })

    it("should correctly on-chain get jetton wallet balance", async () => {
        const jettonTransferAmount = toNano(1)
        const receiverAddress = Address.parse("UQBgrsehQMikzBmR43YKE3cSYmM_GMa5Lxx92Kv8hqmuCW6L")

        const deployerJettonWallet = await userWallet(deployer.address)

        const transferMsg: JettonTransfer = {
            $$type: "JettonTransfer",
            queryId: 0n,
            amount: jettonTransferAmount,
            responseDestination: deployer.address,
            forwardTonAmount: toNano(1),
            forwardPayload: beginCell().storeBit(0).asSlice(),
            destination: receiverAddress,
            customPayload: null,
        }

        await deployerJettonWallet.send(
            deployer.getSender(),
            {
                value: toNano(2),
            },
            transferMsg,
        )

        const receiverJettonWallet = await userWallet(receiverAddress)

        const fetchBalanceResult = await jettonFetcherContract.send(
            deployer.getSender(),
            {
                value: toNano(1),
            },
            {
                $$type: "FetchJettonBalanceOnChain",
                jettonWalletAddress: receiverJettonWallet.address,
            },
        )

        // on-chain request
        expect(fetchBalanceResult.transactions).toHaveTransaction({
            from: jettonFetcherContract.address,
            to: receiverJettonWallet.address,
            op: Fetcher.opcodes.ProvideWalletBalance,
            success: true,
            outMessagesCount: 1, // response
        })

        // on-chain response
        expect(fetchBalanceResult.transactions).toHaveTransaction({
            from: receiverJettonWallet.address,
            to: jettonFetcherContract.address,
            op: Fetcher.opcodes.TakeWalletBalance,
            success: true,
        })

        const actualBalanceData = await receiverJettonWallet.getGetWalletData()
        const lastFetchedBalance = await jettonFetcherContract.getLastFetchedBalance()

        expect(lastFetchedBalance).toEqual(actualBalanceData.balance)
    })
})
