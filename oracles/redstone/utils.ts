import {
    getOracleRegistryStateSync,
    getSignersForDataServiceId,
    requestDataPackages,
} from "@redstone-finance/sdk"
import {
    DataPackage as RedstoneDataPackage,
    SignedDataPackage as RedstoneSignedDataPackage,
} from "@redstone-finance/protocol"
import {RedstoneOraclesState} from "@redstone-finance/oracles-smartweave-contracts"
import {beginCell, Cell, Slice} from "@ton/core"
import {
    EcdsaSignature,
    SignedDataPackageStruct,
    storeSignedDataPackageStruct,
} from "../output/SingleFeedMan_SingleFeedMan"
import {Signature as RedstoneSignature} from "@ethersproject/bytes"
import {getAddress, hexlify, toUtf8Bytes} from "ethers/lib/utils"

const REDSTONE_STATE: RedstoneOraclesState = getOracleRegistryStateSync()
const DATA_SERVICE_ID = "redstone-primary-prod"

export const bigIntToEthAddress = (bigInt: bigint) => {
    return getAddress(bigInt.toString(16))
}

export const feedIdToBigInt = (str: string): bigint => {
    return BigInt(hexlify(toUtf8Bytes(str)))
}

export const signersToBigInt = (signers: string[]) => {
    return signers.map(signer => BigInt(signer))
}

export const signersToStrings = (signers: bigint[]) => {
    return signers.map(signer => bigIntToEthAddress(signer))
}

export const packSignature = (signature: RedstoneSignature): EcdsaSignature => {
    return {
        $$type: "EcdsaSignature",
        r: BigInt(signature.r),
        s: BigInt(signature.s),
        recoveryParam: BigInt(signature.recoveryParam),
    }
}

export const serializeRedstoneDataPackage = (dataPackage: RedstoneDataPackage) => {
    return beginCell().storeBuffer(Buffer.from(dataPackage.toBytes())).endCell()
}

export const packSignedDataPackage = (
    dataPackage: RedstoneSignedDataPackage,
    index: bigint = 0n,
): SignedDataPackageStruct => {
    return {
        $$type: "SignedDataPackageStruct",
        index,
        signature: packSignature(dataPackage.signature),
        data: serializeRedstoneDataPackage(dataPackage.dataPackage).beginParse(),
    }
}

export const getRedstoneSigners = () => {
    return getSignersForDataServiceId(REDSTONE_STATE, DATA_SERVICE_ID)
}

export const getRedstoneSignedDataPackages = async (
    dataPackagesId: string,
    signers: string[] | bigint[],
): Promise<RedstoneSignedDataPackage[]> => {
    return (
        await requestDataPackages({
            dataServiceId: DATA_SERVICE_ID,
            dataPackagesIds: [dataPackagesId],
            uniqueSignersCount: signers.length,
            authorizedSigners: signers.map(signer =>
                typeof signer === "string" ? signer : bigIntToEthAddress(signer),
            ),
        })
    )[dataPackagesId]!
}

function serializeTupleShort<T>(tuple: T[], serializer: (item: T) => Cell): Cell {
    let endCell: Cell | undefined
    if (tuple.length > 7) {
        throw new Error("Tuple length is too long")
    }

    for (const item of tuple.slice().reverse()) {
        let builder = beginCell().storeSlice(serializer(item).asSlice())

        if (endCell) {
            builder.storeRef(endCell)
        }

        endCell = builder.endCell()
    }

    let builder = beginCell().storeUint(tuple.length, 16)

    if (endCell) {
        builder.storeRef(endCell)
    }

    return builder.endCell()
}

function deserializeTupleShort<T>(cell: Cell, deserializer: (slice: Slice) => T): T[] {
    let slice = cell.beginParse()
    const length = slice.loadUint(16)

    if (length > 7) {
        throw new Error("Tuple length is too long")
    }

    const tuple = new Array(length)

    for (let i = 0; i < length; i++) {
        slice = slice.loadRef().beginParse()
        tuple[i] = deserializer(slice)
    }

    return tuple
}

export const serializeSignedDataPackages = (
    signedDataPackages: RedstoneSignedDataPackage[],
    signers: string[],
) => {
    const signedDataPackagesStructs = signedDataPackages.map(signedDataPackage =>
        packSignedDataPackage(
            signedDataPackage,
            BigInt(
                signers.findIndex(signer => signer === signedDataPackage.recoverSignerAddress()),
            ),
        ),
    )

    return serializeTupleShort(signedDataPackagesStructs, signedDataPackageStruct =>
        beginCell().store(storeSignedDataPackageStruct(signedDataPackageStruct)).endCell(),
    )
}

export const serializeSigners = (signers: bigint[] | string[]) => {
    const signersBigInt = signers.map(signer =>
        typeof signer === "string" ? BigInt(signer) : signer,
    )
    return serializeTupleShort(signersBigInt, signer =>
        beginCell().storeUint(signer, 160).endCell(),
    )
}

export const deserializeSigners = (cell: Cell) => {
    return deserializeTupleShort(cell, slice => bigIntToEthAddress(slice.loadUintBig(160)))
}
