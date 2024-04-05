// This script does self sol transfer
// node selfSolTransfer.mjs
// Read this to optimize your transactions
// https://docs.triton.one/chains/solana/sending-txs

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import dotenv from "dotenv";
import bs58 from "bs58";

dotenv.config();

const RPC_ENDPOINT =
  process.env.RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";

const USER_KEYPAIR = Keypair.fromSecretKey(
  bs58.decode(process.env.WALLET_PRIVATE_KEY)
);

const CU_BUDGET = 500;
const PRIORITY_FEE_LAMPORTS = 1;
const TX_RETRY_INTERVAL = 2000;

const connection = new Connection(RPC_ENDPOINT);

async function main() {
  let blockhashResult = await connection.getLatestBlockhash({
    commitment: "confirmed",
  });

  // V0 transaction message
  const messagev0 = new TransactionMessage({
    payerKey: USER_KEYPAIR.publicKey,
    recentBlockhash: blockhashResult.blockhash,
    instructions: [
      // Setting Compute Units Budget
      ComputeBudgetProgram.setComputeUnitLimit({
        units: CU_BUDGET,
      }),

      // Setting Priority Fees
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1_000_000 * PRIORITY_FEE_LAMPORTS,
      }),

      // Instruction for SOL transfer
      SystemProgram.transfer({
        fromPubkey: USER_KEYPAIR.publicKey,
        toPubkey: USER_KEYPAIR.publicKey,
        lamports: 5000,
      }),
    ],
  }).compileToV0Message();

  // V0 transaction
  const tx = new VersionedTransaction(messagev0);

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

  console.log(`${new Date().toISOString()} Transaction simulation successful result:`);
  console.log(simulationResult);

  let txSignature = null;
  let confirmTransactionPromise = null;
  let confirmedTx = null;

  const signatureRaw = tx.signatures[0];
  txSignature = bs58.encode(signatureRaw);

  let txSendAttempts = 1;

  // In the following section, we wait and constantly check for the transaction to be confirmed
  // and resend the transaction if it is not confirmed within a certain time interval
  // thus handling tx retries on the client side rather than relying on the RPC

  try {
    // Send and wait confirmation (subscribe on confirmation before sending)
    console.log(`${new Date().toISOString()} Subscribing to transaction confirmation`);

    // confirmTransaction throws error, handle it
    confirmTransactionPromise = connection.confirmTransaction(
      {
        signature: txSignature,
        blockhash: blockhashResult.blockhash,
        lastValidBlockHeight: blockhashResult.lastValidBlockHeight,
      },
      "confirmed"
    );

    console.log(`${new Date().toISOString()} Sending Transaction ${txSignature}`);
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

      console.log(`${new Date().toISOString()} Tx not confirmed after ${TX_RETRY_INTERVAL * txSendAttempts++}ms, resending`);

      await connection.sendRawTransaction(tx.serialize(), {
        // Skipping preflight i.e. tx simulation by RPC as we simulated the tx above
        // This allows Triton RPCs to send the transaction through multiple pathways for the fastest delivery
        skipPreflight: true,
        // Setting max retries to 0 as we are handling retries manually
        // Set this manually so that the default is skipped
        maxRetries: 0,
      });
    }
  } catch (error) {
    console.error(error);
  }

  if (!confirmedTx) {
    console.log(`${new Date().toISOString()} Transaction failed`);
    return;
  }

  console.log(`${new Date().toISOString()} Transaction successful`);
  console.log(`${new Date().toISOString()} Explorer URL: https://explorer.solana.com/tx/${txSignature}`);
}

main();
