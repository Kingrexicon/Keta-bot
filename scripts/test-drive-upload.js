/**
 * Google Drive Upload Diagnostic Test
 * 
 * Run this script to test if the Google Drive connection is working.
 * It will attempt to upload a small test image to your configured Drive folder.
 * 
 * Usage: node scripts/test-drive-upload.js
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const { uploadReceiptToDrive } = require('../src/services/backupService');

async function main() {
  console.log('========================================');
  console.log('  Google Drive Upload Diagnostic Test');
  console.log('========================================\n');

  // Check environment variables
  console.log('📋 Checking environment variables...');
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!keyPath) {
    console.error('❌ GOOGLE_SERVICE_ACCOUNT_KEY is not set in .env');
    process.exit(1);
  }
  console.log(`✅ GOOGLE_SERVICE_ACCOUNT_KEY: ${keyPath.substring(0, 40)}...`);

  if (!folderId) {
    console.error('❌ GOOGLE_DRIVE_FOLDER_ID is not set in .env');
    process.exit(1);
  }
  console.log(`✅ GOOGLE_DRIVE_FOLDER_ID: ${folderId}`);

  // Check if the service account key file exists
  const fs = require('fs');
  const path = require('path');
  const resolvedPath = keyPath.endsWith('.json') && fs.existsSync(
    path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath)
  ) ? (path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath)) : null;

  if (resolvedPath) {
    console.log(`✅ Service account key file exists at: ${resolvedPath}`);
    try {
      const keyContent = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      console.log(`   Client email: ${keyContent.client_email}`);
      console.log(`   Project ID: ${keyContent.project_id}`);
    } catch (e) {
      console.error(`❌ Failed to parse service account key file: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.log('⚠️  Service account key is not a file path — checking if it\'s base64/JSON...');
    try {
      const decoded = Buffer.from(keyPath, 'base64').toString('utf8');
      const key = JSON.parse(decoded);
      console.log(`   Client email: ${key.client_email}`);
      console.log(`   Project ID: ${key.project_id}`);
    } catch (e) {
      try {
        const key = JSON.parse(keyPath);
        console.log(`   Client email: ${key.client_email}`);
        console.log(`   Project ID: ${key.project_id}`);
      } catch (e2) {
        console.error(`❌ Cannot parse GOOGLE_SERVICE_ACCOUNT_KEY: ${e2.message}`);
        process.exit(1);
      }
    }
  }

  console.log('\n📤 Attempting to upload a test image to Google Drive...');

  // Create a small test image (1x1 pixel JPEG, ~600 bytes)
  // This is a valid JPEG image
  const testImageBuffer = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA=', 
    'base64'
  );

  const filename = `test_upload_${Date.now()}.jpg`;

  try {
    const result = await uploadReceiptToDrive(testImageBuffer, filename, 'image/jpeg');
    
    if (result.fileId) {
      console.log(`\n✅ SUCCESS! Test image uploaded to Google Drive!`);
      console.log(`   File ID: ${result.fileId}`);
      console.log(`   File Link: ${result.fileLink || 'N/A (no webViewLink returned)'}`);
      console.log(`   Filename: ${filename}`);
      console.log(`\n🔗 You can view it at: https://drive.google.com/file/d/${result.fileId}/view`);
      console.log('\n✅ Drive upload is working correctly!');
    } else {
      console.log(`\n❌ Upload returned empty fileId. Check the server logs above for errors.`);
      console.log('   Possible issues:');
      console.log('   - The service account does not have write access to the Drive folder');
      console.log('   - The GOOGLE_DRIVE_FOLDER_ID is incorrect');
      console.log('   - The service account key is invalid or expired');
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Upload failed with error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    console.log('\n   Possible issues:');
    console.log('   - Network connectivity problem');
    console.log('   - Invalid service account credentials');
    console.log('   - Google Drive API not enabled for this project');
    console.log('   - The service account does not have access to the folder');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});