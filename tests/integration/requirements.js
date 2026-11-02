// What every new movement now has to carry
//
// Since round 2 a stock-in needs a receipt photo and a stock-out needs a
// project unless it is Damaged (firestore.rules: receiptAttachedIfIn,
// projectGivenIfNeeded). Most integration tests are about something else
// entirely, such as stock arithmetic or the audit trail, so they log their
// movements through this, which fills in a small receipt and a project
// whenever a test has not given its own.
//
// Tests about the requirements themselves call logMovement() directly.

// A stand-in for a compressed photo: the same shape compressReceipt()
// returns, small enough to keep the tests fast
export const TEST_RECEIPT = {
  mimeType: 'image/jpeg',
  base64: 'x'.repeat(400),
  sizeBytes: 300,
  width: 640,
  height: 480,
  originalBytes: 300,
};

export function withRequirements(args) {
  const filled = { ...args };

  if (filled.type === 'in' && filled.receipt === undefined) {
    filled.receipt = TEST_RECEIPT;
  }

  if (filled.type === 'out' && filled.project === undefined && filled.reason !== 'Damaged') {
    filled.project = 'Test project';
  }

  return filled;
}
