import React, { useContext, useState, useEffect } from 'react';
import { UpContext } from './context/UpContext.jsx';
import { ethers } from 'ethers';
import { ABI, CONTRACT_ADDRESS, UP_ABI, LSP3_PROFILE_KEY, IPFS_GATEWAY } from './config';

function App() {
  const { signer, provider, profile, loading } = useContext(UpContext);
  const [errorMessage, setErrorMessage] = useState('');
  const [vouchersList, setVouchersList] = useState([]);
  const [givenVouchesList, setGivenVouchesList] = useState([]);
  const [fetchingVouchers, setFetchingVouchers] = useState(false);
  const [activeTab, setActiveTab] = useState('received');
  const [hiddenVouches, setHiddenVouches] = useState([]);
  const [targetAddress, setTargetAddress] = useState('');

  // Utility function for retries
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

  // Fetch profile data (reused from your code)
  const fetchProfileData = async (address, currentProvider) => {
    try {
      const isUP = await isContract(address, currentProvider);
      if (!isUP) {
        return { description: 'External Owned Account', picture: '' };
      }
      const upContract = new ethers.Contract(address, UP_ABI, currentProvider);
      const profileData = await withRetry(() => upContract.getData(LSP3_PROFILE_KEY));
      if (!profileData || profileData === '0x') {
        return { description: 'No description available', picture: '' };
      }
      let jsonString;
      const bytes = ethers.getBytes(profileData);
      const decodedString = ethers.toUtf8String(bytes.slice(40));
      if (decodedString.startsWith('ipfs://')) {
        const hash = decodedString.replace('ipfs://', '');
        const fetchUrl = `${IPFS_GATEWAY}${hash}`;
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`IPFS fetch failed: ${response.status}`);
        jsonString = await response.text();
      } else {
        jsonString = decodedString;
      }
      const profileJson = JSON.parse(jsonString);
      const description = profileJson.LSP3Profile?.description || 'No description available';
      let picture = '';
      if (profileJson.LSP3Profile?.profileImage?.length > 0) {
        const imageUrl = profileJson.LSP3Profile.profileImage[0].url;
        picture = imageUrl.startsWith('ipfs://') ? `${IPFS_GATEWAY}${imageUrl.replace('ipfs://', '')}` : imageUrl;
      }
      return { description, picture };
    } catch (error) {
      console.error('Fetch profile error for', address, ':', error);
      return { description: 'Error loading', picture: '' };
    }
  };

  // Check if address is a contract
  const isContract = async (address, currentProvider) => {
    try {
      const code = await currentProvider.getCode(address);
      return code !== '0x';
    } catch (error) {
      console.error('Error checking if contract:', error);
      return false;
    }
  };

  // Fetch received vouches
  const fetchVouchersList = async () => {
    if (!provider || !signer) return;
    setFetchingVouchers(true);
    setErrorMessage('');
    try {
      const address = await signer.getAddress();
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000);
      const filter = {
        address: CONTRACT_ADDRESS,
        fromBlock,
        toBlock: 'latest',
        topics: [
          ethers.id('VouchRequested(address,address)'),
          ethers.zeroPadValue(address, 32),
          null
        ],
      };
      const logs = await withRetry(() => provider.getLogs(filter));
      console.log('Received logs:', logs);

      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      let vouchersWithDetails = await Promise.all(
        logs.map(async (log) => {
          const voucher = ethers.getAddress('0x' + log.topics[2].slice(26));
          const vouchData = await contract.getVouch(address, voucher);
          const statusMap = ['None', 'Pending', 'Accepted', 'Denied'];
          const status = statusMap[vouchData.status] || 'Unknown';
          const profileData = await fetchProfileData(voucher, provider);
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

  // Fetch given vouches
  const fetchGivenVouchesList = async () => {
    if (!provider || !signer) return;
    setFetchingVouchers(true);
    setErrorMessage('');
    try {
      const address = await signer.getAddress();
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000);
      const filter = {
        address: CONTRACT_ADDRESS,
        fromBlock,
        toBlock: 'latest',
        topics: [
          ethers.id('VouchRequested(address,address)'),
          null,
          ethers.zeroPadValue(address, 32),
        ],
      };
      const logs = await withRetry(() => provider.getLogs(filter));
      console.log('Given logs:', logs);

      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      const givenWithDetails = await Promise.all(
        logs.map(async (log) => {
          const target = ethers.getAddress('0x' + log.topics[1].slice(26));
          const vouchData = await contract.getVouch(target, address);
          const statusMap = ['None', 'Pending', 'Accepted', 'Denied'];
          const status = statusMap[vouchData.status] || 'Unknown';
          const profileData = await fetchProfileData(target, provider);
          return { address: target, name: profileData.name, status };
        })
      );
      setGivenVouchesList(givenWithDetails);
    } catch (error) {
      console.error('Fetch given list error:', error);
      setErrorMessage(`Fetch failed: ${error.message}. Try again or check network.`);
    } finally {
      setFetchingVouchers(false);
    }
  };

  // Send vouch
  const sendVouch = async () => {
    if (!targetAddress || !ethers.isAddress(targetAddress) || !signer) return;
    if (targetAddress.toLowerCase() === (await signer.getAddress()).toLowerCase()) {
      setErrorMessage('You cannot vouch for yourself!');
      return;
    }
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
      setErrorMessage(`Vouch failed: ${error.reason || error.message}. Check console.`);
    }
  };

  // Accept vouch
  const handleAcceptVouch = async (voucher) => {
    if (!signer) return;
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.acceptVouch(voucher);
      await tx.wait();
      setErrorMessage('Accepted successfully!');
      await fetchVouchersList();
    } catch (error) {
      console.error('Accept error:', error);
      setErrorMessage(`Accept failed: ${error.reason || error.message}`);
    }
  };

  // Deny vouch
  const handleDenyVouch = async (voucher) => {
    if (!signer) return;
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.denyVouch(voucher);
      await tx.wait();
      setErrorMessage('Denied successfully!');
      await fetchVouchersList();
    } catch (error) {
      console.error('Deny error:', error);
      setErrorMessage(`Deny failed: ${error.reason || error.message}`);
    }
  };

  // Revoke vouch
  const handleRevokeVouch = async (target) => {
    if (!signer) return;
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.cancelVouch(target);
      await tx.wait();
      setErrorMessage('Revoked successfully!');
      await fetchGivenVouchesList();
    } catch (error) {
      console.error('Revoke error:', error);
      setErrorMessage(`Revoke failed: ${error.reason || error.message}`);
    }
  };

  // Hide vouch
  const handleHideVouch = async (vouch) => {
    const newHidden = [...hiddenVouches, vouch];
    setHiddenVouches(newHidden);
    const address = signer?.getAddress ? await signer.getAddress() : null;
    if (address) localStorage.setItem(`hiddenVouches_${address}`, JSON.stringify(newHidden));
    fetchVouchersList();
    setErrorMessage('Vouch hidden locally!');
  };

  // Unhide vouch
  const handleUnhideVouch = async (address) => {
    const newHidden = hiddenVouches.filter(h => h.address !== address);
    setHiddenVouches(newHidden);
    const userAddress = signer?.getAddress ? await signer.getAddress() : null;
    if (userAddress) localStorage.setItem(`hiddenVouches_${userAddress}`, JSON.stringify(newHidden));
    fetchVouchersList();
    setErrorMessage('Vouch unhidden!');
  };

  useEffect(() => {
    if (provider && signer) {
      if (activeTab === 'received') fetchVouchersList();
      else if (activeTab === 'given') fetchGivenVouchesList();
    }
  }, [activeTab, provider, signer]);

  if (loading) return <div className="p-6 text-center text-teal-600">Loading UP...</div>;

  return (
    <div className="p-6 font-sans bg-gradient-to-b from-teal-100 to-blue-200 min-h-screen">
      <h1 className="text-3xl font-bold text-center text-teal-800 mb-6">🏝️ Ohana Vouch MiniApp 🌴</h1>
      <p className="text-center text-teal-700 mb-4">Connected: {profile.name}</p>
      {profile.picture && (
        <img src={profile.picture} alt="Profile" className="rounded-full w-20 h-20 mx-auto mb-4 object-cover border-2 border-green-400" />
      )}
      {errorMessage && <p className="text-center text-red-600 mb-4 font-semibold">{errorMessage}</p>}
      <div className="bg-white p-4 rounded-lg shadow-md border border-teal-300">
        <h3 className="text-lg font-semibold text-teal-800 mb-3">Vouch for a Profile</h3>
        <input
          type="text"
          placeholder="Enter target UP address"
          value={targetAddress}
          onChange={(e) => setTargetAddress(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-lg mb-2 text-sm"
        />
        <button
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
          onClick={sendVouch}
          disabled={!targetAddress || !ethers.isAddress(targetAddress)}
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
                    {voucher.status === 'Pending' && (
                      <>
                        <button className="bg-green-500 text-white px-2 py-1 rounded text-xs mr-2" onClick={() => handleAcceptVouch(voucher.address)}>
                          Accept
                        </button>
                        <button className="bg-red-500 text-white px-2 py-1 rounded text-xs" onClick={() => handleDenyVouch(voucher.address)}>
                          Deny
                        </button>
                      </>
                    )}
                    <button className="bg-gray-500 text-white px-2 py-1 rounded text-xs mt-1" onClick={() => handleHideVouch(voucher)}>
                      Hide
                    </button>
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