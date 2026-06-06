---
name: Privy
description: Use when building authentication systems, embedded wallets, or wallet infrastructure for web3 applications. Reach for this skill when implementing user onboarding, creating self-custodial wallets, managing wallet controls and policies, signing transactions, or integrating wallet functionality into web, mobile, or backend applications.
metadata:
    mintlify-proj: privy
    version: "1.0"
---

# Privy Skill Reference

## Product summary

Privy is a wallet and authentication infrastructure platform that enables developers to build web3 applications with embedded wallets, user authentication, and programmable wallet controls. Use Privy to onboard users with email/social/wallet login, create self-custodial embedded wallets, manage wallet policies and authorization, and sign transactions across 50+ blockchains (Ethereum, Solana, Base, etc.).

**Key files and configuration:**
- Dashboard: https://dashboard.privy.io (manage app settings, API credentials, login methods, policies)
- App ID and App Secret: Found in Dashboard > Configuration > App settings > Basics
- Client SDKs: React (`@privy-io/react-auth`), React Native, Swift, Android, Flutter, Unity
- Server SDKs: Node.js (`@privy-io/node`), Java, Go, Rust, Ruby
- REST API: Base URL `https://api.privy.io` with Basic Auth (app ID + app secret)

**Primary documentation:** https://docs.privy.io

## When to use

Reach for Privy when:
- Building user authentication (email, SMS, social, passkey, wallet login)
- Creating embedded wallets for users or applications
- Implementing wallet controls (owners, signers, policies)
- Signing and sending transactions on EVM or Solana chains
- Managing user onboarding flows with wallet provisioning
- Setting up server-side wallet automation with authorization keys
- Integrating external wallets (MetaMask, Phantom) into your app
- Implementing multi-factor authentication for wallet actions
- Building trading apps, agents, or treasury management systems
- Querying user data, wallets, or transaction status

## Quick reference

### SDK initialization

| Platform | Code | Notes |
|----------|------|-------|
| React | `<PrivyProvider appId="..." clientId="..." config={{...}}>` | Wrap app root; use `usePrivy()` hook |
| Node.js | `new PrivyClient({appId: '...', appSecret: '...'})` | Server-side only; requires app secret |
| React Native | `<PrivyProvider appId="..." clientId="...">` | Mobile apps; similar to React |
| Swift/Android | `PrivyConfig(appId: "...", clientId: "...")` | Native mobile; configure in app setup |

### Authentication methods

Privy supports: email, SMS, WhatsApp, Google, Apple, Discord, Twitter, GitHub, LinkedIn, Spotify, Instagram, TikTok, Farcaster, Telegram, passkeys, wallet (SIWE/SIWS), custom OAuth, guest accounts.

Enable in Dashboard > Configuration > Login methods, or pass `loginMethods` array to client SDK.

### Common API endpoints

| Task | Method | Endpoint |
|------|--------|----------|
| Create wallet | POST | `/api/v1/wallets` |
| Get wallet | GET | `/api/v1/wallets/{wallet_id}` |
| Get user | GET | `/api/v1/users/{user_id}` |
| Send transaction | POST | `/api/v1/wallets/{wallet_id}/ethereum/eth_sendTransaction` |
| Create policy | POST | `/api/v1/policies` |
| Get transaction | GET | `/api/v1/transactions/{transaction_id}` |

All requests require `Authorization: Basic {base64(appId:appSecret)}` and `privy-app-id: {appId}` headers.

### Wallet ownership models

| Model | Owner | Use case |
|-------|-------|----------|
| User-owned | User (via Privy) | Self-custodial consumer wallets |
| User + server | User + authorization key | Automated trading, limit orders |
| Server-owned | Authorization key | Treasury, agents, bots |
| Custodial | Licensed custodian | Regulated accounts |

## Decision guidance

### When to use client SDK vs server SDK

| Scenario | Use |
|----------|-----|
| User login, wallet creation, signing in browser/mobile | Client SDK (React, React Native, Swift, Android) |
| Server-side wallet management, batch operations, automation | Server SDK (Node.js, Java, Go, Rust, Ruby) |
| Querying user data from backend | Server SDK with identity token or user ID |
| Signing transactions with authorization keys | Server SDK with authorization context |
| Building API-only integration | REST API directly |

### When to use Privy auth vs custom auth

| Scenario | Use |
|----------|-----|
| No existing auth system; want email/social/wallet login | Privy authentication |
| Already have Auth0, Firebase, or custom JWT auth | JWT-based auth integration |
| Need both Privy auth and custom provider | Privy auth (can link custom accounts) |

### When to use embedded vs external wallets

| Scenario | Use |
|----------|-----|
| New users, seamless onboarding, no crypto experience | Embedded wallets |
| Users have existing MetaMask/Phantom, want to use it | External wallets |
| Need both options | Support both (user can choose) |

## Workflow

### 1. Set up a Privy app

