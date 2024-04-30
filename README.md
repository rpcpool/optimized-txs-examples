# Optimized Transactions Examples

[Read this](https://docs.triton.one/chains/solana/sending-txs) to improve optimize your transactions and improve delivery

This repo contains scripts which implement transaction optimizations such as:
- Skipping preflight
- Handling retries client side
- Minimizing compute units
- Adding priority fees

### Scripts

Run a script by executing `node <script-name>.mjs`. For eg `node selfSolTransfer.mjs`  
Refer the environment variables needed in the `.env.sample` file  

1. `selfSolTransfer.mjs`: Transfer 5000 lamports to yourself
2. `jupiterSwap.mjs`: Swap using the Jupiter API
