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
const MAX_TX_RETRIES = 3;

const connection = new Connection(RPC_ENDPOINT, {
  confirmTransactionInitialTimeout: 10,
});

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

  console.log("Transaction simulation successful result:");
  console.log(simulationResult);

  let txSignature = null;
  let confirmedTransaction = null;

  let attempts = 0;
  while (attempts < MAX_TX_RETRIES) {
    try {
      console.log("Sending Transaction");
      txSignature = await connection.sendRawTransaction(tx.serialize(), {
        // Skipping preflight i.e. tx simulation by RPC as we simulated the tx above
        // This allows Triton RPCs to send the transaction through multiple pathways for the fastest delivery
        skipPreflight: true,
      });

      console.log("Confirming Transaction");
      confirmedTransaction = await connection
        .confirmTransaction(
          {
            signature: txSignature,
            blockhash: blockhashResult.blockhash,
            lastValidBlockHeight: blockhashResult.lastValidBlockHeight,
          },
          "confirmed"
        )
        .catch((e) => {
          throw new Error(
            `Failed to confirm transaction ${txSignature} with error ${e}`
          );
        });

      break;
    } catch (e) {
      console.log(e);

      blockhashResult = connection.getLatestBlockhash({
        commitment: "confirmed",
      });

      tx.lastValidBlockHeight = blockhashResult.lastValidBlockHeight;
      tx.recentBlockhash = blockhashResult.blockhash;

      console.log(`Retrying transaction, attempt: ${++attempts}`);
    }
  }

  if (!confirmedTransaction) {
    console.log("Transaction failed");
    return;
  }

  console.log("Transaction successful, explorer URL:");
  console.log(`https://explorer.solana.com/tx/${txSignature}`);
}

main();
