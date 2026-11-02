import React from 'react';
import { DocumentVaultModal } from '../components/DocumentVaultModal';

export const DocumentVaultScreen: React.FC<{
  onClose?: () => void;
}> = ({ onClose }) => {
  return <DocumentVaultModal visible={true} onClose={onClose || (() => {})} />;
};

