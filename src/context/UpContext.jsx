import React, { createContext, useState, useEffect } from 'react';
import { createClientUPProvider } from '@lukso/up-provider';
import { ethers } from 'ethers';
import { UP_ABI, LSP3_PROFILE_KEY, IPFS_GATEWAY } from '../config';

export const UpContext = createContext();

export function UpProviderWrapper({ children }) {
  const [upAccount, setUpAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [profile, setProfile] = useState({ name: '', picture: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initUp = async () => {
      try {
        // Create provider without connect() - it should auto-init in UP context
        const up = createClientUPProvider();
        setUpAccount(up);
        const ethersProvider = new ethers.BrowserProvider(up);
        setProvider(ethersProvider);
        const ethSigner = await ethersProvider.getSigner();
        setSigner(ethSigner);

        const address = await ethSigner.getAddress();
        const upContract = new ethers.Contract(address, UP_ABI, ethersProvider);
        const profileData = await upContract.getData(LSP3_PROFILE_KEY);
        if (profileData && profileData !== '0x') {
          const bytes = ethers.getBytes(profileData);
          const decodedString = ethers.toUtf8String(bytes.slice(40));
          let jsonString = decodedString;
          if (decodedString.startsWith('ipfs://')) {
            const hash = decodedString.replace('ipfs://', '');
            const fetchUrl = `${IPFS_GATEWAY}${hash}`;
            const response = await fetch(fetchUrl);
            jsonString = await response.text();
          }
          const profileJson = JSON.parse(jsonString);
          setProfile({
            name: profileJson.LSP3Profile?.name || 'Universal Profile',
            picture: profileJson.LSP3Profile?.profileImage?.[0]?.url || ''
          });
        }
      } catch (error) {
        console.error('UP init failed:', error);
        setError('Failed to initialize UP. Ensure you\'re in a UP-compatible environment (e.g., Universal Everything browser).');
      } finally {
        setLoading(false);
      }
    };
    initUp();
  }, []);

  if (error) {
    return <div className="p-6 text-center text-red-600">{error}</div>;
  }

  return (
    <UpContext.Provider value={{ upAccount, signer, provider, profile, loading }}>
      {children}
    </UpContext.Provider>
  );
}