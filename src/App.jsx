import React, { useContext, useState, useEffect } from 'react';
import { UpContext } from './context/UpContext';
import { ethers } from 'ethers';
import { ABI, CONTRACT_ADDRESS, IPFS_GATEWAY } from './config';

function App() {
  const { signer, provider, profile, loading, accounts, contextAccounts, chainId } = useContext(UpContext);
  const [errorMessage, setErrorMessage] = useState('');
  const [vouchersList, setVouchersList] = useState([]);
  const [givenVouchesList, setGivenVouchesList] = useState([]);
  const [fetchingVouchers, setFetchingVouchers] = useState(false);
  const [activeTab, setActiveTab] = useState('received');
  const [hiddenVouches, setHiddenVouches] = useState([]);
  const [targetAddress, setTargetAddress] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!provider || !signer || accounts.length === 0) return;
      if (activeTab === 'received') await fetchVouchersList();
      else if (activeTab === 'given') await fetchGivenVouchesList();
    };
    fetchData();
  }, [provider, signer, accounts, activeTab]);

  const withRetry = async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  };

  const isContract = async (address) => {
    try {
      const code = await provider.getCode(address);
      return code !== '0x';
    } catch (error) {
      console.error('Error checking if contract:', error);
      return false;
    }
  };

  const fetchProfileData = async (address) => {
    try {
      const isUP = await isContract(address);
      if (!isUP) return { name: 'EOA Address', picture: '' };

      const upContract = new ethers.Contract(address, UP_ABI, provider);
      const profileData = await withRetry(() => upContract.getData(LSP3_PROFILE_KEY));
      if (!profileData || profileData === '0x') return { name: 'Universal Profile', picture: '' };

      let jsonString;
      const bytes = ethers.getBytes(profileData);
      const decodedString = ethers.toUtf8String(bytes.slice(40));
      if (decodedString.startsWith('ipfs://')) {
        const hash = decodedString.replace('ipfs://', '');
        const fetchUrl = `${IPFS_GATEWAY}${hash}`;
        const response = await fetch(fetchUrl);
        jsonString = await response.text();
      } else {
        jsonString = decodedString;
      }
      const profileJson = JSON.parse(jsonString);
      return {
        name: profileJson.LSP3Profile?.name || 'Universal Profile',
        picture: profileJson.LSP3Profile?.profileImage?.[0]?.url || ''
      };
    } catch (error) {
      console.error('Fetch profile error:', error);
      return { name: 'Universal Profile', picture: '' };
    }
  };

  const fetchVouchersList = async () => {
    if (!provider || !signer) return;
    setFetchingVouchers(true);
    setErrorMessage('');
    try {
      const address = accounts[0]; // Use first account from UP
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000);
      const filter = {
        address: CONTRACT_ADDRESS,
        fromBlock,
        toBlock: 'latest',
        topics: [ethers.id('VouchRequested(address,address)'), ethers.zeroPadValue(address, 32), null]
      };
      const logs = await withRetry(() => provider.getLogs(filter));

      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      let vouchersWithDetails = await Promise.all(
        logs.map(async (log) => {
          const voucher = ethers.getAddress('0x' + log.topics[2].slice(26));
          const vouchData = await contract.getVouch(address, voucher);
          const statusMap = ['None', 'Pending', 'Accepted', 'Denied'];
          const status = statusMap[vouchData.status] || 'Unknown';
          const profileData = await fetchProfileData(voucher);
          return { address: voucher, name: profileData.name, status };
        })
      );

      vouchersWithDetails = vouchersWithDetails.filter(v => !hiddenVouches.some(h => h.address === v.address));
      setVouchersList(vouchersWithDetails);
    } catch (error) {
      console.error('Fetch received list error:', error);
      setErrorMessage(`Fetch failed: ${error.message}. Try again.`);
    } finally {
      setFetchingVouchers(false);
    }
  };

  const fetchGivenVouchesList = async () => {
    if (!provider || !signer) return;
    setFetchingVouchers(true);
    setErrorMessage('');
    try {
      const address = accounts[0]; // Use first account from UP
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000);
      const filter = {
        address: CONTRACT_ADDRESS,
        fromBlock,
        toBlock: 'latest',
        topics: [ethers.id('VouchRequested(address,address)'), null, ethers.zeroPadValue(address, 32)]
      };
      const logs = await withRetry(() => provider.getLogs(filter));

      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      const givenWithDetails = await Promise.all(
        logs.map(async (log) => {
          const target = ethers.getAddress('0x' + log.topics[1].slice(26));
          const vouchData = await contract.getVouch(target, address);
          const statusMap = ['None', 'Pending', 'Accepted', 'Denied'];
          const status = statusMap[vouchData.status] || 'Unknown';
          const profileData = await fetchProfileData(target);
          return { address: target, name: profileData.name, status };
        })
      );

      setGivenVouchesList(givenWithDetails);
    } catch (error) {
      console.error('Fetch given list error:', error);
      setErrorMessage(`Fetch failed: ${error.message}. Try again.`);
    } finally {
      setFetchingVouchers(false);
    }
  };

  const sendVouch = async () => {
    if (!signer || !ethers.isAddress(targetAddress)) return;
    const address = accounts[0];
    if (targetAddress.toLowerCase() === address.toLowerCase()) {
      setErrorMessage('You cannot vouch for yourself!');
      return;
    }

    setActionLoading(true);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const fee = await contract.fee();
      const tx = await contract.vouch(targetAddress, { value: fee });
      await tx.wait();
      setErrorMessage('Vouch sent successfully!');
      await fetchGivenVouchesList();
      await fetchVouchersList();
    } catch (error) {
      console.error('Send vouch error:', error);
      setErrorMessage(`Vouch failed: ${error.reason || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptVouch = async (voucher) => {
    setActionLoading(true);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.acceptVouch(voucher);
      await tx.wait();
      setErrorMessage('Accepted successfully!');
      await fetchVouchersList();
    } catch (error) {
      console.error('Accept error:', error);
      setErrorMessage(`Accept failed: ${error.reason || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDenyVouch = async (voucher) => {
    setActionLoading(true);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.denyVouch(voucher);
      await tx.wait();
      setErrorMessage('Denied successfully!');
      await fetchVouchersList();
    } catch (error) {
      console.error('Deny error:', error);
      setErrorMessage(`Deny failed: ${error.reason || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeVouch = async (target) => {
    setActionLoading(true);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.cancelVouch(target);
      await tx.wait();
      setErrorMessage('Revoked successfully!');
      await fetchGivenVouchesList();
    } catch (error) {
      console.error('Revoke error:', error);
      setErrorMessage(`Revoke failed: ${error.reason || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleHideVouch = (vouch) => {
    const fetchAddress = async () => {
      if (accounts.length > 0) {
        const address = accounts[0];
        const newHidden = [...hiddenVouches, vouch];
        setHiddenVouches(newHidden);
        localStorage.setItem(`hiddenVouches_${address}`, JSON.stringify(newHidden));
        await fetchVouchersList();
        setErrorMessage('Vouch hidden locally!');
      }
    };
    fetchAddress();
  };

  const handleUnhideVouch = (address) => {
    const fetchAddress = async () => {
      if (accounts.length > 0) {
        const addr = accounts[0];
        const newHidden = hiddenVouches.filter(h => h.address !== address);
        setHiddenVouches(newHidden);
        localStorage.setItem(`hiddenVouches_${addr}`, JSON.stringify(newHidden));
        await fetchVouchersList();
        setErrorMessage('Vouch unhidden!');
      }
    };
    fetchAddress();
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        <p className="mt-2 text-teal-600">Loading UP...</p>
      </div>
    );
  }

  return (
    <div className="p-6 font-sans bg-gradient-to-b from-teal-100 to-blue-200 min-h-screen">
      <h1 className="text-3xl font-bold text-center text-teal-800 mb-6">🏝️ Ohana Vouch MiniApp 🌴</h1>
      <p className="text-center text-teal-700 mb-4">Connected: {profile.name} (Chain ID: {chainId}) | Accounts: {accounts.length > 0 ? accounts[0].slice(0, 6) + '...' + accounts[0].slice(-4) : 'None'}</p>

      {actionLoading && (
        <div className="text-center text-teal-600 mb-4">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
          <p className="mt-2">Processing transaction...</p>
        </div>
      )}

      {errorMessage && <p className="text-center text-red-600 mb-4 font-semibold">{errorMessage}</p>}

      <div className="bg-white p-4 rounded-lg shadow-md border border-teal-300">
        <div className="flex flex-col items-center">
          {profile.picture ? (
            <img
              src={profile.picture}
              alt="Profile"
              className="rounded-full w-20 h-20 mb-3 object-cover border-2 border-green-400"
            />
          ) : (
            <div className="rounded-full w-20 h-20 bg-teal-100 flex items-center justify-center mb-3">
              <span className="text-teal-500 text-sm">No Image</span>
            </div>
          )}
          <p className="text-teal-600 text-sm text-center">Profile</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md border border-teal-300 mt-6">
        <h3 className="text-lg font-semibold text-teal-800 mb-3">Vouch for a Profile</h3>
        <input
          type="text"
          placeholder="Enter target UP address"
          value={targetAddress}
          onChange={(e) => setTargetAddress(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-lg mb-2 text-sm"
        />
        <button
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm w-full"
          onClick={sendVouch}
          disabled={!targetAddress || actionLoading || !signer}
        >
          Vouch
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md border border-teal-300 mt-6">
        <div className="flex space-x-4 mb-4">
          <button
            className={`px-4 py-2 rounded-lg ${activeTab === 'received' ? 'bg-teal-500 text-white' : 'bg-teal-100 text-teal-800'}`}
            onClick={() => setActiveTab('received')}
          >
            Received Vouches 🌊
          </button>
          <button
            className={`px-4 py-2 rounded-lg ${activeTab === 'given' ? 'bg-teal-500 text-white' : 'bg-teal-100 text-teal-800'}`}
            onClick={() => setActiveTab('given')}
          >
            Given Vouches 🏝️
          </button>
          <button
            className={`px-4 py-2 rounded-lg ${activeTab === 'settings' ? 'bg-teal-500 text-white' : 'bg-teal-100 text-teal-800'}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings ⚙️
          </button>
        </div>

        {activeTab === 'received' && (
          <>
            <h3 className="text-lg font-semibold text-teal-800 mb-3">Your Received Vouches</h3>
            {fetchingVouchers ? (
              <p className="text-center text-teal-600 text-sm">Fetching...</p>
            ) : vouchersList.length === 0 ? (
              <p className="text-teal-600 text-sm">No received vouches yet.</p>
            ) : (
              <ul className="space-y-3">
                {vouchersList.map((voucher, index) => (
                  <li key={index} className={`border-b pb-2 ${voucher.status === 'Pending' ? 'bg-yellow-100 rounded p-2' : ''}`}>
                    <p className="font-semibold text-sm text-teal-800">{voucher.name} ({voucher.address.slice(0, 6)}...{voucher.address.slice(-4)})</p>
                    <p className="text-sm">
                      Status: <span className={voucher.status === 'Pending' ? 'text-yellow-600' : 'text-green-600'}>
                        {voucher.status}
                      </span>
                    </p>
                    <div className="flex space-x-2 mt-1">
                      {voucher.status === 'Pending' && (
                        <>
                          <button className="bg-green-500 text-white px-2 py-1 rounded text-xs" onClick={() => handleAcceptVouch(voucher.address)}>
                            Accept
                          </button>
                          <button className="bg-red-500 text-white px-2 py-1 rounded text-xs" onClick={() => handleDenyVouch(voucher.address)}>
                            Deny
                          </button>
                        </>
                      )}
                      <button className="bg-gray-500 text-white px-2 py-1 rounded text-xs" onClick={() => handleHideVouch(voucher)}>
                        Hide
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button className="bg-teal-500 text-white px-4 py-1 rounded mt-3 hover:bg-teal-600 text-sm" onClick={fetchVouchersList} disabled={fetchingVouchers}>
              Refresh Received
            </button>
          </>
        )}

        {activeTab === 'given' && (
          <>
            <h3 className="text-lg font-semibold text-teal-800 mb-3">Your Given Vouches</h3>
            {fetchingVouchers ? (
              <p className="text-center text-teal-600 text-sm">Fetching...</p>
            ) : givenVouchesList.length === 0 ? (
              <p className="text-teal-600 text-sm">No given vouches yet.</p>
            ) : (
              <ul className="space-y-3">
                {givenVouchesList.map((vouch, index) => (
                  <li key={index} className={`border-b pb-2 ${vouch.status === 'Pending' ? 'bg-yellow-100 rounded p-2' : ''}`}>
                    <p className="font-semibold text-sm text-teal-800">{vouch.name} ({vouch.address.slice(0, 6)}...{vouch.address.slice(-4)})</p>
                    <p className="text-sm">
                      Status: <span className={vouch.status === 'Pending' ? 'text-yellow-600' : 'text-green-600'}>
                        {vouch.status}
                      </span>
                    </p>
                    <button className="bg-red-500 text-white px-2 py-1 rounded text-xs mt-1" onClick={() => handleRevokeVouch(vouch.address)}>
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button className="bg-teal-500 text-white px-4 py-1 rounded mt-3 hover:bg-teal-600 text-sm" onClick={fetchGivenVouchesList} disabled={fetchingVouchers}>
              Refresh Given
            </button>
          </>
        )}

        {activeTab === 'settings' && (
          <>
            <h3 className="text-lg font-semibold text-teal-800 mb-3">Settings: Hidden Received Vouches</h3>
            {hiddenVouches.length === 0 ? (
              <p className="text-teal-600 text-sm">No hidden vouches.</p>
            ) : (
              <ul className="space-y-3">
                {hiddenVouches.map((vouch, index) => (
                  <li key={index} className="border-b pb-2">
                    <p className="font-semibold text-sm text-teal-800">{vouch.name} ({vouch.address.slice(0, 6)}...{vouch.address.slice(-4)})</p>
                    <p className="text-sm">Status: {vouch.status}</p>
                    <button className="bg-blue-500 text-white px-2 py-1 rounded text-xs mt-1" onClick={() => handleUnhideVouch(vouch.address)}>
                      Unhide
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;