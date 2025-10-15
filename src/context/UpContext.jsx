import React, { createContext, useState, useEffect } from 'react';
<<<<<<< HEAD
import { createClientUPProvider } from '@lukso/up-provider'; // Correct named import
import { ethers } from 'ethers';
import { UP_ABI, LSP3_PROFILE_KEY, IPFS_GATEWAY } from '../config';
=======
import { createClientUPProvider } from '@lukso/up-provider';
import { ethers } from 'ethers';
import { UP_ABI, LSP3_PROFILE_KEY, IPFS_GATEWAY, RPC_URL } from '../config';
>>>>>>> 07726ff (Initial commit for Ohana Vouch MiniApp)

export const UpContext = createContext();

export function UpProviderWrapper({ children }) {
  const [upProvider, setUpProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [profile, setProfile] = useState({ name: '', picture: '' });
  const [loading, setLoading] = useState(true);
<<<<<<< HEAD

  useEffect(() => {
    const initUp = async () => {
      try {
        const up = createClientUPProvider(); // Call the factory
        setUpProvider(up);

        // Listen for injected connections (MiniApp style – no manual connect call)
        up.on('accountsChanged', (accounts) => {
          console.log('Accounts changed:', accounts);
        });
        up.on('chainChanged', (chainId) => {
          console.log('Chain changed:', chainId);
        });
        up.on('contextAccountsChanged', (contextAccounts) => {
          console.log('Context accounts changed:', contextAccounts);
        });

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
            picture: profileJson.LSP3Profile?.profileImage?.[0]?.url || '',
          });
        }
      } catch (error) {
        console.error('UP init failed:', error);
      } finally {
        setLoading(false);
      }
    };
    initUp();
  }, []);

  if (loading) {
    return <div className="p-6 text-center text-teal-600">Loading UP...</div>;
  }

  return (
    <UpContext.Provider value={{ upProvider, signer, provider, profile, loading }}>
=======
  const [error, setError] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [contextAccounts, setContextAccounts] = useState([]);

  useEffect(() => {
    const initUp = async () => {
      try {
        const up = createClientUPProvider();
        setUpProvider(up);

        up.on('accountsChanged', (_accounts) => {
          console.log('Accounts changed:', _accounts);
          setAccounts(_accounts);
        });
        up.on('chainChanged', (_chainId) => {
          console.log('Chain changed:', _chainId);
        });
        up.on('contextAccountsChanged', (_contextAccounts) => {
          console.log('Context accounts changed:', _contextAccounts);
          setContextAccounts(_contextAccounts);
        });

        const _accounts = await up.request({ method: 'eth_accounts' });
        if (_accounts.length === 0) {
          throw new Error('No UP found - please use Universal Everything browser/extension and log in with your UP.');
        }

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
            picture: profileJson.LSP3Profile?.profileImage?.[0]?.url || '',
          });
        }
      } catch (err) {
        console.error('UP init failed:', err);
        setError(`Failed to connect UP: ${err.message}. Using fallback provider. Load in Universal Everything for full functionality.`);
        // Fallback to JsonRpcProvider
        const fallbackProvider = new ethers.JsonRpcProvider(RPC_URL);
        setProvider(fallbackProvider);
        setSigner(null); // No signer for fallback (read-only)
      } finally {
        setLoading(false);
      }
    };
    initUp();
  }, []);

  if (loading) {
    return <div className="p-6 text-center text-teal-600">Loading UP...</div>;
  }

  return (
    <UpContext.Provider value={{ upProvider, signer, provider, profile, loading, error }}>
      {children}
    </UpContext.Provider>
  );
}