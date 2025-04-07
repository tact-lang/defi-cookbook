import dotenv from "dotenv"
import path from "path"

dotenv.config({path: path.resolve(__dirname, ".env")})

import {TonClient, WalletContractV4, internal, fromNano} from "@ton/ton"
import {getHttpEndpoint, Network} from "@orbs-network/ton-access"
import {mnemonicToPrivateKey} from "@ton/crypto"
import {Metadata} from "./metadata"
import {getMintTransaction} from "./mint-usdt"

/* 
   This is the metadata for the testnet USDT jetton.
   We need it to deploy the jetton minter.
   The metadata is stored on-chain in a cell dictionary.
*/
const JETTON_MINTER_PARAMETERS: Metadata = {
    name: process.env.JETTON_NAME ?? "Tact USDT",
    description: process.env.JETTON_DESCRIPTION ?? "Testnet Tact USDT",
    symbol: process.env.JETTON_SYMBOL ?? "TUSDT",
    image:
        process.env.JETTON_IMAGE ??
        "https://raw.githubusercontent.com/tact-lang/tact/refs/heads/main/docs/public/logomark-light.svg",
}

const MINT_PARAMETERS = {
    jettonMintAmount: process.env.MINT_AMOUNT ?? "1000000", // 1 million TUSDT
    deployValueAmount: process.env.VALUE ?? "0.15", // 0.15 ton
}

/*
    (Remember to install dependencies by running "yarn install" in the terminal)
    Here are the instructions to deploy the contract:
    1. Create new walletV4r2 or use existing one.
    2. Enter your mnemonics in .env file. (.env.example is provided)
    3. In .env file specify the network you want to deploy the contract.
    (testnet is chosen by default, if you are not familiar with it, read https://tonkeeper.helpscoutdocs.com/article/100-how-switch-to-the-testnet)

    4. In .env file specify the parameters of the Jetton. (Ticker, description, image, etc.)
    5. In .env file specify the total supply of the Jetton. It will be automatically converted to nano - jettons.
    Note: All supply will be automatically minted to your wallet.

    6. Run "yarn build" to compile the contract.
    7. Run this script by "yarn ts-node jettons/mint-usdt/mint-usdt-terminal.ts" in the terminal.
 */
const main = async () => {
    const mnemonics = process.env.MNEMONICS
    if (mnemonics === undefined) {
        console.error("Mnemonics is not provided, please add it to .env file")
        throw new Error("Mnemonics is not provided")
    }
    if (mnemonics.split(" ").length !== 24) {
        console.error("Invalid mnemonics, it should be 24 words")
        throw new Error("Invalid mnemonics, it should be 24 words")
    }

    const network = process.env.NETWORK ?? "testnet" // or "mainnet"

    const endpoint = await getHttpEndpoint({network: network as Network})
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
