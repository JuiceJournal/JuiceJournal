'use client';

import { useState } from 'react';
import { lootAPI } from '@/lib/api';
import { getItemTypeLabel } from '@/lib/utils';

const ITEM_TYPES = [
  'currency',
  'fragment',
  'scarab',
  'map',
  'divination_card',
  'gem',
  'unique',
  'other',
];

export default function AddLootModal({ sessionId, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    itemName: '',
    itemType: 'currency',
    quantity: 1,
    chaosValue: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await lootAPI.add({
        sessionId,
        ...formData,
        quantity: parseInt(formData.quantity),
        chaosValue: formData.chaosValue ? parseFloat(formData.chaosValue) : undefined,
        source: 'manual',
      });

      if (response.success) {
        onSuccess?.();
        onClose?.();
      } else {
        setError(response.error || 'An error occurred');
      }
    } catch (err) {
      setError(err.error || 'Failed to add loot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-poe-card rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-semibold text-poe-gold mb-4">
          Add Loot
        </h2>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">
              Item Name
            </label>
            <input
              type="text"
              value={formData.itemName}
              onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
              className="w-full bg-poe-darker border border-poe-border rounded px-3 py-2 text-white focus:border-poe-gold focus:outline-none"
              placeholder="e.g. Chaos Orb"
              required
            />
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1">
              Item Type
            </label>
            <select
              value={formData.itemType}
              onChange={(e) => setFormData({ ...formData, itemType: e.target.value })}
              className="w-full bg-poe-darker border border-poe-border rounded px-3 py-2 text-white focus:border-poe-gold focus:outline-none"
            >
              {ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getItemTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="w-full bg-poe-darker border border-poe-border rounded px-3 py-2 text-white focus:border-poe-gold focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-1">
                Chaos Value (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.chaosValue}
                onChange={(e) => setFormData({ ...formData, chaosValue: e.target.value })}
                className="w-full bg-poe-darker border border-poe-border rounded px-3 py-2 text-white focus:border-poe-gold focus:outline-none"
                placeholder="Auto"
              />
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-poe-darker text-gray-300 rounded hover:bg-poe-border transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-poe-gold text-poe-dark font-medium rounded hover:bg-poe-gold-dark transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
