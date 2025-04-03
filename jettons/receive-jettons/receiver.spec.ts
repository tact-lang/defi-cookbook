import "@ton/test-utils"
import {Address, beginCell, Cell, toNano} from "@ton/core"
import {SandboxContract, TreasuryContract, Blockchain} from "@ton/sandbox"
import {
    JettonMinter,
    JettonTransfer,
    JettonUpdateContent,
    Mint,
} from "../output/Jetton_JettonMinter"
import {JettonReceiver} from "../output/JettonReceiver_JettonReceiver"
import {JettonWallet} from "../output/Jetton_JettonWallet"

describe("Jetton Receiver Tests", () => {
    let blockchain: Blockchain

    let jettonMinter: SandboxContract<JettonMinter>
    let jettonReceiverContract: SandboxContract<JettonReceiver>

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

        const jettonWallet = blockchain.openContract(
            await JettonWallet.fromInit(0n, deployer.address, jettonMinter.address),
        )
        jettonWalletCode = jettonWallet.init!.code
        jettonReceiverContract = blockchain.openContract(
            await JettonReceiver.fromInit(
                jettonMinter.address,
                jettonWalletCode,
                0n,
                beginCell().asSlice(),
            ),
        )

        const testerDeployResult = await jettonReceiverContract.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            null,
        )

        expect(testerDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonReceiverContract.address,
            deploy: true,
            success: true,
        })

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

    it("jetton receiver should accept correct transfer notification", async () => {
        const deployerJettonWallet = await userWallet(deployer.address)
        const receiverJettonWallet = await userWallet(jettonReceiverContract.address)

        const jettonTransferAmount = toNano(1)
        const jettonTransferForwardPayload = beginCell().storeUint(239, 32).endCell()
        const transferMsg: JettonTransfer = {
            $$type: "JettonTransfer",
            queryId: 0n,
            amount: jettonTransferAmount,
            responseDestination: deployer.address,
            forwardTonAmount: toNano(1),
            forwardPayload: jettonTransferForwardPayload.asSlice(),
            destination: jettonReceiverContract.address,
            customPayload: null,
        }

        // -(external)-> deployer -(transfer)-> deployer jetton wallet --
        // -(internal transfer)-> receiver jetton wallet -(transfer notification)-> receiver.tact
        const transferResult = await deployerJettonWallet.send(
            deployer.getSender(),
            {
                value: toNano(2),
            },
            transferMsg,
        )

        expect(transferResult.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            to: receiverJettonWallet.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 2, // notification + excesses
            op: JettonWallet.opcodes.JettonTransferInternal,
            deploy: true,
        })

        // Notification message to receiver.tact contract,
        expect(transferResult.transactions).toHaveTransaction({
            from: receiverJettonWallet.address,
            to: jettonReceiverContract.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 0, // we don't send anything
            op: JettonWallet.opcodes.JettonNotification,
        })

        // getters to ensure we successfully received notification and executed overridden fetch method
        const getAmount = await jettonReceiverContract.getAmountChecker()
        expect(getAmount).toEqual(jettonTransferAmount)

        const getPayload = await jettonReceiverContract.getPayloadChecker()
        expect(getPayload).toEqualSlice(jettonTransferForwardPayload.asSlice())
    })

    // it("jetton receiver should reject malicious transfer notification", async () => {
    //     const msg: JettonNotification = {
    //         $$type: "JettonNotification",
    //         queryId: 0n,
    //         amount: toNano(1),
    //         forwardPayload: beginCell().storeUint(239, 32).asSlice(),
    //         sender: deployer.address,
    //     }

    //     const msgCell = beginCell().store(storeJettonNotification(msg)).endCell()

    //     const maliciousSendResult = await deployer.send({
    //         to: jettonReceiverTester.address,
    //         value: toNano(1),
    //         body: msgCell,
    //     })

    //     expect(maliciousSendResult.transactions).toHaveTransaction({
    //         from: deployer.address,
    //         to: jettonReceiverTester.address,
    //         success: false,
    //         exitCode: JettonTester.errors["Incorrect sender"],
    //     })

    //     const getAmount = await jettonReceiverTester.getAmount()
    //     expect(getAmount).toEqual(0n)

    //     const getPayload = await jettonReceiverTester.getPayload()
    //     expect(getPayload).toEqualSlice(beginCell().asSlice())
    // })
})
