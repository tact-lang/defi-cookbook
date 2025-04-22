# Examples in Tact

## Overview

This project includes a set of examples for common use cases in Tact. This includes:

- Smart contracts written in the Tact language.
- A TypeScript + Jest testing environment with `@ton/sandbox`.
- Examples of off-chain and on-chain integrations with Jettons and other TEPs in the future.

## Structure

The [jettons](./jettons/) folder consists of examples of common actions with Jettons in Tact.

Each folder inside it includes examples for one or more of the following:

- `*.tact` - Smart contracts written in Tact that run on-chain and need to be deployed. Use `yarn build` to compile them.
- `*.spec.ts` - TypeScript test files that validate the logic of the smart contracts. These tests also serve as examples of how to interact with smart contracts off-chain. Use `yarn test` to run them.
- `*.ts` - Scripts that perform actions on the blockchain. Use `yarn ts-node filename` to execute them.

## License

This project is licensed under the MIT License.
