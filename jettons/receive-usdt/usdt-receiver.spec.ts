import "@ton/test-utils"
import {Address, beginCell, Cell, toNano} from "@ton/core"
import {SandboxContract, TreasuryContract, Blockchain} from "@ton/sandbox"
import {
    JettonNotification,
    JettonReceiver,
    storeJettonNotification,
} from "../output/JettonReceiver_JettonReceiver"
import {Metadata} from "../mint-usdt/metadata"
import {buildJettonMinterFromMetadata} from "../mint-usdt/mint-usdt"
import {
    GovernanceJettonMinter,
    JettonTransfer,
    Mint,
} from "../output/Governance Jetton_GovernanceJettonMinter"
import {JettonWalletGovernance} from "../output/Governance Jetton_JettonWalletGovernance"
import {JettonReceiverGovernance} from "../output/JettonReceiverGovernance_JettonReceiverGovernance"

// helper function to deploy the USDT jetton minter
const deployUsdtJettonMinter = async (deployer: SandboxContract<TreasuryContract>) => {
    const metadata: Metadata = {
        description: "Tether USD",
        image: "https://example.com/usdt.png",
        name: "Tether USD",
        symbol: "USDT",
    }

    // to work with identical func usdt minter and wallet, we need to use the same code
    // as the one used in the mainnet, hence we are using precompiled code from hex
    const usdtMinterData = await buildJettonMinterFromMetadata(deployer.address, metadata)

    const minterDeployResult = await deployer.send({
        to: usdtMinterData.address,
        value: toNano("0.1"),
        body: beginCell().endCell(), // empty body
        init: usdtMinterData.init, // init with code and data
    })

    return {
        minterAddress: usdtMinterData.address,
        minterDeployResult,
        walletCode: usdtMinterData.walletCode,
    }
}

describe("USDT Jetton Receiver Tests", () => {
    let blockchain: Blockchain

    let jettonMinter: SandboxContract<GovernanceJettonMinter>
    let usdtJettonReceiverContract: SandboxContract<JettonReceiverGovernance>

    let deployer: SandboxContract<TreasuryContract>

    let jettonWalletCode: Cell
    let userWallet: (address: Address) => Promise<SandboxContract<JettonWalletGovernance>>

    beforeEach(async () => {
        blockchain = await Blockchain.create()

        deployer = await blockchain.treasury("deployer")

        // deploy usdt jetton minter
        const {minterAddress, minterDeployResult, walletCode} =
            await deployUsdtJettonMinter(deployer)
        expect(minterDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: minterAddress,
            deploy: true,
        })
        jettonMinter = blockchain.openContract(GovernanceJettonMinter.fromAddress(minterAddress))

        // quick setup to get jetton wallet code and reuse later
        jettonWalletCode = walletCode

        // deploy jetton receiver contract
        usdtJettonReceiverContract = blockchain.openContract(
            await JettonReceiverGovernance.fromInit(
                jettonMinter.address,
                jettonWalletCode,
                0n,
                beginCell().asSlice(),
            ),
        )

        const testerDeployResult = await usdtJettonReceiverContract.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            null,
        )

        expect(testerDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtJettonReceiverContract.address,
            deploy: true,
            success: true,
        })

        // mint usdt to deployer address as part of the setup
        const mintMsg: Mint = {
            $$type: "Mint",
            queryId: 0n,
            toAddress: deployer.address,
            tonAmount: toNano("1"),
            masterMsg: {
                $$type: "JettonTransferInternal",
                queryId: 0n,
                amount: toNano(1),
                sender: deployer.address,
                forwardTonAmount: 0n,
                responseDestination: deployer.address,
                forwardPayload: beginCell().storeUint(239, 32).asSlice(),
            },
        }

        const usdtMintResult = await jettonMinter.send(
            deployer.getSender(),
            {value: toNano("3")},
            mintMsg,
        )
        expect(usdtMintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
            endStatus: "active",
            outMessagesCount: 1, // mint message
            op: GovernanceJettonMinter.opcodes.Mint,
        })

        userWallet = async (address: Address) => {
            return blockchain.openContract(
                JettonWalletGovernance.fromAddress(await jettonMinter.getGetWalletAddress(address)),
            )
        }
    })

    // in this test we check that the receiver contract accepts
    // the correct transfer notification message and accepts usdt
    it("usdt receiver should accept correct transfer notification", async () => {
        const deployerJettonWallet = await userWallet(deployer.address)
        const receiverJettonWallet = await userWallet(usdtJettonReceiverContract.address)

        const jettonTransferAmount = toNano(1)
        const jettonTransferForwardPayload = beginCell().storeUint(239, 32).endCell()

        const usdtTransferMsg: JettonTransfer = {
            $$type: "JettonTransfer",
            queryId: 0n,
            amount: jettonTransferAmount,
            responseDestination: deployer.address,
            forwardTonAmount: toNano(1),
            forwardPayload: jettonTransferForwardPayload.asSlice(),
            destination: usdtJettonReceiverContract.address,
            customPayload: null,
        }

        // -(external)-> deployer -(transfer)-> deployer jetton wallet --
        // -(internal transfer)-> usdt receiver jetton wallet -(transfer notification)-> receiver.tact
        const transferResult = await deployerJettonWallet.send(
            deployer.getSender(),
            {
                value: toNano(2),
            },
            usdtTransferMsg,
        )

        // check that jetton transfer was successful
        // and notification message was sent to receiver contract
        expect(transferResult.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            to: receiverJettonWallet.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 2, // notification + excesses
            op: JettonWalletGovernance.opcodes.JettonTransferInternal,
            deploy: true,
        })

        // notification message to receiver.tact contract, handled by our receiver contract logic
        expect(transferResult.transactions).toHaveTransaction({
            from: receiverJettonWallet.address,
            to: usdtJettonReceiverContract.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 0, // we don't send anything
            op: JettonWalletGovernance.opcodes.JettonNotification,
        })

        // getters to ensure we successfully received notification and executed overridden fetch method
        const getAmount = await usdtJettonReceiverContract.getAmountChecker()
        expect(getAmount).toEqual(jettonTransferAmount)

        const getPayload = await usdtJettonReceiverContract.getPayloadChecker()
        expect(getPayload).toEqualSlice(jettonTransferForwardPayload.asSlice())
    })

    it("jetton receiver should reject malicious transfer notification", async () => {
        // try to send malicious notification message
        const msg: JettonNotification = {
            $$type: "JettonNotification",
            queryId: 0n,
            amount: toNano(1),
            forwardPayload: beginCell().storeUint(239, 32).asSlice(),
            sender: deployer.address,
        }

        const msgCell = beginCell().store(storeJettonNotification(msg)).endCell()

        // no actual jetton transfer, just send notification message
        const maliciousSendResult = await deployer.send({
            to: usdtJettonReceiverContract.address,
            value: toNano(1),
            body: msgCell,
        })

        expect(maliciousSendResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtJettonReceiverContract.address,
            // should be rejected
            success: false,
            exitCode: JettonReceiver.errors["Incorrect sender"],
        })

        const getAmount = await usdtJettonReceiverContract.getAmountChecker()
        expect(getAmount).toEqual(0n)

        const getPayload = await usdtJettonReceiverContract.getPayloadChecker()
        expect(getPayload).toEqualSlice(beginCell().asSlice())
    })
})
