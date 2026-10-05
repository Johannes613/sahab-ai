import React from 'react';

export default function Card({ children, className = '', onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 ${
        onClick ? 'cursor-pointer hover:border-accent/40 transition-all' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
