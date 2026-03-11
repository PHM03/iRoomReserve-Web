'use client';

import React from 'react';

interface SummaryCardProps {
  icon: string;
  number: string;
  label: string;
  color: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ icon, number, label, color }) => {
  return (
    <div className={`bg-white rounded-lg p-6 shadow-md border-l-4 ${color}`}>
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <span className="text-2xl">{icon}</span>
          </div>
        </div>
        <div className="ml-4">
          <p className="text-2xl font-semibold text-gray-900">{number}</p>
          <p className="text-sm text-gray-600">{label}</p>
        </div>
      </div>
    </div>
  );
};

export default SummaryCard;
