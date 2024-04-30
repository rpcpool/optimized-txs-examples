import dotenv from "dotenv";
import web3, { Connection, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import axios from "axios";

dotenv.config();
const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const USER_KEYPAIR = web3.Keypair.fromSecretKey(
  bs58.decode(process.env.WALLET_PRIVATE_KEY)
);
const JUPITER_ENDPOINT = `${RPC_ENDPOINT}/jupiter`;

const SWAP_TOKEN_FROM = "So11111111111111111111111111111111111111112"; // SOL
const SWAP_TOKEN_TO = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
const SWAP_AMOUNT = 1000;

const COMMITMENT_LEVEL = "confirmed";
const PRIORITY_FEE_LAMPORTS = 1;
const TX_RETRY_INTERVAL = 2000;

const connection = new Connection(RPC_ENDPOINT, {
  commitment: COMMITMENT_LEVEL,
});

async function main() {
  let blockhash = await connection.getLatestBlockhash();

  let swapApiResult;

  let quoteResponse;
  let jupiterSwapTransaction;

  let txSignature = null;
  let confirmTransactionPromise = null;
  let confirmedTx = null;

  try {
    console.log(`${new Date().toISOString()} Fetching jupiter swap quote`);

    // Get quote for swap
    swapApiResult = await axios.get(
      `${JUPITER_ENDPOINT}/quote?inputMint=${SWAP_TOKEN_FROM}&outputMint=${SWAP_TOKEN_TO}&amount=${SWAP_AMOUNT}&slippageBps=50`
    );

    // throw error if response is not ok
    if (!(swapApiResult.status >= 200) && swapApiResult.status < 300) {
      throw new Error(
        `Failed to fetch jupiter swap quote: ${swapApiResult.status}`
      );
    }

    quoteResponse = swapApiResult.data;

    console.log(`${new Date().toISOString()} Fetched jupiter swap quote`);

    console.log(
      `${new Date().toISOString()} Fetching jupiter swap transaction`
    );

    // Get swap transaction
    // For priority fees and CUs, refer the following code and
    // https://station.jup.ag/docs/apis/swap-api#setting-priority-fee-for-your-transaction
    swapApiResult = await axios.post(`${JUPITER_ENDPOINT}/swap`, {
      quoteResponse: quoteResponse,
      userPublicKey: USER_KEYPAIR.publicKey.toBase58(),
      wrapAndUnwrapSol: true,

      // Setting this to `true` allows the endpoint to set the dynamic compute unit limit as required by the transaction
      dynamicComputeUnitLimit: true,

      // Setting the priority fees. This can be `auto` or lamport numeric value
      prioritizationFeeLamports: PRIORITY_FEE_LAMPORTS,
    });

    // throw error if response is not ok
    if (!(swapApiResult.status >= 200) && swapApiResult.status < 300) {
      throw new Error(
        `Failed to fetch jupiter swap transaction: ${swapApiResult.status}`
      );
    }

    jupiterSwapTransaction = swapApiResult.data;

    console.log(`${new Date().toISOString()} Fetched jupiter swap transaction`);

    const swapTransactionBuf = Buffer.from(
      jupiterSwapTransaction.swapTransaction,
      "base64"
    );

    const tx = VersionedTransaction.deserialize(swapTransactionBuf);
    tx.message.recentBlockhash = blockhash.blockhash;

    // Sign the transaction
    tx.sign([USER_KEYPAIR]);

    // Simulating the transaction
    const simulationResult = await connection.simulateTransaction(tx, {
      commitment: "confirmed",
    });

    if (simulationResult.value.err) {
      throw new Error(
        `Transaction simulation failed with error ${JSON.stringify(
          simulationResult.value.err
        )}`
      );
    }

    console.log(
      `${new Date().toISOString()} Transaction simulation successful result:`
    );
    console.log(simulationResult);

    const signatureRaw = tx.signatures[0];
    txSignature = bs58.encode(signatureRaw);

    let txSendAttempts = 1;

    console.log(
      `${new Date().toISOString()} Subscribing to transaction confirmation`
    );

    // confirmTransaction throws error, handle it
    confirmTransactionPromise = connection.confirmTransaction(
      {
        signature: txSignature,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      },
      "confirmed"
    );

    console.log(
      `${new Date().toISOString()} Sending Transaction ${txSignature}`
    );
    await connection.sendRawTransaction(tx.serialize(), {
      // Skipping preflight i.e. tx simulation by RPC as we simulated the tx above
      // This allows Triton RPCs to send the transaction through multiple pathways for the fastest delivery
      skipPreflight: true,
      // Setting max retries to 0 as we are handling retries manually
      // Set this manually so that the default is skipped
      maxRetries: 0,
    });

    confirmedTx = null;
    while (!confirmedTx) {
      confirmedTx = await Promise.race([
        confirmTransactionPromise,
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, TX_RETRY_INTERVAL)
        ),
      ]);
      if (confirmedTx) {
        break;
      }

      console.log(
        `${new Date().toISOString()} Tx not confirmed after ${
          TX_RETRY_INTERVAL * txSendAttempts++
        }ms, resending`
      );

      await connection.sendRawTransaction(tx.serialize(), {
        // Skipping preflight i.e. tx simulation by RPC as we simulated the tx above
        // This allows Triton RPCs to send the transaction through multiple pathways for the fastest delivery
        skipPreflight: true,
        // Setting max retries to 0 as we are handling retries manually
        // Set this manually so that the default is skipped
        maxRetries: 0,
      });
    }
  } catch (e) {
    console.error(`${new Date().toISOString()} Error: ${e}`);
  }

  if (!confirmedTx) {
    console.log(`${new Date().toISOString()} Transaction failed`);
    return;
  }

  console.log(`${new Date().toISOString()} Transaction successful`);
  console.log(
    `${new Date().toISOString()} Explorer URL: https://explorer.solana.com/tx/${txSignature}`
  );
}

main();
