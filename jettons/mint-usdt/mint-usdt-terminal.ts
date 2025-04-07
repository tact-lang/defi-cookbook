import {toNano, TonClient, WalletContractV4, internal, fromNano} from "@ton/ton"
import {getHttpEndpoint} from "@orbs-network/ton-access"
import {mnemonicToPrivateKey} from "@ton/crypto"
import {Metadata} from "./metadata"
import {getMintTransaction} from "./mint-usdt"

/* 
   This is the metadata for the testnet USDT jetton.
   We need it to deploy the jetton minter.
   The metadata is stored on-chain in a cell dictionary.
*/
const JETTON_MINTER_PARAMETERS: Metadata = {
    name: "Tact USDT",
    description: "Testnet Tact USDT",
    symbol: "TUSDT",
    image: "https://raw.githubusercontent.com/tact-lang/tact/refs/heads/main/docs/public/logomark-light.svg",
}

const MINT_PARAMETERS = {
    jettonMintAmount: toNano(1_000_000), // 1 million TUSDT
    deployValueAmount: toNano(1), // 1 ton
}

const main = async () => {
    const mnemonics = "always spider ..." // 24 words mnemonic
    if (mnemonics === undefined) {
        console.error("Mnemonics is not provided, please add it to .env file")
        throw new Error("Mnemonics is not provided")
    }
    if (mnemonics.split(" ").length !== 24) {
        console.error("Invalid mnemonics, it should be 24 words")
        throw new Error("Invalid mnemonics, it should be 24 words")
    }

    const network = "testnet" // or "mainnet"

    const endpoint = await getHttpEndpoint({network})
    const client = new TonClient({
        endpoint: endpoint,
    })

    const keyPair = await mnemonicToPrivateKey(mnemonics.split(" "))
    const secretKey = keyPair.secretKey
    const workchain = 0 // basechain

    const deployerWallet = WalletContractV4.create({
        workchain: workchain,
        publicKey: keyPair.publicKey,
    })

    const deployerWalletContract = client.open(deployerWallet)

    const mintTransaction = await getMintTransaction(
        deployerWalletContract.address,
        JETTON_MINTER_PARAMETERS,
        MINT_PARAMETERS,
    )

    // Send a message on new address contract to deploy it
    const seqno: number = await deployerWalletContract.getSeqno()
    console.log(
        "🛠️Preparing new outgoing massage from deployment wallet. \n" +
            deployerWalletContract.address,
    )
    console.log("Seqno: ", seqno + "\n")

    // Get deployment wallet balance
    const balance: bigint = await deployerWalletContract.getBalance()

    console.log("Current deployment wallet balance = ", fromNano(balance).toString(), "💎TON")

    // Send transaction to v4 wallet to the blockchain
    await deployerWalletContract.sendTransfer({
        seqno,
        secretKey,
        messages: [
            internal({
                to: mintTransaction.to,
                value: mintTransaction.value,
                init: mintTransaction.stateInit,
                body: mintTransaction.body,
            }),
        ],
    })
    console.log("====== Deployment message sent to =======\n", mintTransaction.to)
    const link = `https://testnet.tonviewer.com/${mintTransaction.to.toString({
        urlSafe: true,
    })}`

    console.log(`You can soon check your deployed contract at ${link}`)
}

void main()
