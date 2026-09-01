import React, { useState, useRef } from 'react';

interface TooltipProps {
  content: string | React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 150,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsVisible(false);
  };

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && content && (
        <div
          style={{
            position: 'absolute',
            zIndex: 99999,
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '7px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            lineHeight: '1.4',
            whiteSpace: 'normal',
            width: 'max-content',
            maxWidth: '300px',
            border: '1.5px solid #0d9488',
            boxShadow: '0 8px 16px rgba(0,0,0,0.35)',
            pointerEvents: 'none',
            ...(position === 'top' && { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }),
            ...(position === 'bottom' && { top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }),
            ...(position === 'left' && { right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' }),
            ...(position === 'right' && { left: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' }),
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};
