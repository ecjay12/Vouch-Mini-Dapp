import React, { createContext, useState, useEffect } from 'react';
import { createClientUPProvider } from '@lukso/up-provider';
import { ethers } from 'ethers';
import { UP_ABI, LSP3_PROFILE_KEY, IPFS_GATEWAY, RPC_URL } from '../config';

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
        // Initialize UP provider
        const up = createClientUPProvider();
        setUpAccount(up);

        // Check if UP is available
        const accounts = await up.request({ method: 'eth_accounts' });
        if (!accounts || accounts.length === 0) {
          throw new Error('No UP detected. Please use a UP-compatible environment (e.g., Universal Everything browser).');
        }

        const ethersProvider = new ethers.BrowserProvider(up, { chainId: 4201 }); // LUKSO testnet
        setProvider(ethersProvider);
        const ethSigner = await ethersProvider.getSigner();
        setSigner(ethSigner);

        // Fetch profile data
        const address = await ethSigner.getAddress();
        console.log('Connected address:', address); // Debug
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
      } catch (err) {
        console.error('UP init failed:', err);
        // Fallback to RPC for dev (won't have UP data)
        try {
          const fallbackProvider = new ethers.JsonRpcProvider(RPC_URL, 4201, { pollingInterval: 5000, timeout: 10000 });
          await fallbackProvider.getNetwork(); // Test connection
          setProvider(fallbackProvider);
          const fallbackSigner = await fallbackProvider.getSigner();
          setSigner(fallbackSigner);
          const address = await fallbackSigner.getAddress();
          console.log('Fallback address:', address); // Debug
          const upContract = new ethers.Contract(address, UP_ABI, fallbackProvider);
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
        } catch (fallbackErr) {
          console.error('Fallback provider failed:', fallbackErr);
          setError('Failed to connect to UP or fallback network. Ensure you\'re in a UP-compatible environment or check your RPC.');
        }
      } finally {
        setLoading(false);
      }
    };
    initUp();
  }, []);

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        {error}
        <br />
        <a href="https://up.lukso.network/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
          Create a UP here
        </a>
        <br />
        <a href="https://universaleverything.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
          Use Universal Everything Browser
        </a>
      </div>
    );
  }

  return (
    <UpContext.Provider value={{ upAccount, signer, provider, profile, loading }}>
      {children}
    </UpContext.Provider>
  );
}