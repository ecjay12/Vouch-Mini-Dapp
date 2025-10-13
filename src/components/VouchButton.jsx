import React, { useContext, useState } from 'react';
import { UpContext } from '../context/UpContext.jsx';
import { ethers } from 'ethers';
import { ABI, CONTRACT_ADDRESS } from '../config';

function VouchButton({ targetAddress }) {
  const { signer, provider } = useContext(UpContext);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const sendVouch = async () => {
    if (!targetAddress || !ethers.isAddress(targetAddress) || !signer) return;
    setLoading(true);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const fee = await contract.fee();
      const tx = await contract.vouch(targetAddress, { value: fee });
      await tx.wait();
      setMessage('Vouch sent! Add this profile to your Grid in Universal Everything to track vouches.');
    } catch (error) {
      console.error('Vouch error:', error);
      setMessage(`Vouch failed: ${error.reason || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
        onClick={sendVouch}
        disabled={loading || !targetAddress}
      >
        {loading ? 'Vouching...' : 'Vouch for this profile'}
      </button>
      {message && <p className="text-teal-600 text-sm mt-2">{message}</p>}
    </div>
  );
}

export default VouchButton;