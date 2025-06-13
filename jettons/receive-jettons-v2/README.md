# Jetton Receiver v2

## 1. Overview

This example demonstrates how to integrate the `UseJetton` trait to create a contract that can receive jetton transfers in a safe and standards-compliant manner. The contract serves as a practical implementation showing the trait's capabilities.

## 2. Processing Flow

1. **Initial Deployment** – Deploy `JettonReceiver` with the required parameters:
    - `jettonMaster` – address of the jetton master contract
    - `jettonWallet = null` – wallet address will be resolved automatically
    - `amountChecker = 0` and `payloadChecker = b{}` – testing state variables
2. **First Transfer** – When the first jetton transfer arrives:
    - The embedded `UseJetton` trait initiates the TEP-89 discovery process
    - After successful discovery, the trait stores the resolved wallet address
    - The original `JettonNotification` is delivered to `receiveJettonHandler`
3. **Transfer Processing** – Inside `receiveJettonHandler`, the contract:
    - Accumulates `msg.amount` in `amountChecker` (running total)
    - Updates `payloadChecker` with `msg.forwardPayload` (latest payload)
4. **Subsequent Transfers** – Future transfers from the same wallet repeat step 3
5. **Security** – Transfers from unauthorized wallets are automatically refunded and rejected

## 3. Implementation Details

The example contract implements the minimal required interface:

- Extends the `UseJetton` trait
- Implements `receiveJettonHandler(msg: JettonNotification)` callback
- Provides getter methods for testing and verification

## 4. Usage

1. Deploy the contract with `jettonWallet = null`
2. Send jetton transfers to test the functionality
3. Use getter methods to verify the accumulated amounts and payloads
4. Observe automatic refunds for transfers from incorrect wallets

## 5. Related Documentation

For detailed trait documentation, see [`jettons/use-jetton`](../use-jetton).
