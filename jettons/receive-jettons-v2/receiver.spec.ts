import {Address, beginCell, Cell, toNano} from "@ton/core"
import {SandboxContract, TreasuryContract, Blockchain} from "@ton/sandbox"
import {
    JettonMinter,
    JettonTransfer,
    JettonUpdateContent,
    Mint,
} from "../output/Basic Jetton_JettonMinter"
import {
    JettonNotification,
    JettonReceiver,
    storeJettonNotification,
} from "../output/JettonReceiverV2_JettonReceiver"
import {JettonWallet} from "../output/Basic Jetton_JettonWallet"
import {TEP89DiscoveryProxy} from "../output/JettonReceiverV2_TEP89DiscoveryProxy"
import {findTransactionRequired} from "@ton/test-utils"

describe("Jetton Receiver with trait and discovery Tests", () => {
    let blockchain: Blockchain

    let jettonMinter: SandboxContract<JettonMinter>
    let jettonReceiverContract: SandboxContract<JettonReceiver>

    let deployer: SandboxContract<TreasuryContract>

    let defaultContent: Cell
    let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>

    beforeEach(async () => {
        blockchain = await Blockchain.create()

        deployer = await blockchain.treasury("deployer")

        defaultContent = beginCell().endCell()
        const updateContentMsg: JettonUpdateContent = {
            $$type: "JettonUpdateContent",
            queryId: 0n,
            content: new Cell(),
        }

        // Deploy jetton minter contract
        jettonMinter = blockchain.openContract(
            await JettonMinter.fromInit(0n, deployer.address, defaultContent, true),
        )
        const minterDeployResult = await jettonMinter.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            updateContentMsg,
        )

        expect(minterDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
            success: true,
        })

        // Deploy jetton receiver contract with jettonWallet = null (required for discovery)
        jettonReceiverContract = blockchain.openContract(
            await JettonReceiver.fromInit(jettonMinter.address, null, 0n, beginCell().asSlice()),
        )

        const receiverDeployResult = await jettonReceiverContract.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            null,
        )

        expect(receiverDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonReceiverContract.address,
            deploy: true,
            success: true,
        })

        // Mint jettons to deployer for testing transfers
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
            outMessagesCount: 1, // JettonTransferInternal to deployer's wallet
            op: JettonMinter.opcodes.Mint,
        })

        userWallet = async (address: Address) => {
            return blockchain.openContract(
                JettonWallet.fromAddress(await jettonMinter.getGetWalletAddress(address)),
            )
        }
    })

    it("should complete TEP-89 discovery flow", async () => {
        const deployerJettonWallet = await userWallet(deployer.address)
        const receiverJettonWallet = await userWallet(jettonReceiverContract.address)

        const transferAmount = toNano(1)
        const forwardPayload = beginCell().storeUint(239, 17).endCell()

        const transferMsg: JettonTransfer = {
            $$type: "JettonTransfer",
            queryId: 0n,
            amount: transferAmount,
            responseDestination: deployer.address,
            forwardTonAmount: toNano(1),
            forwardPayload: beginCell()
                .storeBit(false) // Inline format
                .storeSlice(forwardPayload.asSlice())
                .endCell()
                .asSlice(),
            destination: jettonReceiverContract.address,
            customPayload: null,
        }

        const transferResult = await deployerJettonWallet.send(
            deployer.getSender(),
            {
                value: toNano(2),
            },
            transferMsg,
        )

        // Step 1: JettonTransferInternal to receiver's jetton wallet (auto-deployed)
        expect(transferResult.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            to: receiverJettonWallet.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 2, // JettonNotification + JettonExcesses
            op: JettonWallet.opcodes.JettonTransferInternal,
            deploy: true,
        })

        // Step 2: JettonNotification triggers TEP-89 discovery (jettonWallet is null)
        const notificationTx = findTransactionRequired(transferResult.transactions, {
            from: receiverJettonWallet.address,
            to: jettonReceiverContract.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // Deploy TEP89DiscoveryProxy
            op: JettonWallet.opcodes.JettonNotification,
        })

        // Calculate expected proxy address based on discovery parameters
        const discoveryProxyContract = await TEP89DiscoveryProxy.fromInit(
            jettonMinter.address, // jettonMaster
            jettonReceiverContract.address, // discoveryRequester
            receiverJettonWallet.address, // expectedJettonWallet
            notificationTx.inMessage!.body!, // original JettonNotification as action
            notificationTx.lt, // discoveryId (logical time)
        )
        const proxyAddress = discoveryProxyContract.address

        // Step 3: TEP89DiscoveryProxy deployment by receiver contract
        expect(transferResult.transactions).toHaveTransaction({
            from: jettonReceiverContract.address,
            to: proxyAddress,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // ProvideWalletAddress to JettonMaster
            deploy: true,
        })

        // Step 4: Proxy requests wallet address from jetton master
        expect(transferResult.transactions).toHaveTransaction({
            from: proxyAddress,
            to: jettonMinter.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // TakeWalletAddress response
            op: JettonMinter.opcodes.ProvideWalletAddress,
        })

        // Step 5: Jetton master responds with wallet address
        expect(transferResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: proxyAddress,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // TEP89DiscoveryResult to receiver
            op: JettonMinter.opcodes.TakeWalletAddress,
        })

        // Step 6: Proxy sends discovery result back to receiver contract
        expect(transferResult.transactions).toHaveTransaction({
            from: proxyAddress,
            to: jettonReceiverContract.address,
            success: true,
            exitCode: 0,
            op: JettonReceiver.opcodes.TEP89DiscoveryResult,
        })

        // Verify receiver contract processed the transfer successfully
        const finalAmount = await jettonReceiverContract.getAmountChecker()
        expect(finalAmount).toEqual(transferAmount)

        const finalPayload = await jettonReceiverContract.getPayloadChecker()
        expect(finalPayload).toEqualSlice(forwardPayload.asSlice())
    })

    it("should reject malicious direct JettonNotification and refund tokens", async () => {
        // Attempt to send JettonNotification directly (bypassing jetton wallet)
        const maliciousNotification: JettonNotification = {
            $$type: "JettonNotification",
            queryId: 0n,
            amount: toNano(1),
            forwardPayload: beginCell().storeUint(239, 17).asSlice(),
            sender: deployer.address,
        }

        const notificationCell = beginCell()
            .store(storeJettonNotification(maliciousNotification))
            .endCell()

        // Send malicious notification directly from deployer (not from jetton wallet)
        const maliciousResult = await deployer.send({
            to: jettonReceiverContract.address,
            value: toNano(1),
            body: notificationCell,
        })

        // Step 1: JettonNotification triggers TEP-89 discovery (malicious attempt)
        const notificationTx = findTransactionRequired(maliciousResult.transactions, {
            to: jettonReceiverContract.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // Deploy TEP89DiscoveryProxy
            op: JettonWallet.opcodes.JettonNotification,
        })

        // Calculate expected proxy address based on discovery parameters
        const discoveryProxyContract = await TEP89DiscoveryProxy.fromInit(
            jettonMinter.address, // jettonMaster
            jettonReceiverContract.address, // discoveryRequester
            deployer.address, // expectedJettonWallet (sender from notification)
            notificationTx.inMessage!.body!, // malicious notification as action
            notificationTx.lt, // discoveryId
        )
        const proxyAddress = discoveryProxyContract.address

        // Step 2: TEP89DiscoveryProxy deployment by receiver contract
        expect(maliciousResult.transactions).toHaveTransaction({
            from: jettonReceiverContract.address,
            to: proxyAddress,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // ProvideWalletAddress to JettonMaster
            deploy: true,
        })

        // Step 3: Proxy requests wallet address from jetton master
        expect(maliciousResult.transactions).toHaveTransaction({
            from: proxyAddress,
            to: jettonMinter.address,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // TakeWalletAddress response
            op: JettonMinter.opcodes.ProvideWalletAddress,
        })

        // Step 4: Jetton master responds with wallet address
        expect(maliciousResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: proxyAddress,
            success: true,
            exitCode: 0,
            outMessagesCount: 1, // TEP89DiscoveryResult to receiver
            op: JettonMinter.opcodes.TakeWalletAddress,
        })

        // Step 5: Proxy sends discovery result back to receiver contract (mismatch detected)
        expect(maliciousResult.transactions).toHaveTransaction({
            from: proxyAddress,
            to: jettonReceiverContract.address,
            success: true,
            exitCode: 0,
            op: JettonReceiver.opcodes.TEP89DiscoveryResult,
            outMessagesCount: 1, // Refund transfer
        })

        // Step 6: Receiver contract refunds tokens to malicious sender
        expect(maliciousResult.transactions).toHaveTransaction({
            from: jettonReceiverContract.address,
            to: deployer.address,
            success: true,
            exitCode: 0,
            op: JettonWallet.opcodes.JettonTransfer,
        })

        // Verify malicious transfer was rejected (no state changes)
        const finalAmount = await jettonReceiverContract.getAmountChecker()
        expect(finalAmount).toEqual(0n)

        const finalPayload = await jettonReceiverContract.getPayloadChecker()
        expect(finalPayload).toEqualSlice(beginCell().asSlice())
    })
})
