import "@ton/test-utils"
import {Cell, toNano} from "@ton/core"
import {Blockchain} from "@ton/sandbox"
import {CounterBeforeUpdate} from "../output/UpdateContract_CounterBeforeUpdate"
import {CounterAfterUpdate} from "../output/UpdateContract_CounterAfterUpdate"

describe("Update contract tests", () => {
    test("update contract", async () => {
        const blockchain = await Blockchain.create()
        const deployer = await blockchain.treasury("deployer")

        const initialCounterContract = blockchain.openContract(
            await CounterBeforeUpdate.fromInit(0n, deployer.address),
        )

        // deploy initial contract
        // and increase counter value to 1
        const firstActionRes = await initialCounterContract.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            {
                $$type: "CounterAction",
            },
        )

        expect(firstActionRes.transactions).toHaveTransaction({
            from: deployer.address,
            to: initialCounterContract.address,
            deploy: true,
            success: true,
        })

        const firstCounterValue = await initialCounterContract.getData()
        expect(firstCounterValue).toBe(1n)

        // for update we need new code cell and new data cell
        // we can achieve this by using `fromInit` method
        // on a new contract instance
        const newCounterContractState = await CounterAfterUpdate.fromInit(firstCounterValue)

        const updateResult = await initialCounterContract.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            {
                $$type: "UpdateContractRequest",
                code: newCounterContractState.init?.code!,
                data: newCounterContractState.init?.data!,
            },
        )

        expect(updateResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: initialCounterContract.address,
            success: true,
        })

        const counterContractStateAfterUpdate = await blockchain
            .provider(initialCounterContract.address)
            .getState()

        if (counterContractStateAfterUpdate.state.type !== "active") {
            throw new Error("Contract should be active after update")
        }

        // check that contract state is updated
        expect(Cell.fromBoc(counterContractStateAfterUpdate.state.code!)[0]).toEqualCell(
            newCounterContractState.init?.code!,
        )
        expect(Cell.fromBoc(counterContractStateAfterUpdate.state.data!)[0]).toEqualCell(
            newCounterContractState.init?.data!,
        )

        // to correctly interact with the updated contract
        // we need to open it again with another wrapper
        const updatedCounterContract = blockchain.openContract(
            CounterAfterUpdate.fromAddress(initialCounterContract.address),
        )

        // check that counter value is still the same
        const updatedCounterValue = await updatedCounterContract.getData()
        expect(updatedCounterValue).toBe(firstCounterValue)

        // decrement counter value to 0
        const secondActionRes = await updatedCounterContract.send(
            deployer.getSender(),
            {value: toNano("0.1")},
            {
                $$type: "CounterAction",
            },
        )
        expect(secondActionRes.transactions).toHaveTransaction({
            from: deployer.address,
            to: updatedCounterContract.address,
            success: true,
        })

        const secondCounterValue = await updatedCounterContract.getData()
        expect(secondCounterValue).toBe(0n)
    })
})
