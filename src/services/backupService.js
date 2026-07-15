const { google } = require('googleapis');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Order = require('../models/Order');

// Storage thresholds (bytes)
const STORAGE_TRIGGER_BYTES = 400 * 1024 * 1024; // 400MB
const STORAGE_TARGET_BYTES = 50 * 1024 * 1024;  // 50MB
const BATCH_SIZE = 200;

// Workbook filename in Google Drive
const WORKBOOK_NAME = 'mongo-backup.xlsx';

/**
 * Build authenticated Google Drive client from service account key
 */
function getDriveClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  
  if (!keyPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set');
  }

  let key;

  // Support two formats:
  // 1. Path to JSON file (for local development)
  // 2. Base64-encoded JSON string (for Render/production where file isn't committed)
  if (keyPath.endsWith('.json') && fs.existsSync(path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath))) {
    // Format 1: File path
    const absolutePath = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
    key = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } else {
    // Format 2: Try parsing as base64-encoded JSON
    try {
      const decoded = Buffer.from(keyPath, 'base64').toString('utf8');
      key = JSON.parse(decoded);
    } catch (parseError) {
      // Format 3: Try as raw JSON string
      try {
        key = JSON.parse(keyPath);
      } catch (rawParseError) {
        throw new Error(`Cannot parse GOOGLE_SERVICE_ACCOUNT_KEY: not a valid file path, base64, or JSON string`);
      }
    }
  }
  
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });

  return google.drive({ version: 'v3', auth });
}

/**
 * Find existing workbook in the target Drive folder by name
 * @param {google.drive_v3.Drive} drive - Authenticated Drive client
 * @returns {{id: string, name: string} | null} - File info or null if not found
 */
async function findExistingWorkbook(drive) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  
  if (!folderId) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID environment variable not set');
  }

  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and name = '${WORKBOOK_NAME}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    const files = response.data.files;
    return files && files.length > 0 ? { id: files[0].id, name: files[0].name } : null;
  } catch (error) {
    console.error('Error finding workbook:', error.message);
    throw error;
  }
}

/**
 * Download existing workbook to a local temp file
 * @param {google.drive_v3.Drive} drive - Authenticated Drive client
 * @param {string} fileId - The Drive file ID
 * @returns {string} - Path to the downloaded temp file
 */
async function downloadWorkbook(drive, fileId) {
  const tempPath = path.join(__dirname, `../../temp-${Date.now()}.xlsx`);
  
  try {
    const dest = fs.createWriteStream(tempPath);
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    await new Promise((resolve, reject) => {
      response.data
        .on('end', () => resolve())
        .on('error', reject)
        .pipe(dest);
    });

    console.log(`📥 Downloaded existing workbook to ${tempPath}`);
    return tempPath;
  } catch (error) {
    console.error('Error downloading workbook:', error.message);
    // Clean up temp file if it exists
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw error;
  }
}

/**
 * Upload or update workbook in Google Drive
 * @param {google.drive_v3.Drive} drive - Authenticated Drive client
 * @param {string} localPath - Path to local Excel file
 * @param {string|null} existingFileId - Existing Drive file ID (null for new file)
 * @returns {string} - File ID of uploaded/updated file
 */
async function uploadWorkbook(drive, localPath, existingFileId) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  
  try {
    const fileMetadata = {
      name: WORKBOOK_NAME,
      parents: [folderId]
    };

    const media = {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: fs.createReadStream(localPath)
    };

    if (existingFileId) {
      // Update existing file
      await drive.files.update({
        fileId: existingFileId,
        media: media
      });
      return existingFileId;
    } else {
      // Create new file
      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id'
      });
      return response.data.id;
    }
  } catch (error) {
    console.error('Error uploading workbook:', error.message);
    throw error;
  }
}

/**
 * Export unexported Orders to Excel sheet
 * @param {google.drive_v3.Drive} drive - Authenticated Drive client
 * @returns {number} - Number of documents exported
 */
