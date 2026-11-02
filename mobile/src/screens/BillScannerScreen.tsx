import React from 'react';
import { BillScannerModal, ScannedBillResult } from '../components/BillScannerModal';

interface BillScannerScreenProps {
  onClose?: () => void;
  onBillScanned?: (result: ScannedBillResult) => void;
  mode?: 'EXPENSE' | 'VAULT';
}

export const BillScannerScreen: React.FC<BillScannerScreenProps> = ({
  onClose,
  onBillScanned,
  mode = 'EXPENSE',
}) => {
  return (
    <BillScannerModal
      visible={true}
      mode={mode}
      onClose={onClose || (() => {})}
      onBillScanned={onBillScanned}
    />
  );
};

export default BillScannerScreen;
