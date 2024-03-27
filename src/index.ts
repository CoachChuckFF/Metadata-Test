import { clusterApiUrl, Connection, Keypair, sendAndConfirmTransaction, SystemProgram, Transaction } from '@solana/web3.js';
import { initializeKeypair } from '@solana-developers/helpers';
import dotenv from 'dotenv';
import { createInitializeInstruction, createUpdateFieldInstruction, pack, TokenMetadata } from '@solana/spl-token-metadata';
import { createInitializeMetadataPointerInstruction, createInitializeMintInstruction,  ExtensionType, getMintLen, LENGTH_SIZE, TOKEN_2022_PROGRAM_ID, TYPE_SIZE } from '@solana/spl-token';
dotenv.config();

async function main() {
  const connection = new Connection('http://127.0.0.1:8899', 'finalized');
  const payer = await initializeKeypair(connection);

  const EXTRA_BYTES = 0;

  const tokenName = 'Cat NFT';
  const tokenSymbol = 'EMB';
  const tokenAdditionalMetadata = {
    species: 'Cat',
    breed: 'Cool',
  }

    // 0. Setup Mint
    const mint = Keypair.generate();
    const decimals = 0; // NFT should have 0 decimals

    // 1. Create the metadata object
    const metadata: TokenMetadata = {
        mint: mint.publicKey,
        name: tokenName,
        symbol: tokenSymbol,
        uri: '',
        // additionalMetadata: [['customField', 'customValue']],
        additionalMetadata: Object.entries(tokenAdditionalMetadata).map(([key, value]) => [key, value]),
    };

    // 2. Allocate the mint
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length + EXTRA_BYTES;
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

    const createMintAccountInstruction = SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        lamports,
        newAccountPubkey: mint.publicKey,
        programId: TOKEN_2022_PROGRAM_ID,
        space: mintLen,
    });

    // 3. Initialize the metadata-pointer making sure that it points to the mint itself 
    const initMetadataPointerInstruction = createInitializeMetadataPointerInstruction(
        mint.publicKey,
        payer.publicKey,
        mint.publicKey, // Metadata account - points to itself
        TOKEN_2022_PROGRAM_ID,
    );

    // 4. Initialize the mint
    const initMintInstruction = createInitializeMintInstruction(
        mint.publicKey,
        decimals,
        payer.publicKey,
        payer.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    // 5. Initialize the metadata inside the mint
    const initMetadataInstruction = createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        mint: mint.publicKey,
        metadata: mint.publicKey,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
        mintAuthority: payer.publicKey,
        updateAuthority: payer.publicKey,
    });

    // 6. Set the additional metadata in the mint
    const setExtraMetadataInstructions = [];
    for (const attributes of Object.entries(tokenAdditionalMetadata)) {
        setExtraMetadataInstructions.push(
            createUpdateFieldInstruction({
                updateAuthority: payer.publicKey,
                metadata: mint.publicKey,
                field: attributes[0],
                value: attributes[1],
                programId: TOKEN_2022_PROGRAM_ID,
            })
        )
    }

    // 7. Put all of that in one transaction and send it to the network.
    const transaction = new Transaction().add(
        createMintAccountInstruction,
        initMetadataPointerInstruction,
        initMintInstruction,
        initMetadataInstruction,
        ...setExtraMetadataInstructions,
    );
    const transactionSignature = await sendAndConfirmTransaction(connection, transaction, [payer, mint]);



    // -------- TEST ---------

    console.log("Running tests");

    // This will succeed, as it is updating an existing field of the same length
    const testTransaction = new Transaction().add(
        createUpdateFieldInstruction({
            updateAuthority: payer.publicKey,
            metadata: mint.publicKey,
            field: 'species',
            value: 'Dog',
            programId: TOKEN_2022_PROGRAM_ID,
        })
    );
    const testTransactionSignature = await sendAndConfirmTransaction(connection, testTransaction, [payer]);


    try {
      // This will succeed, as it is updating an existing field of the same length
      const test2Transaction = new Transaction().add(
        createUpdateFieldInstruction({
            updateAuthority: payer.publicKey,
            metadata: mint.publicKey,
            field: 'species',
            value: 'Longer string that will put it over the amount of bytes it has',
            programId: TOKEN_2022_PROGRAM_ID,
        })
    );
    const test2TransactionSignature = await sendAndConfirmTransaction(connection, test2Transaction, [payer]);
    } catch (error) {
      console.log("This should fail");
    }

    try {
      const test3Transaction = new Transaction().add(
          createUpdateFieldInstruction({
              updateAuthority: payer.publicKey,
              metadata: mint.publicKey,
              field: 'New Field',
              value: 'This will fail as the field does not exist in the metadata schema',
              programId: TOKEN_2022_PROGRAM_ID,
          })
      );
      const test3TransactionSignature = await sendAndConfirmTransaction(connection, test3Transaction, [payer]);
    } catch (error) {
      console.log("This should fail");
    }
}

main()
  .then(() => {
    console.log('Finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });