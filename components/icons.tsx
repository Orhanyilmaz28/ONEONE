type IconProps = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

export const BagIcon = ({ className = "size-5" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 8h14l-1 12H6L5 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);
export const UserIcon = ({ className = "size-5" }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </svg>
);
export const SearchIcon = ({ className = "size-5" }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const CloseIcon = ({ className = "size-5" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const MenuIcon = ({ className = "size-5" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const ArrowIcon = ({ className = "size-4" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const PlusIcon = ({ className = "size-4" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const MinusIcon = ({ className = "size-4" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 12h14" />
  </svg>
);
export const TruckIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" />
    <circle cx="7" cy="17.5" r="1.5" />
    <circle cx="17" cy="17.5" r="1.5" />
  </svg>
);
export const ReturnIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </svg>
);
export const ShieldIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
export const LeafIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" />
    <path d="M5 19 13 11" />
  </svg>
);
export const CheckIcon = ({ className = "size-4" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="m5 12 5 5 9-10" />
  </svg>
);
export const StoreIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    <path d="M10 20v-5h4v5" />
  </svg>
);
export const ChatIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 5h16v11H9l-5 4V5Z" />
  </svg>
);
export const CardIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <rect height="14" rx="2" width="18" x="3" y="5" />
    <path d="M3 10h18M7 15h3" />
  </svg>
);
export const EyeOffIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 3l18 18M10.6 6.1A9.9 9.9 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.6 3.2M6.6 6.6C4.4 8 3 12 3 12s4 6 9 6a8.8 8.8 0 0 0 4.4-1.2" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);
export const SealIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="9" r="6" />
    <path d="m9 14-1.5 7L12 18.5 16.5 21 15 14" />
    <path d="m9.5 9 1.8 1.8L14.5 7.5" />
  </svg>
);
