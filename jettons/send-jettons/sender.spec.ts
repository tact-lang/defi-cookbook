import "@ton/test-utils"
import {Address, beginCell, Cell, toNano} from "@ton/core"
import {SandboxContract, TreasuryContract, Blockchain} from "@ton/sandbox"
import {JettonMinter, JettonUpdateContent, Mint} from "../output/Jetton_JettonMinter"
import {JettonWallet} from "../output/Jetton_JettonWallet"
import {JettonSender} from "../output/JettonSender_JettonSender"

describe("Jetton Receiver Tests", () => {
    let blockchain: Blockchain

    let jettonMinter: SandboxContract<JettonMinter>
    let jettonSenderContract: SandboxContract<JettonSender>

    let deployer: SandboxContract<TreasuryContract>

    let defaultContent: Cell
    let jettonWalletCode: Cell
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

        // quick setup to get jetton wallet code and reuse later
        const jettonWallet = blockchain.openContract(
            await JettonWallet.fromInit(0n, deployer.address, jettonMinter.address),
        )
        jettonWalletCode = jettonWallet.init!.code

        // deploy jetton receiver contract
        jettonSenderContract = blockchain.openContract(
            await JettonSender.fromInit(jettonMinter.address, jettonWalletCode),
        )

        const testerDeployResult = await jettonSenderContract.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            null,
        )

        expect(testerDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonSenderContract.address,
            deploy: true,
            success: true,
        })

        // mint jettons to sender contract address as part of the setup
        const mintMsg: Mint = {
            $$type: "Mint",
            queryId: 0n,
            receiver: jettonSenderContract.address,
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

    // basic send, without any extra params
    it("jetton sender should correctly send jettons in basic mode", async () => {
        const senderContractJettonWallet = await userWallet(jettonSenderContract.address)

        const jettonTransferAmount = toNano(1)
        const receiverAddress = Address.parse("UQBgrsehQMikzBmR43YKE3cSYmM_GMa5Lxx92Kv8hqmuCW6L")

        // -(external)-> deployer -(send jettons fast)-> sender.tact --
        // -(transfer)-> sender jetton wallet -(internal transfer)-> receiver jetton wallet
        const jettonSendResult = await jettonSenderContract.send(
            deployer.getSender(),
            {
                value: toNano(2),
            },
            {
                $$type: "SendJettonsFast",
                amount: jettonTransferAmount,
                destination: receiverAddress,
            },
        )

        // message from our sender.tact to its jetton wallet
        // we need to only check that this one was send, the rest is handled by the jettons contracts
        expect(jettonSendResult.transactions).toHaveTransaction({
            from: jettonSenderContract.address,
            to: senderContractJettonWallet.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // internal transfer
            op: JettonWallet.opcodes.JettonTransfer,
        })

        const receiverJettonWallet = await userWallet(receiverAddress)

        const jettonReceiverDataAfter = await receiverJettonWallet.getGetWalletData()

        expect(jettonReceiverDataAfter.balance).toEqual(jettonTransferAmount)
    })

    // extended send, check all the params
    it("jetton sender should correctly send jettons in extended mode", async () => {
        const senderContractJettonWallet = await userWallet(jettonSenderContract.address)

        const jettonTransferAmount = toNano(1)

        // this can be any payload that we want receiver to get with transfer notification
        const jettonTransferPayload = beginCell().storeUint(239, 32).storeUint(0, 32).asSlice()

        // ton amount that will be sent to the receiver with transfer notification
        const forwardTonAmount = toNano(1)

        // payload that could be used by the jetton wallets, usually just null
        const customPayload = beginCell().storeBit(true).endCell()

        const receiverAddress = Address.parse("UQBgrsehQMikzBmR43YKE3cSYmM_GMa5Lxx92Kv8hqmuCW6L")

        // -(external)-> deployer -(send jettons fast)-> sender.tact --
        // -(transfer)-> sender jetton wallet -(internal transfer)-> receiver jetton wallet
        const jettonExtendedSendResult = await jettonSenderContract.send(
            deployer.getSender(),
            {
                value: toNano(2),
            },
            {
                $$type: "SendJettonsExtended",
                amount: jettonTransferAmount,
                destination: receiverAddress,
                forwardPayload: jettonTransferPayload,
                forwardTonAmount: forwardTonAmount,
                customPayload: customPayload,
            },
        )

        expect(jettonExtendedSendResult.transactions).toHaveTransaction({
            from: jettonSenderContract.address,
            to: senderContractJettonWallet.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // internal transfer
            op: JettonWallet.opcodes.JettonTransfer,
        })

        // check that we correctly send notification message and excesses
        expect(jettonExtendedSendResult.transactions).toHaveTransaction({
            from: senderContractJettonWallet.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 2, // notification + excesses
            op: JettonSender.opcodes.JettonTransferInternal,
        })

        const receiverJettonWallet = await userWallet(receiverAddress)

        const jettonReceiverDataAfter = await receiverJettonWallet.getGetWalletData()

        expect(jettonReceiverDataAfter.balance).toEqual(jettonTransferAmount)
    })
})
