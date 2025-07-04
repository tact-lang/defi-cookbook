# Examples in Tact

## Overview

This project includes a set of examples for common use cases in Tact and consists of:

- Smart contracts written in the Tact language.
- A TypeScript + Jest testing environment with `@ton/sandbox`.
- Examples of off-chain and on-chain integrations with Jettons. Other TEPs are planned too.

> If you're new to TON and Tact, please check https://docs.tact-lang.org/

## Structure

The [jettons](./jettons/) folder consists of examples of common actions with Jettons in Tact.

Each folder inside it includes examples for one or more of the following:

- `*.tact` - Smart contracts written in Tact that run on-chain and need to be deployed. Use `yarn build` to compile them.
- `*.spec.ts` - TypeScript test files that validate the logic of the smart contracts. These tests also serve as examples of how to interact with smart contracts off-chain. Use `yarn test` to run them.
- `*.ts` - Scripts that perform actions on the blockchain. Use `yarn ts-node filename` to execute them.

## Examples

<details>
  <summary>Basics</summary>

### Update contract

[Update already deployed contract](./basics/update/)

These examples demonstrate how to update already deployed contract code and data. Note that this operation can permanently lock all funds present on the account if done incorrectly, so all production updates should be tested in the testnet first.

</details>

<details>
  <summary>Jettons</summary>

### Receive Jettons

[Receive and verify incoming Jettons](./jettons/receive-jettons/)

This example demonstrates how to receive and verify incoming Jettons. It can be extended to support any custom Jetton implementation and handle additional logic after receiving funds.

### Send Jettons

[Send Jettons from your contract](./jettons/send-jettons/)

This example shows how to send Jettons from a contract. It includes both basic and extended modes for sending Jettons, allowing for custom payloads and additional parameters.

### Mint USDT

[Mint USDT](./jettons/mint-usdt/)

This example provides tools to mint USDT Jettons on the testnet. It includes a terminal script for deploying a Jetton minter and minting Jettons, as well as a Telegram bot that generates QR codes for minting transactions.

### On-Chain API

[On-Chain API for Jettons](./jettons/onchain-api/)

This example demonstrates how to interact with Jetton contracts on-chain. It includes fetching Jetton wallet addresses and balances directly from the blockchain, showcasing how to integrate on-chain data into your applications.

### Send USDT

[Send USDT from your contract](./jettons/send-usdt/)

This example focuses on sending USDT (Governance) Jettons. It is very much like [Send Jettons](#send-jettons) example, but with slightly different message structures. It supports both basic and extended modes for sending Jettons.

### Receive USDT

[Receive USDT on your contract](./jettons/receive-usdt/)

This example illustrates how to receive USDT Jettons and verify incoming transfer notifications. It is tailored for governance Jettons and includes logic for handling governance-specific state initialization.

### Use Jetton Trait

[UseJetton Trait for safe jetton integration](./jettons/use-jetton/)

This example provides a reusable Tact trait that enables contracts to receive jetton transfers without requiring custom implementation of the TEP-89 wallet discovery protocol. The trait provides automatic wallet discovery, transfer validation, and security features including automatic refunds for unauthorized transfers.

### Receive Jettons v2

[Advanced jetton receiver using UseJetton trait](./jettons/receive-jettons-v2/)

This example demonstrates how to integrate the `UseJetton` trait to create a contract that can receive jetton transfers in a safe and standards-compliant manner.

</details>

## Contributing

**If a given example is missing, please send us a PR to add it!** Our aim is to have every example available in every option. We'd also love to see more contracts involving staking, wrapped tokens, oracles, DEXs and other TEPs. Please first create an issue for all new examples

## License

This project is licensed under the MIT License.
