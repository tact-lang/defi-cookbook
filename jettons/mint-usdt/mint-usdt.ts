import {Address, beginCell, storeStateInit, toNano} from "@ton/core"
import {GovernanceJettonMinter, storeMint} from "../output/Governance Jetton_GovernanceJettonMinter"
import {buildOnchainMetadata, Metadata} from "./metadata"

async function buildJettonMinterFromEnv(deployerAddress: Address, metadata: Metadata) {
    // build cell with metadata
    const content = buildOnchainMetadata(metadata)

    // use metadata to initialize the jetton minter
    return await GovernanceJettonMinter.fromInit(0n, deployerAddress, null, content)
}

type MintParameters = {
    jettonMintAmount: string
    deployValueAmount: string
}

// This function doesn't actually send anything, it just prepares the message
export const getMintTransaction = async (
    deployerAddress: Address,
    metadata: Metadata,
    mintParameters: MintParameters,
) => {
    const jettonMinter = await buildJettonMinterFromEnv(deployerAddress, metadata)

    /* 
        To get Testnet USDT we need to do two things:
            1. Deploy the jetton minter
            2. Send a mint transaction to the jetton minter

        We can do this in one transaction (sending one message) by utilizing stateInit and body fields of the message
        Down here we are preparing everything needed to create this message
    */
    const mintBody = beginCell()
        .store(
            storeMint({
                $$type: "Mint",
                queryId: 0n,
                masterMsg: {
                    $$type: "JettonTransferInternal",
                    queryId: 0n,
                    amount: toNano(mintParameters.jettonMintAmount),
                    sender: deployerAddress,
                    responseDestination: deployerAddress,
                    forwardTonAmount: 0n,
                    forwardPayload: beginCell().storeUint(0, 1).asSlice(),
                },
                toAddress: deployerAddress,
                tonAmount: 0n,
            }),
        )
        .endCell()

    const stateInit = {
        code: jettonMinter.init?.code,
        data: jettonMinter.init?.data,
    }

    const stateInitCell = beginCell().store(storeStateInit(stateInit)).endCell()
    const sendValue = toNano(mintParameters.deployValueAmount)

    return {
        to: jettonMinter.address,
        stateInitCell: stateInitCell,
        stateInit,
        body: mintBody,
        value: sendValue,
    }
}

const getMintBodyCell = async (deployerAddress: Address, mintParameters: MintParameters) => {
    const mintBody = beginCell()
        .store(
            storeMint({
                $$type: "Mint",
                queryId: 0n,
                masterMsg: {
                    $$type: "JettonTransferInternal",
                    queryId: 0n,
                    amount: toNano(mintParameters.jettonMintAmount),
                    sender: deployerAddress,
                    responseDestination: deployerAddress,
                    forwardTonAmount: 0n,
                    forwardPayload: beginCell().storeUint(0, 1).asSlice(),
                },
                toAddress: deployerAddress,
                tonAmount: 0n,
            }),
        )
        .endCell()

    return mintBody
}

export const getMintTransactionAsTonLink = async (
    deployerAddress: Address,
    minterAddress: Address,
    mintParameters: MintParameters,
) => {
    const mintBody = await getMintBodyCell(deployerAddress, mintParameters)
    const sendValue = toNano(mintParameters.deployValueAmount)

    const tonLink = `ton://transfer/${minterAddress.toString({
        urlSafe: true,
    })}?amount=${sendValue.toString()}&bin=${mintBody.toBoc().toString(`base64url`)}`

    return tonLink
}
