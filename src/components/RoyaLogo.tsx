import React from 'react';

interface RoyaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  logoUrl?: string;
}

export const RoyaLogo: React.FC<RoyaLogoProps> = ({ 
  className = '', 
  size = 'md',
  logoUrl,
}) => {

  const sizeStyles = {
    sm: 'w-[180px]',
    md: 'w-[220px]',
    lg: 'w-[260px]',
  };

  return (
    <div className={`relative group flex flex-col items-center select-none ${sizeStyles[size]} ${className}`}>
      {logoUrl ? (
        /* Custom Uploaded Brand Logo */
        <div className="relative flex flex-col items-center justify-center p-1 w-full">
          <img 
            src={logoUrl} 
            alt="لوگوی شرکت" 
            className="max-h-24 max-w-full object-contain drop-shadow-xs transition-transform duration-200"
          />
        </div>
      ) : (
        /* Exact Vector Rendering of ROYA Surface Center Logo from Brand Asset */
        <svg 
          role="img"
          aria-label="ROYA Surface Center"
          viewBox="0 0 320 185" 
          className="w-full h-auto overflow-visible"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 1. ROYA Typography in brand red #D0192A */}
          <g fill="#D0192A">
            {/* R */}
            <path d="M 28 32 L 58 32 C 74 32 85 42 85 57 C 85 70 75 78 62 80.5 L 87 108 L 69 108 L 47 84 L 43 84 L 43 108 L 28 108 Z M 43 46 L 43 72 L 56 72 C 66 72 70 66 70 59 C 70 52 66 46 56 46 Z" />
            
            {/* O */}
            <path d="M 125 30 C 146 30 159 47 159 70 C 159 93 146 110 125 110 C 104 110 91 93 91 70 C 91 47 104 30 125 30 Z M 125 44 C 114 44 106.5 55 106.5 70 C 106.5 85 114 96 125 96 C 136 96 143.5 85 143.5 70 C 143.5 55 136 44 125 44 Z" />
            
            {/* Y */}
            <path d="M 166 32 L 183 32 L 198 68 L 213 32 L 230 32 L 206 80 L 206 108 L 190 108 L 190 80 Z" />
            
            {/* Stylized A (Inverted V / Lambda shape with sharp peak) */}
            <path d="M 235 108 L 261 32 L 277 32 L 303 108 L 287 108 L 269 55 L 251 108 Z" />
          </g>

          {/* 2. Surface Center in classic red serif */}
          <text 
            x="160" 
            y="135" 
            textAnchor="middle" 
            fill="#D0192A" 
            fontSize="24" 
            fontFamily="'Times New Roman', Georgia, 'Playfair Display', serif" 
            fontWeight="500"
            letterSpacing="0.05em"
          >
            Surface Center
          </text>

          {/* 3. Separator Red Line */}
          <line 
            x1="26" 
            y1="151" 
            x2="294" 
            y2="151" 
            stroke="#D0192A" 
            strokeWidth="1.2" 
          />

          {/* 4. Slogan: Dream | Design | Deliver in dark charcoal with red dividers */}
          <text 
            x="160" 
            y="172" 
            textAnchor="middle" 
            fontSize="14.5" 
            fontFamily="'Times New Roman', Georgia, serif" 
            fontWeight="400"
            letterSpacing="0.04em"
          >
            <tspan fill="#4B5563">Dream</tspan>
            <tspan fill="#D0192A" dx="10">|</tspan>
            <tspan fill="#4B5563" dx="10">Design</tspan>
            <tspan fill="#D0192A" dx="10">|</tspan>
            <tspan fill="#4B5563" dx="10">Deliver</tspan>
          </text>
        </svg>
      )}

    </div>
  );
};
