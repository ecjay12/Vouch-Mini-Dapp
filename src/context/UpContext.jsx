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

  useEffect(() => {
    const initUp = async (retries = 3) => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const up = createClientUPProvider();
          setUpProvider(up);

          // Configure chain (LUKSO testnet)
          up.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x1a4', rpcUrls: [RPC_URL], chainName: 'LUKSO Testnet' }] });

          up.on('accountsChanged', (accounts) => console.log('Accounts changed:', accounts));
          up.on('chainChanged', (chainId) => console.log('Chain changed:', chainId));
          up.on('contextAccountsChanged', (contextAccounts) => console.log('Context accounts changed:', contextAccounts));

          const ethersProvider = new ethers.BrowserProvider(up, 'any'); // 'any' for dynamic network
          setProvider(ethersProvider);
          const accounts = await ethersProvider.listAccounts();
          if (accounts.length === 0) throw new Error('No UP accounts found - ensure Universal Everything is installed and logged in.');
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
          setError(null); // Clear error on success
          return; // Exit loop on success
        } catch (err) {
          console.error(`UP init attempt ${attempt + 1} failed:`, err);
          setError(`UP init failed: ${err.message}. Attempt ${attempt + 1} of ${retries}.`);
          if (attempt < retries - 1) await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1))); // Exponential backoff
          else throw err; // Re-throw on last attempt
        }
      }
    };

    initUp().catch((err) => {
      console.error('Final UP init failure:', err);
      setLoading(false); // Ensure loading stops even on failure
    });
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-center text-teal-600">
        Loading UP... {error && <span className="text-red-600 ml-2">{error}</span>}
      </div>
    );
  }

  return (
    <UpContext.Provider value={{ upProvider, signer, provider, profile, loading, error }}>
>>>>>>> 07726ff (Initial commit for Ohana Vouch MiniApp)
      {children}
    </UpContext.Provider>
  );
}