1. Go to https://dashboard.privy.io and create an app
2. Copy your **App ID** and **App Secret** from Configuration > App settings > Basics
3. Configure login methods in Configuration > Login methods
4. (Optional) Set allowed domains in Configuration > App settings > Domains
5. (Optional) Create authorization keys in Wallets > Authorization keys for server-side control

### 2. Integrate client SDK (React example)

1. Install: `npm install @privy-io/react-auth`
2. Wrap app with `<PrivyProvider appId="..." clientId="..." config={{embeddedWallets: {ethereum: {createOnLogin: 'users-without-wallets'}}}}>` 
3. Use `usePrivy()` hook to access `user`, `login()`, `logout()`
4. Use `useWallets()` hook to access `wallets` and `createWallet()`
5. Use `useSendTransaction()` or `useSignMessage()` for signing

### 3. Integrate server SDK (Node.js example)

1. Install: `npm install @privy-io/node`
2. Initialize: `const privy = new PrivyClient({appId: '...', appSecret: '...'})`
3. Create wallet: `await privy.wallets().create({chain_type: 'ethereum', owner: {user_id: 'did:privy:...'}})`
4. Sign transaction: `await privy.wallets().ethereum().signTransaction(walletId, {...}, {authorization_context: {...}})`
5. Get user: `await privy.users().get({id_token: 'token'})` or `await privy.users().get({user_id: 'did:privy:...'})`

### 4. Create and apply policies

1. Define policy rules (transaction limits, approved recipients, contract interactions)
2. POST to `/api/v1/policies` with rule conditions
3. Assign policy to wallet owner or signer during wallet creation or update
4. Policies are evaluated in secure enclave before transaction execution

### 5. Set up webhooks (for production)

1. Go to Dashboard > Webhooks
2. Register endpoint URL
3. Select events (user.created, transaction.confirmed, wallet.funds_deposited, etc.)
4. Verify webhook signature using `privy-signature` header
5. Handle events and update your backend state

## Common gotchas

- **App Secret exposure**: Never expose app secret in client code. Use only on backend. If exposed, regenerate immediately in Dashboard.
- **Missing `ready` check**: Always check `usePrivy().ready` before consuming Privy state in React. Privy initializes asynchronously.
- **Authorization header format**: Use `Authorization: Basic {base64(appId:appSecret)}`, not Bearer token. Encode as `base64(appId + ':' + appSecret)`.
- **Policy violations silently fail**: Transactions rejected by policies return `policy_violation` error. Check policy rules match your transaction intent.
- **User ID format**: Privy user IDs are DIDs like `did:privy:xxxxx`. Don't confuse with wallet addresses.
- **Wallet creation requires owner**: Every wallet must have an owner (user ID or authorization key). Wallets without owners cannot be created.
- **Authorization keys are not recoverable**: Private keys generated for authorization keys are not stored by Privy. Save them securely or regenerate.
- **Idempotency keys**: Use `privy-idempotency-key` header for wallet creation and transactions to prevent duplicates on retry.
- **Request expiry**: Include `privy-request-expiry` header (Unix timestamp) for API requests. Requests older than 5 minutes are rejected.
- **Solana peer dependencies**: React SDK with Solana requires `@solana/kit` and related packages. Install separately if using Solana.
- **External wallet chain configuration**: External wallets require explicit chain configuration in Dashboard or SDK config. Not all wallets support all chains.

## Verification checklist

Before submitting work with Privy:

- [ ] App ID and App Secret are correctly configured (secret never exposed in client code)
- [ ] PrivyProvider wraps the app root and `ready` state is checked before using Privy
- [ ] Authentication method is enabled in Dashboard and matches SDK configuration
- [ ] Wallet creation specifies an owner (user ID or authorization key)
- [ ] Policies are created and assigned if transaction limits are needed
- [ ] Authorization headers include both `Authorization: Basic` and `privy-app-id` headers
- [ ] Idempotency keys are used for wallet creation and transaction endpoints
- [ ] Webhook endpoints are registered and signature verification is implemented
- [ ] Error handling covers `policy_violation`, `insufficient_funds`, and `authorization` errors
- [ ] User data is queried using identity token (preferred) or user ID, not email/wallet address alone
- [ ] Transaction requests include `privy-request-expiry` header with future timestamp
- [ ] External wallets are configured in Dashboard if supporting MetaMask/Phantom
- [ ] Rate limits are handled (implement exponential backoff for 429 responses)

## Resources

**Comprehensive navigation:** https://docs.privy.io/llms.txt

**Critical documentation pages:**
- [About Privy & Getting Started](https://docs.privy.io/basics/get-started/about)
- [Wallet Overview & Types](https://docs.privy.io/wallets/overview)
- [Authentication Overview](https://docs.privy.io/authentication/overview)
- [Controls & Policies](https://docs.privy.io/controls/overview)
- [API Reference](https://docs.privy.io/api-reference/introduction)
- [Error Handling](https://docs.privy.io/basics/troubleshooting/error-handling/api-errors)

---

> For additional documentation and navigation, see: https://docs.privy.io/llms.txt