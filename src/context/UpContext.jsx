import React, { createContext, useState, useEffect, useCallback } from 'react';
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
  const [accounts, setAccounts] = useState([]);
  const [contextAccounts, setContextAccounts] = useState([]);
  const [chainId, setChainId] = useState(4201); // Default to LUKSO testnet

  const updateState = useCallback(async (newAccounts, newContextAccounts, newChainId) => {
    setAccounts(newAccounts || []);
    setContextAccounts(newContextAccounts || []);
    if (newAccounts?.length > 0 && newContextAccounts?.length > 0) {
      try {
        const ethersProvider = new ethers.BrowserProvider(upAccount, { chainId: newChainId });
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
      } catch (err) {
        console.error('State update failed:', err);
        setError('Failed to initialize signer or fetch profile. Check UP connection.');
      }
    } else {
      setError('No UP accounts detected. Please connect via the parent app.');
    }
  }, []);

  useEffect(() => {
    const up = createClientUPProvider();
    setUpAccount(up);

    // Initial state
    const init = async () => {
      try {
        const initialAccounts = up.allowedAccounts || [];
        const initialContextAccounts = up.contextAccounts || [];
        const initialChainId = await up.request({ method: 'eth_chainId' }).then(id => parseInt(id, 16)) || 4201;
        await updateState(initialAccounts, initialContextAccounts, initialChainId);
      } catch (err) {
        console.error('Initial setup failed:', err);
        setError('Failed to initialize UP. Ensure you\'re in a UP-compatible environment.');
      } finally {
        setLoading(false);
      }
    };
    init();

    // Event listeners
    const accountsChanged = (newAccounts) => updateState(newAccounts, contextAccounts, chainId);
    const contextAccountsChanged = (newContextAccounts) => updateState(accounts, newContextAccounts, chainId);
    const chainChanged = (newChainId) => updateState(accounts, contextAccounts, parseInt(newChainId, 16));

    up.on('accountsChanged', accountsChanged);
    up.on('contextAccountsChanged', contextAccountsChanged);
    up.on('chainChanged', chainChanged);

    return () => {
      up.removeListener('accountsChanged', accountsChanged);
      up.removeListener('contextAccountsChanged', contextAccountsChanged);
      up.removeListener('chainChanged', chainChanged);
    };
  }, [updateState]);

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
    <UpContext.Provider value={{ upAccount, signer, provider, profile, loading, accounts, contextAccounts, chainId }}>
      {children}
    </UpContext.Provider>
  );
}