async function exportAndAppend(drive) {
  // Query unexported documents
  const unexportedOrders = await Order.find({ exported: { $ne: true } }).lean();
  
  if (unexportedOrders.length === 0) {
    console.log('📤 No unexported orders found, skipping export');
    return 0;
  }

  console.log(`📤 Found ${unexportedOrders.length} unexported orders to backup`);

  // Create workbook
  const workbook = new ExcelJS.Workbook();

  // Load existing workbook if found
  const existingFile = await findExistingWorkbook(drive);
  let downloadedTempPath = null;
  
  if (existingFile) {
    downloadedTempPath = await downloadWorkbook(drive, existingFile.id);
    await workbook.xlsx.readFile(downloadedTempPath);
  }

  // Sheet name: today's date (YYYY-MM-DD)
  const todaySheetName = new Date().toISOString().split('T')[0];
  
  // Remove existing sheet with same name (guard against re-runs)
  const existingSheet = workbook.getWorksheet(todaySheetName);
  if (existingSheet) {
    console.log(`📝 Replacing existing sheet: ${todaySheetName}`);
    workbook.removeWorksheet(todaySheetName);
  }

  // Create new sheet
  const sheet = workbook.addWorksheet(todaySheetName);

  // Define columns
  sheet.columns = [
    { header: 'orderRef', key: 'orderRef', width: 20 },
    { header: 'clientTelegramId', key: 'clientTelegramId', width: 15 },
    { header: 'clientUsername', key: 'clientUsername', width: 20 },
    { header: 'walletAddress', key: 'walletAddress', width: 45 },
    { header: 'chain', key: 'chain', width: 20 },
    { header: 'fiatAmount', key: 'fiatAmount', width: 15 },
    { header: 'fiatCurrency', key: 'fiatCurrency', width: 10 },
    { header: 'exchangeRate', key: 'exchangeRate', width: 15 },
    { header: 'cryptoAmount', key: 'cryptoAmount', width: 15 },
    { header: 'status', key: 'status', width: 20 },
    { header: 'createdAt', key: 'createdAt', width: 25 },
    { header: 'expiresAt', key: 'expiresAt', width: 25 },
    { header: 'paymentClaimedAt', key: 'paymentClaimedAt', width: 25 },
    { header: 'verifiedAt', key: 'verifiedAt', width: 25 },
    { header: 'releasedAt', key: 'releasedAt', width: 25 },
    { header: 'txHash', key: 'txHash', width: 70 },
    { header: 'payoutError', key: 'payoutError', width: 30 },
    { header: 'bankReferenceSeen', key: 'bankReferenceSeen', width: 30 },
    { header: 'exported', key: 'exported', width: 10 },
    { header: 'exportedAt', key: 'exportedAt', width: 25 }
  ];

  // Add rows
  unexportedOrders.forEach(order => {
    sheet.addRow({
      ...order,
      createdAt: order.createdAt?.toISOString(),
      expiresAt: order.expiresAt?.toISOString(),
      paymentClaimedAt: order.paymentClaimedAt?.toISOString(),
      verifiedAt: order.verifiedAt?.toISOString(),
      releasedAt: order.releasedAt?.toISOString(),
      exportedAt: order.exportedAt?.toISOString()
    });
  });

  // Write to temp file
  const tempPath = path.join(__dirname, `../../temp-${Date.now()}.xlsx`);
  await workbook.xlsx.writeFile(tempPath);

  // Sanity check: confirm file is non-empty
  const stats = fs.statSync(tempPath);
  if (stats.size === 0) {
    throw new Error('Generated Excel file is empty - aborting export');
  }
  console.log(`📝 Generated Excel file: ${tempPath} (${stats.size} bytes)`);

  // Upload to Drive
  const existingFileId = existingFile ? existingFile.id : null;
  const fileId = await uploadWorkbook(drive, tempPath, existingFileId);

  // ONLY after upload succeeds, mark documents as exported
  const orderIds = unexportedOrders.map(o => o._id);
  await Order.updateMany(
    { _id: { $in: orderIds } },
    { $set: { exported: true, exportedAt: new Date() } }
  );
  console.log(`✅ Marked ${orderIds.length} orders as exported in MongoDB`);

  // Clean up temp files
  fs.unlinkSync(tempPath);
  if (downloadedTempPath && fs.existsSync(downloadedTempPath)) {
    fs.unlinkSync(downloadedTempPath);
  }

  return unexportedOrders.length;
}

