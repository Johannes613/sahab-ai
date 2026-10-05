import React from 'react';

export default function Button({
  children, variant = 'primary', size = 'md', onClick, disabled, className = '', type = 'button',
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary:
      'border border-[var(--border)] text-[var(--text-main)] hover:bg-[var(--bg)] bg-transparent',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg)]',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
