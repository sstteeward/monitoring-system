import React, { useState } from 'react';
import UserProfileModal from './UserProfileModal';

interface UserClickableNameProps {
    userId: string;
    userName: string;
    className?: string;
    style?: React.CSSProperties;
    showBadge?: boolean;
    accountType?: string;
}

const UserClickableName: React.FC<UserClickableNameProps> = ({ 
    userId, 
    userName, 
    className, 
    style,
    showBadge,
    accountType
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(true);
    };

    return (
        <>
            <span 
                onClick={handleClick}
                className={`user-clickable-name ${className || ''}`}
                style={{ 
                    cursor: 'pointer',
                    fontWeight: 'inherit',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'color 0.2s',
                    ...style 
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--primary)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'inherit';
                }}
            >
                {userName}
                {showBadge && accountType && (
                    <span className={`admin-badge badge-${accountType}`} style={{ fontSize: '0.65rem' }}>
                        {accountType}
                    </span>
                )}
            </span>
            {isOpen && (
                <UserProfileModal 
                    profileId={userId} 
                    onClose={() => setIsOpen(false)} 
                />
            )}
        </>
    );
};

export default UserClickableName;
