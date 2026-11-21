import React from 'react';
import type { LabNode } from '../types';

type DeviceType = LabNode['deviceType'];

interface DeviceIconProps {
  type: DeviceType | string;
  className?: string;
}

const strokeProps = {
  viewBox: '0 0 32 32',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const DeviceIcon: React.FC<DeviceIconProps> = ({ type, className = 'w-6 h-6' }) => {
  switch (type) {
    case 'switch':
      return (
        <svg {...strokeProps} className={className}>
          <rect x="3" y="10" width="26" height="14" rx="3" />
          <path d="M7 16h2m3 0h2m3 0h2m3 0h2M7 20h2m3 0h2m3 0h2m3 0h2" />
          <path d="M4 13h24" />
        </svg>
      );
    case 'firewall':
      return (
        <svg {...strokeProps} className={className}>
          <path d="M16 3l10 4v8c0 6-4 10-10 14C10 25 6 21 6 15V7l10-4z" />
          <path d="M11 14h10M11 18h10M16 10v12" />
        </svg>
      );
    case 'pc':
      return (
        <svg {...strokeProps} className={className}>
          <rect x="4" y="6" width="24" height="16" rx="2" />
          <path d="M12 26h8M16 22v4M8 11h12M8 15h8" />
        </svg>
      );
    case 'windows-client':
      return (
        <svg {...strokeProps} className={className}>
          <rect x="4" y="5" width="24" height="18" rx="2" />
          <path d="M8 9h7v6H8zM17 9h7v6h-7zM8 17h7v3H8zM17 17h7v3h-7zM12 26h8M16 23v3" />
        </svg>
      );
    case 'server':
      return (
        <svg {...strokeProps} className={className}>
          <rect x="6" y="4" width="20" height="7" rx="2" />
          <rect x="6" y="12.5" width="20" height="7" rx="2" />
          <rect x="6" y="21" width="20" height="7" rx="2" />
          <path d="M10 7.5h.01M10 16h.01M10 24.5h.01M14 7.5h8M14 16h8M14 24.5h8" />
        </svg>
      );
    case 'wireless':
      return (
        <svg {...strokeProps} className={className}>
          <path d="M6 13a14 14 0 0120 0M9.5 17a9 9 0 0113 0M13 21a4 4 0 016 0" />
          <path d="M5 26h22M9 26v-2m14 2v-2" />
          <circle cx="16" cy="24" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'router':
    default:
      return (
        <svg {...strokeProps} className={className}>
          <path d="M9 12V7m14 5V7" />
          <rect x="4" y="12" width="24" height="12" rx="3" />
          <path d="M8 18h2m4 0h2m4 0h4M8 21h16" />
          <circle cx="9" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="23" cy="7" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
  }
};
