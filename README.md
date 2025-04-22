# Examples in Tact

## Overview

This project includes a set of examples for common use-cases in Tact. This includes:

- Smart contracts written in the Tact language.
- TypeScript + Jest testing environment with `@ton/sandbox`.
- Examples of off-chain and on-chain integrations with Jettons and other TEP's in future

## Structure

[jettons](./jettons/) folder consists of examples of common actions with Jettons in Tact.

Each folder inside it includes examples for one or more of the following:

- `*.tact` - Written using Tact, smart contracts that run on-chain and need to be deployed. Use `yarn build` to build them.

- `*.spec.ts` - Typescript test files, that check the logic for the smart contracts. Could be a great example of how to interact with smart-contract from outside (off-chain). Use `yarn test` to run them

- `*.ts` - Scripts, that perform actions on the blockchain. Use `yarn ts-node filename` to run them

## License

This project is licensed under the MIT License.
