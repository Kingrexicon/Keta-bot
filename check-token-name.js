require('dotenv').config();
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  const mintAddress = process.argv[2] || 'USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT';
  const mintPubkey = new PublicKey(mintAddress);
  
  console.log('Checking token mint:', mintAddress);
  console.log('');
  
  const mintInfo = await getMint(connection, mintPubkey);
  
  console.log('=== Token Mint Info ===');
  console.log('Decimals:', mintInfo.decimals);
  console.log('Supply:', Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals));
  console.log('');
  
  // Try to get Metaplex metadata (Token Metadata Program)
  // The metadata PDA is derived from the mint address
  const { PublicKey: PubKey } = require('@solana/web3.js');
  
  // Metaplex Token Metadata Program ID
  const TOKEN_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  
  // Derive the metadata account PDA
  const [metadataPDA] = await PubKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM.toBuffer(),
      mintPubkey.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM
  );
  
  console.log('Metadata PDA:', metadataPDA.toString());
  
  try {
    const accountInfo = await connection.getAccountInfo(metadataPDA);
    if (accountInfo && accountInfo.data) {
      // Parse the metadata - skip the first byte (key) and next 32 bytes (update authority)
      // Then 32 bytes for mint, then name (variable length)
      const data = accountInfo.data;
      let offset = 1 + 32 + 32; // key(1) + update_authority(32) + mint(32)
      
      // Read name (string with 4-byte length prefix)
      const nameLen = data.readUInt32LE(offset);
      offset += 4;
      const name = data.slice(offset, offset + nameLen).toString('utf8');
      offset += nameLen;
      
      // Read symbol (string with 4-byte length prefix)
      const symbolLen = data.readUInt32LE(offset);
      offset += 4;
      const symbol = data.slice(offset, offset + symbolLen).toString('utf8');
      
      console.log('Token Name:', name);
      console.log('Token Symbol:', symbol);
    } else {
      console.log('No metadata found on-chain.');
    }
  } catch (e) {
    console.log('Could not fetch metadata:', e.message);
  }
  
  console.log('');
  console.log('Open in explorer to verify:');
  console.log(`https://explorer.solana.com/address/${mintAddress}?cluster=devnet`);
}

main().catch(console.error);