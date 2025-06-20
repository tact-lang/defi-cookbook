import "./utils";

// only for 1-6 elements
struct FakeTuple {
    dontTouchMyPizza: Cell; // it's not a cell, but a tuple (Tact has no tuples)
    // https://www.youtube.com/watch?v=451XC5PigRY
}

asm extends fun atInt(self: FakeTuple, index: Int): Int { INDEXVAR }
asm extends fun length(self: FakeTuple): Int { TLEN }
asm fun emptyTuple(): FakeTuple { NIL }
asm extends mutates fun pushInt(self: FakeTuple, value: Int) { TPUSH}

// only for 1-6 elements
extends inline fun median(self: FakeTuple): Int {
    let sortedTuple = self.sort();
    let DivModResult { quotient: q, remainder: r } = sortedTuple.length().divmod(2);
    return (sortedTuple.atInt(q) + sortedTuple.atInt(q - 1 + r)) / 2;
}

// only for 1-6 elements
asm extends fun toTuple(self: Cell): FakeTuple {
    <{
        CTOS // slice
        16 LDU // length slice
        s1 s0 XCPU // slice length length
        7 LESSINT // slice length f(length < 7)
        5 THROWIFNOT // slice length
        <{
            PLDREF
            CTOS
            160 LDU
        }> PUSHCONT
        REPEAT
        DROP
        DEPTH
        TUPLEVAR
    }> PUSHCONT
    1 1 CALLXARGS
}

// only for 1-6 elements
asm extends fun sort(self: FakeTuple): FakeTuple { // not mutates
    CONT:<{
        6 EXPLODE
        DEC
        CONT:<{ }>
        CONT:<{ MINMAX }>
        CONT:<{ 
            MINMAX // 1 0 2 (0, 2)
            -ROT // 2 1 0 
            MINMAX // 2 0 1 (0, 1)
            ROT // 0 1 2 
            MINMAX // 0 1 2 (1, 2)
        }>
        CONT:<{
            MINMAX // 3 1 0 2 (0, 2)
            SWAP2 // 0 2 3 1
            MINMAX // 0 2 1 3 (1, 3)
            ROT // 0 1 3 2
            MINMAX // 0 1 2 3 (2, 3)
            SWAP2 // 2 3 0 1
            MINMAX // 2 3 0 1 (0, 1)
            3 ROLL // 3 0 1 2
            MINMAX // 3 0 1 2 (1, 2)
            3 ROLL // 0 1 2 3
        }>
        CONT:<{
            MINMAX // 2 4 1 0 3 (0, 3)
            SWAP2 // 2 0 3 4 1
            MINMAX // 2 0 3 1 4 (1, 4)
            s3 s4 XCHG2 // 4 1 3 0 2
            MINMAX // 4 1 3 0 2 (0, 2)
            SWAP2 // 4 0 2 1 3
            MINMAX // 4 0 2 1 3 (1, 3)
            s3 XCHG0 // 4 3 2 1 0 
            MINMAX // 4 3 2 0 1 (0, 1)
            s3 s4 s3 XCHG3 // 0 1 3 4 2 
            MINMAX // 0 1 3 2 4 (2, 4)
            s3 XCHG0 // 0 4 3 2 1
            MINMAX // 0 4 3 1 2 (1, 2)
            SWAP2 // 0 1 2 4 3
            MINMAX // 0 1 2 3 4 (3, 4)
            -ROT // 0 1 4 2 3
            MINMAX // 0 1 4 2 3 (2, 3)
            ROT // 0 1 2 3 4
        }>
        CONT:<{
            MINMAX // 4 2 3 1 0 5 (0, 5)
            SWAP2 // 4 2 0 5 3 1
            MINMAX // 4 2 0 5 1 3 (1, 3)
            2 4 BLKSWAP // 0 5 1 3 4 2
            MINMAX // 0 5 1 3 2 4 (2, 4)
            s3 XCHG0 // 0 5 4 3 2 1
            MINMAX // 0 5 4 3 1 2 (1, 2)
            SWAP2 // 0 5 1 2 4 3
            MINMAX // 0 5 1 2 3 4 (3, 4)
            s0 s4 s1 XCHG3 // 0 3 1 4 2 5
            MINMAX // 0 3 1 4 2 5 (2, 5)
            2 4 BLKSWAP // 1 4 2 5 0 3
            MINMAX // 1 4 2 5 0 3 (0, 3)
            s5 XCHG0 // 3 4 2 5 0 1
            MINMAX  // 3 4 2 5 0 1 (0, 1)
            s5 s3 s2 XCHG3 // 5 4 0 1 2 3
            MINMAX // 5 4 0 1 2 3 (2, 3)
            2 4 BLKSWAP // 0 1 2 3 5 4
            MINMAX // 0 1 2 3 4 5 (4, 5)
            2 3 BLKSWAP // 0 3 4 5 1 2
            MINMAX // 0 3 4 5 1 2 (1, 2)
            2 3 BLKSWAP // 0 5 1 2 3 4
            MINMAX // 0 5 1 2 3 4 (3, 4)
            4 ROLL
        }>

        6 TUPLE

        SWAP INDEXVAR EXECUTE DEPTH TUPLEVAR

    }> 1 1 CALLXARGS
}
