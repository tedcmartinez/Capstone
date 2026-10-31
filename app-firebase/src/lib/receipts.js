// Receipt images
//
// A stock-in may carry a photo or scan of the delivery receipt. In the LAN
// version these were files in public/uploads/receipts/, written by PHP.
// There is no file system here, and Cloud Storage needs the paid Blaze plan,
// so the image is compressed in the browser and stored inside a Firestore
// document as base64.
//
// That constraint is what drives the limits. A Firestore document cannot
// exceed 1 MB, and base64 inflates a file by about a third, so a 300 KB
// ceiling leaves a wide margin. The old limit was 5 MB, which a phone photo
// easily reaches, so compression is not optional: it is the only reason a
// receipt fits at all.

import { doc, getDoc, serverTimestamp } from 'firebase/firestore';

import { db } from './firebase.js';
import { newDocId } from './audit.js';
import { currentUser } from './session.js';
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_MAX_DIMENSION,
  RECEIPT_JPEG_QUALITY,
} from './config.js';

// The formats the old PHP upload accepted, checked by real content type
// rather than by file extension.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Quality steps tried in order. Most receipts are text on white paper and
// come out well under the ceiling at the first step; a dense photograph
// needs a lower setting. Anything still too large after the last step is
// refused rather than stored.
const QUALITY_STEPS = [RECEIPT_JPEG_QUALITY, 0.6, 0.5, 0.4];

// ============================================================
// COMPRESSION
// ============================================================

// Compresses a chosen file and returns { blob, base64, mimeType, sizeBytes,
// width, height, originalBytes }, or throws a message fit to show the user.
export async function compressReceipt(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('The receipt must be a JPG, PNG, or WEBP image.');
  }

  const image = await loadImage(file);
  const { width, height } = fitWithin(image.width, image.height, RECEIPT_MAX_DIMENSION);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  // A transparent PNG would otherwise become black once saved as JPEG, so
  // the background is filled white first, which is what a scanned receipt
  // should look like anyway.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  // Everything is written out as JPEG regardless of what came in. A
  // photographed receipt is far smaller as JPEG than as PNG, and the
  // difference decides whether it fits at all.
  for (const quality of QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);

    if (blob.size <= RECEIPT_MAX_BYTES) {
      return {
        blob,
        base64: await blobToBase64(blob),
        mimeType: 'image/jpeg',
        sizeBytes: blob.size,
        width,
        height,
        originalBytes: file.size,
        quality,
      };
    }
  }

  throw new Error(
    `This image is still ${formatSize(file.size)} after compression, which is ` +
      `too large to store. The limit is ${formatSize(RECEIPT_MAX_BYTES)}. Try ` +
      'photographing the receipt on its own, or scanning it in black and white.'
  );
}

// Scales an image down so its longest side fits the limit. A smaller image
// is left alone rather than enlarged, which would only add bytes.
function fitWithin(width, height, limit) {
  if (width <= limit && height <= limit) {
    return { width, height };
  }

  const scale = limit / Math.max(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be compressed.'))),
      type,
      quality
    );
  });
}

// Strips the "data:image/jpeg;base64," prefix, since the type is stored in
// its own field and keeping the prefix would waste document space.
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('The compressed image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// ============================================================
// STORING AND READING
// ============================================================

// Builds the receipt document and the operation that writes it. The caller
// commits it in the same batch as the movement, so a receipt is never
// stored without the movement it belongs to, and both share one audit entry.
export function receiptOperation(receipt, movementId) {
  const user = currentUser();
  const id = newDocId('receipts');

  return {
    id,
    op: {
      type: 'set',
      collection: 'receipts',
      id,
      data: {
        movementId,
        mimeType: receipt.mimeType,
        dataBase64: receipt.base64,
        sizeBytes: receipt.sizeBytes,
        uploadedBy: user.uid,
        createdAt: serverTimestamp(),
      },
    },
  };
}

// Reads one receipt. Called only when somebody clicks View, never as part of
// loading the movement history: a page of 50 receipts would be several
// megabytes of base64 fetched to show a column of buttons.
export async function loadReceipt(receiptId) {
  const snapshot = await getDoc(doc(db, 'receipts', receiptId));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    // Rebuilt into something an <img> can display
    dataUrl: `data:${data.mimeType};base64,${data.dataBase64}`,
  };
}
