import "@ton/test-utils"
import {Address, beginCell, Cell, toNano} from "@ton/core"
import {SandboxContract, TreasuryContract, Blockchain} from "@ton/sandbox"
import {JettonSenderGovernance} from "../output/JettonSenderGovernance_JettonSenderGovernance"
import {JettonWalletGovernance} from "../output/Governance Jetton_JettonWalletGovernance"
import {GovernanceJettonMinter, Mint} from "../output/Governance Jetton_GovernanceJettonMinter"
import {Metadata} from "../mint-usdt/metadata"
import {buildJettonMinterFromMetadata} from "../mint-usdt/mint-usdt"

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

describe("USDT Sender Tests", () => {
    let blockchain: Blockchain

    let usdtJettonMinter: SandboxContract<GovernanceJettonMinter>
    let usdtSenderContract: SandboxContract<JettonSenderGovernance>

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
        usdtJettonMinter = blockchain.openContract(
            GovernanceJettonMinter.fromAddress(minterAddress),
        )

        // quick setup to get jetton wallet code and reuse later
        jettonWalletCode = walletCode

        // deploy jetton receiver contract
        usdtSenderContract = blockchain.openContract(
            await JettonSenderGovernance.fromInit(usdtJettonMinter.address, jettonWalletCode),
        )

        const testerDeployResult = await usdtSenderContract.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            null,
        )

        expect(testerDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtSenderContract.address,
            deploy: true,
            success: true,
        })

        // mint usdt to deployer address as part of the setup
        const mintMsg: Mint = {
            $$type: "Mint",
            queryId: 0n,
            toAddress: usdtSenderContract.address,
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

        const usdtMintResult = await usdtJettonMinter.send(
            deployer.getSender(),
            {value: toNano("3")},
            mintMsg,
        )
        expect(usdtMintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtJettonMinter.address,
            success: true,
            endStatus: "active",
            outMessagesCount: 1, // mint message
            op: GovernanceJettonMinter.opcodes.Mint,
        })

        userWallet = async (address: Address) => {
            return blockchain.openContract(
                JettonWalletGovernance.fromAddress(
                    await usdtJettonMinter.getGetWalletAddress(address),
                ),
            )
        }
    })

    // basic send, without any extra params
    it("jetton sender should correctly send usdt in basic mode", async () => {
        const senderContractJettonWallet = await userWallet(usdtSenderContract.address)

        const jettonTransferAmount = toNano(1)
        const receiverAddress = Address.parse("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ")

        // -(external)-> deployer -(send jettons fast)-> sender.tact --
        // -(transfer)-> sender usdt jetton wallet -(internal transfer)-> receiver usdt jetton wallet
        const jettonSendResult = await usdtSenderContract.send(
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
            from: usdtSenderContract.address,
            to: senderContractJettonWallet.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // internal transfer
            op: JettonWalletGovernance.opcodes.JettonTransfer,
        })

        const receiverJettonWallet = await userWallet(receiverAddress)

        const jettonReceiverDataAfter = await receiverJettonWallet.getGetWalletData()

        expect(jettonReceiverDataAfter.balance).toEqual(jettonTransferAmount)
    })

    // extended send, check all the params
    it("jetton sender should correctly send usdt in extended mode", async () => {
        const senderContractJettonWallet = await userWallet(usdtSenderContract.address)

        const jettonTransferAmount = toNano(1)

        // this can be any payload that we want receiver to get with transfer notification
        const jettonTransferPayload = beginCell().storeUint(239, 32).storeUint(0, 32).asSlice()

        // ton amount that will be sent to the receiver with transfer notification
        const forwardTonAmount = toNano(1)

        // payload that could be used by the jetton wallets, usually just null
        const customPayload = beginCell().storeBit(true).endCell()

        const receiverAddress = Address.parse("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ")

        // -(external)-> deployer -(send jettons fast)-> sender.tact --
        // -(transfer)-> sender usdt jetton wallet -(internal transfer)-> receiver usdt jetton wallet
        const jettonExtendedSendResult = await usdtSenderContract.send(
            deployer.getSender(),
            {
                value: toNano(3),
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
            from: usdtSenderContract.address,
            to: senderContractJettonWallet.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // internal transfer
            op: JettonWalletGovernance.opcodes.JettonTransfer,
        })

        // check that we correctly send notification message and excesses
        expect(jettonExtendedSendResult.transactions).toHaveTransaction({
            from: senderContractJettonWallet.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 2, // notification + excesses
            op: JettonSenderGovernance.opcodes.JettonTransferInternal,
        })

        const receiverJettonWallet = await userWallet(receiverAddress)

        const jettonReceiverDataAfter = await receiverJettonWallet.getGetWalletData()

        expect(jettonReceiverDataAfter.balance).toEqual(jettonTransferAmount)
    })
})
