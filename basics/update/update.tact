message(0x7b285487) CounterAction {}

message(0xa7ffd45e) UpdateContractRequest {
    code: Cell;
    data: Cell;
}

// this is the initial counter contract
// that includes update functionality
contract CounterBeforeUpdate(
    data: Int as uint32,
    updateAuthority: Address,
) {
    // increase counter action
    receive(msg: CounterAction) {
        self.data += 1;
    }

    receive(msg: UpdateContractRequest) {
        require(sender() == self.updateAuthority, "Incorrect update authority");
        setData(msg.data);
        setCode(msg.code);
        exit();
    }

    get fun data(): Int {
        return self.data;
    }
}

// this contract contains the code that we want
// to update our initial counter to
contract CounterAfterUpdate(
    data: Int as uint32,
    // we remove updateAuthority from contract storage
    // since we don't need it anymore
) {
    // in this contract we decrease counter
    // instead of increasing it
    receive(msg: CounterAction) {
        self.data -= 1;
    }

    get fun data(): Int {
        return self.data;
    }
}

asm fun setData(newData: Cell) {
    c4 POP
}

asm fun setCode(newCode: Cell) {
    SETCODE
}

// helper function, stops the execution
asm fun exit() {RET}
