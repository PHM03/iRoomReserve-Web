'use client';

import React from 'react';

interface SummaryCardProps {
  icon: string;
  number: string;
  label: string;
  color: string;
}

const SummaryCard: React.FC<Readonly<SummaryCardProps>> = ({ icon, number, label, color }) => {
  return (
    <div className={`glass-card p-6 border-l-4 ${color}`}>
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-dark/5 flex items-center justify-center">
            <span className="text-2xl">{icon}</span>
          </div>
        </div>
        <div className="ml-4">
          <p className="text-2xl font-bold text-black">{number}</p>
          <p className="text-sm text-black">{label}</p>
        </div>
      </div>
    </div>
  );
};

export default SummaryCard;
