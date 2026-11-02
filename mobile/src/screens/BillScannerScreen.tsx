import React from 'react';
import { BillScannerModal, ScannedBillResult } from '../components/BillScannerModal';

interface BillScannerScreenProps {
  onClose?: () => void;
  onStartBackgroundScan?: (compressedBase64: string, saveToVault?: boolean) => void;
  onQrScannedSuccess?: (info: {
    amountRupees?: number;
    merchantOrPayee: string;
    note?: string;
  }) => void;
  onBillScanned?: (result: ScannedBillResult) => void;
  mode?: 'EXPENSE' | 'VAULT';
}

export const BillScannerScreen: React.FC<BillScannerScreenProps> = ({
  onClose,
  onStartBackgroundScan,
  onQrScannedSuccess,
  onBillScanned,
  mode = 'EXPENSE',
}) => {
  return (
    <BillScannerModal
      visible={true}
      mode={mode}
      onClose={onClose || (() => {})}
      onStartBackgroundScan={onStartBackgroundScan}
      onQrScannedSuccess={onQrScannedSuccess}
      onBillScanned={onBillScanned}
    />
  );
};

export default BillScannerScreen;