/**
 * Check storage and prune oldest exported documents if needed
 * @param {mongoose.Connection} mongoose - Mongoose connection (for collStats)
 */
async function checkStorageAndPrune() {
  // Get collection stats
  const db = mongoose.connection.db;
  const stats = await db.command({ collStats: 'orders' });
  
  const currentSize = stats.size; // Logical data size
  console.log(`📊 Current collection size: ${(currentSize / 1024 / 1024).toFixed(2)} MB`);

  if (currentSize < STORAGE_TRIGGER_BYTES) {
    console.log(`✅ Storage below trigger threshold (${(STORAGE_TRIGGER_BYTES / 1024 / 1024).toFixed(0)}MB), skipping prune`);
    return 0;
  }

  const bytesToFree = currentSize - STORAGE_TARGET_BYTES;
  console.log(`🧹 Storage pruning triggered. Need to free ~${(bytesToFree / 1024 / 1024).toFixed(2)} MB`);

  let totalDeleted = 0;
  let estimatedBytesFreed = 0;
  const avgObjSize = stats.avgObjSize || 1000;

  while (estimatedBytesFreed < bytesToFree) {
    // Get oldest documents in batch
    const batch = await Order.find({ exported: true })
      .sort({ createdAt: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (batch.length === 0) {
      console.log('✅ No more exported documents to prune');
      break;
    }

    const batchIds = batch.map(o => o._id);

    // Safety check: any unexported docs in batch must be exported first
    const unexportedInBatch = batch.filter(o => !o.exported);
    if (unexportedInBatch.length > 0) {
      console.log(`⚠️ Safety net: Found ${unexportedInBatch.length} unexported docs in prune batch, exporting them now...`);
      // Note: This reuses Phase 1 logic but for a subset - we'd need to re-run export for these
      // For now, log warning and skip them
      console.log('⚠️ Cannot delete unexported documents - ensuring Phase 1 runs before pruning');
      // Remove unexported docs from deletion list
      const exportedOnlyIds = batchIds.filter(id => {
        const doc = batch.find(o => o._id.equals(id));
        return doc && doc.exported;
      });
      
      if (exportedOnlyIds.length === 0) continue;
      
      await Order.deleteMany({ _id: { $in: exportedOnlyIds } });
      totalDeleted += exportedOnlyIds.length;
      estimatedBytesFreed += exportedOnlyIds.length * avgObjSize;
    } else {
      // All docs in batch are already exported, safe to delete
      await Order.deleteMany({ _id: { $in: batchIds } });
      totalDeleted += batch.length;
      estimatedBytesFreed += batch.length * avgObjSize;
    }

    console.log(`🗑️ Deleted batch of ${batch.length} documents`);
  }

  console.log(`✅ Prune complete. Total deleted: ${totalDeleted}, Estimated bytes freed: ${(estimatedBytesFreed / 1024 / 1024).toFixed(2)} MB`);
  return totalDeleted;
}

/**
 * Main orchestrator for the daily backup + prune job
 */
async function runDailyJob() {
  console.log('🚀 Starting MongoDB backup job...');

  try {
    // Check if backup is enabled
    if (process.env.BACKUP_ENABLED !== 'true') {
      console.log('⏭️ Backup disabled via BACKUP_ENABLED env var');
      return;
    }

    // Get Drive client (ensure env vars are valid)
    const drive = getDriveClient();

    // Phase 1: Export unexported data (always runs)
    const exportedCount = await exportAndAppend(drive);
    console.log(`📤 Phase 1 complete: exported ${exportedCount} documents`);

    // Phase 2: Storage-threshold pruning
    const deletedCount = await checkStorageAndPrune();
    console.log(`🧹 Phase 2 complete: pruned ${deletedCount} documents`);

    console.log('✅ Backup job completed successfully');
  } catch (error) {
    console.error('❌ Backup job failed:', error.message);
    // Do NOT re-throw - let the cron continue running
  }
}

module.exports = {
  runDailyJob,
  exportAndAppend,
  checkStorageAndPrune,
  getDriveClient
};