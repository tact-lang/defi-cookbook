struct EcrecoverResult {
    pubKey: UncompressedPubKey;
    success: Bool;
}

struct EcdsaSignature {
    r: Int as uint256;
    s: Int as uint256;
    recoveryParam: Int as uint8;
}

struct UncompressedPubKey {
    h: Int;
    x: Int;
    y: Int;
}

asm inline fun ecrecover(hash: Int, v: Int, r: Int, s: Int): EcrecoverResult { ECRECOVER NULLSWAPIFNOT NULLSWAPIFNOT2 }

asm extends inline fun keccak(self: Builder): Int { 1 INT HASHEXT_KECCAK256 }
asm extends inline fun keccak(self: Slice): Int { 1 INT HASHEXT_KECCAK256 }

inline fun recoverAddress(hash: Int, signature: EcdsaSignature): Int {
    let result = ecrecover(hash, signature.recoveryParam, signature.r, signature.s);

    if (!result.success) {
        return 0;
    }

    let builder = beginCell().storeUint(result.pubKey.x, 256).storeUint(result.pubKey.y, 256);

    return builder.keccak() & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF; // mask to 20 bytes
}
