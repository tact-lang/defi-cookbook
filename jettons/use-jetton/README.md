# UseJetton Trait

## 1. Overview

The `UseJetton` trait is a Tact trait that enables contracts to receive jetton transfers without requiring custom implementation of the TEP-89 wallet discovery protocol. The trait provides a secure, standards-compliant solution for jetton integration.

## 2. Processing Flow

1. **First Transfer** – The trait deploys a `TEP89DiscoveryProxy` contract that requests the wallet address from the Jetton Master using the TEP-89 standard
2. **Discovery Response** – The trait stores the resolved wallet address and forwards the original `JettonNotification` to the contract-specific handler
3. **Subsequent Transfers** – The trait verifies that the `sender()` matches the stored wallet address:
    - If verification succeeds, `receiveJettonHandler` is invoked
    - If verification fails, the transfer is automatically refunded

## 3. Integration Steps

1. Copy `use-jetton.tact` and `tep-89-discovery-proxy.tact` to your project
2. Add `with UseJetton` to your contract declaration
3. Implement the required `receiveJettonHandler(msg: JettonNotification)` method
4. Deploy your contract with `jettonWallet = null` – the trait will populate this field automatically after the first successful transfer

## 4. Security Features

- **Automatic wallet discovery** using TEP-89 standard instead of error-prone address calculation
- **Transfer validation** to prevent spoofed jetton notifications
- **Automatic refunds** for transfers from unauthorized wallets
- **State preservation** of original transfer payloads during discovery process

## 5. Example Implementation

A complete example contract demonstrating the trait usage is available in [`jettons/receive-jettons-v2`](../receive-jettons-v2).
