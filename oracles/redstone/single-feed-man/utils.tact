struct DivModResult {
    quotient: Int;
    remainder: Int;
}
asm extends fun divmod(self: Int, other: Int): DivModResult { DIVMOD }

asm(self to from) extends fun inRange(self: Int, from: Int, to: Int): Bool { s2 PUSH MAX MIN EQUAL }

asm extends fun numberTrailingZeros(self: Slice): Int { SDCNTTRAIL0 }
