# React Design System - Consistency Guide for OpenCode Agent

## 🎨 Design System Foundation

Your agent should follow this design system to ensure all components look and behave consistently.

---

## 1. Color Palette

Define your primary colors once, and use them everywhere:

```typescript
// colors.ts - Central color definitions
export const colors = {
  // Primary
  primary: '#0066CC',
  primaryLight: '#3399FF',
  primaryDark: '#004499',
  
  // Secondary
  secondary: '#FF6B35',
  secondaryLight: '#FF8C5A',
  secondaryDark: '#CC5520',
  
  // Neutrals
  neutral: {
    white: '#FFFFFF',
    gray50: '#F9FAFB',
    gray100: '#F3F4F6',
    gray200: '#E5E7EB',
    gray300: '#D1D5DB',
    gray400: '#9CA3AF',
    gray500: '#6B7280',
    gray600: '#4B5563',
    gray700: '#374151',
    gray800: '#1F2937',
    gray900: '#111827',
    black: '#000000',
  },
  
  // Semantic
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  
  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F9FAFB',
  
  // Text
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
};

// Tailwind equivalent (if using Tailwind)
export const tailwindColorMap = {
  primary: 'blue-600',
  primaryLight: 'blue-400',
  primaryDark: 'blue-800',
  secondary: 'orange-500',
  success: 'emerald-500',
  warning: 'amber-500',
  error: 'red-500',
  info: 'blue-500',
};
```

**Usage Rule:** Never hardcode colors. Always import from `colors.ts`.

---

## 2. Typography System

Define all text styles once:

```typescript
// typography.ts
export const fontFamily = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: '"Fira Code", "Courier New", monospace',
};

export const fontSize = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px
  base: '1rem',     // 16px
  lg: '1.125rem',   // 18px
  xl: '1.25rem',    // 20px
  '2xl': '1.5rem',  // 24px
  '3xl': '1.875rem', // 30px
  '4xl': '2.25rem', // 36px
};

export const fontWeight = {
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
  loose: 2,
};

// Text styles
export const textStyles = {
  // Headings
  h1: {
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.tight,
  },
  h2: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.tight,
  },
  h3: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.tight,
  },
  h4: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.normal,
  },
  
  // Body
  bodyLarge: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
    lineHeight: lineHeight.relaxed,
  },
  body: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.normal,
    lineHeight: lineHeight.normal,
  },
  bodySmall: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    lineHeight: lineHeight.normal,
  },
  
  // Special
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.normal,
  },
  caption: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.normal,
    lineHeight: lineHeight.tight,
  },
};

// Tailwind CSS classes (if using Tailwind)
export const textClassMap = {
  h1: 'text-4xl font-bold leading-tight',
  h2: 'text-3xl font-bold leading-tight',
  h3: 'text-2xl font-semibold leading-tight',
  h4: 'text-xl font-semibold',
  bodyLarge: 'text-lg leading-relaxed',
  body: 'text-base leading-normal',
  bodySmall: 'text-sm leading-normal',
  label: 'text-sm font-medium',
  caption: 'text-xs leading-tight',
};
```

**Usage Rule:** Use `textStyles` or `textClassMap` for all text elements. Never hardcode font sizes or weights.

---

## 3. Spacing System

Define all spacing values:

```typescript
// spacing.ts
export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem',   // 48px
  '3xl': '4rem',   // 64px
};

// Tailwind equivalents
export const spacingMap = {
  xs: 'p-1',
  sm: 'p-2',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
  '2xl': 'p-12',
  '3xl': 'p-16',
};
```

**Usage Rules:**
- Padding: `padding: spacing.md` (not `padding: '16px'`)
- Margin: `margin: spacing.lg` (not `margin: '24px'`)
- Gap: `gap: spacing.md` (not `gap: '16px'`)

---

## 4. Border Radius

Define corner rounding:

```typescript
// borderRadius.ts
export const borderRadius = {
  none: '0px',
  sm: '0.25rem',   // 4px - subtle
  md: '0.5rem',    // 8px - default
  lg: '0.75rem',   // 12px - large
  xl: '1rem',      // 16px - extra large
  '2xl': '1.5rem', // 24px - prominent
  full: '9999px',  // fully rounded
};

// Tailwind equivalents
export const radiusMap = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};
```

**Usage Rule:** `borderRadius: borderRadius.md` (never hardcode border-radius values)

---

## 5. Shadow System

Define shadows for elevation:

```typescript
// shadows.ts
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
};

// Tailwind equivalents
export const shadowMap = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  '2xl': 'shadow-2xl',
};
```

**Usage Rule:** Use shadow levels for card elevation, modals, dropdowns - never hardcode box-shadows.

---

## 6. Transitions & Animations

Define consistent motion:

```typescript
// transitions.ts
export const transitions = {
  fast: '100ms',
  normal: '200ms',
  slow: '300ms',
};

export const timingFunction = {
  linear: 'linear',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

export const transitionCSS = {
  fast: `all ${transitions.fast} ${timingFunction.easeInOut}`,
  normal: `all ${transitions.normal} ${timingFunction.easeInOut}`,
  slow: `all ${transitions.slow} ${timingFunction.easeInOut}`,
};

// Tailwind equivalents
export const transitionMap = {
  fast: 'transition-all duration-100 ease-in-out',
  normal: 'transition-all duration-200 ease-in-out',
  slow: 'transition-all duration-300 ease-in-out',
};
```

**Usage Rule:** All hover/focus effects use these transitions. Never hardcode animation durations.

---

## 7. Component Size Variants

Define consistent sizes:

```typescript
// sizes.ts
export const sizes = {
  // Buttons & Form inputs
  sm: '2rem',    // 32px height
  md: '2.5rem',  // 40px height
  lg: '3rem',    // 48px height
  
  // Icons
  iconXs: '1rem',     // 16px
  iconSm: '1.25rem',  // 20px
  iconMd: '1.5rem',   // 24px
  iconLg: '2rem',     // 32px
  iconXl: '2.5rem',   // 40px
};

// Tailwind equivalents
export const sizeMap = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-12',
  iconSm: 'w-5 h-5',
  iconMd: 'w-6 h-6',
  iconLg: 'w-8 h-8',
};
```

---

## 8. Z-Index Scale

Define stacking order:

```typescript
// zIndex.ts
export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
};

// Usage: position relative/absolute with zIndex.modal
```

**Usage Rule:** Never use arbitrary z-index values like `z-index: 999`. Use the scale.

---

## 9. Breakpoints (Responsive Design)

Define screen sizes:

```typescript
// breakpoints.ts
export const breakpoints = {
  mobile: '0px',
  tablet: '640px',
  desktop: '1024px',
  wide: '1280px',
  ultraWide: '1536px',
};

export const media = {
  mobile: `@media (min-width: ${breakpoints.mobile})`,
  tablet: `@media (min-width: ${breakpoints.tablet})`,
  desktop: `@media (min-width: ${breakpoints.desktop})`,
  wide: `@media (min-width: ${breakpoints.wide})`,
  ultraWide: `@media (min-width: ${breakpoints.ultraWide})`,
};

// Tailwind prefixes
export const tailwindMedia = {
  mobile: '',      // default
  tablet: 'sm:',
  desktop: 'lg:',
  wide: 'xl:',
  ultraWide: '2xl:',
};
```

---

## 10. Component Variants

Define variant options for all components:

```typescript
// variants.ts
export const buttonVariants = {
  primary: {
    bg: colors.primary,
    text: colors.neutral.white,
    hover: colors.primaryDark,
    border: colors.primary,
  },
  secondary: {
    bg: colors.secondary,
    text: colors.neutral.white,
    hover: colors.secondaryDark,
    border: colors.secondary,
  },
  outline: {
    bg: colors.neutral.white,
    text: colors.primary,
    hover: colors.primary,
    border: colors.primary,
  },
  ghost: {
    bg: 'transparent',
    text: colors.text,
    hover: colors.neutral.gray100,
    border: 'transparent',
  },
  danger: {
    bg: colors.error,
    text: colors.neutral.white,
    hover: '#DC2626',
    border: colors.error,
  },
};

export const buttonSizes = {
  sm: {
    padding: `${spacing.sm} ${spacing.md}`,
    fontSize: fontSize.sm,
  },
  md: {
    padding: `${spacing.md} ${spacing.lg}`,
    fontSize: fontSize.base,
  },
  lg: {
    padding: `${spacing.lg} ${spacing.xl}`,
    fontSize: fontSize.lg,
  },
};

// Card variants
export const cardVariants = {
  elevated: {
    shadow: shadows.lg,
    bg: colors.neutral.white,
  },
  outline: {
    shadow: shadows.sm,
    bg: colors.neutral.white,
    border: `1px solid ${colors.neutral.gray200}`,
  },
  subtle: {
    shadow: shadows.none,
    bg: colors.neutral.gray50,
  },
};
```

---

## 11. Accessibility Standards

Define accessible defaults:

```typescript
// accessibility.ts
export const a11y = {
  // Focus states
  focusRing: `0 0 0 3px rgba(0, 102, 204, 0.1), 0 0 0 2px #0066CC`,
  focusRingDark: `0 0 0 3px rgba(51, 153, 255, 0.2), 0 0 0 2px #3399FF`,
  
  // Minimum touch target
  minTouchTarget: '44px', // 44x44 minimum
  
  // Color contrast ratios (WCAG AA)
  contrastRatios: {
    normalText: '4.5:1',
    largeText: '3:1',
  },
};

// Always include:
// - Semantic HTML (button, input, label, etc)
// - ARIA labels for icons
// - Keyboard navigation support
// - Focus visible states
// - Color should not be the only differentiator
```

---

## 12. Design System Configuration

Centralized theme configuration:

```typescript
// designSystem.ts - Main export
export const designSystem = {
  colors,
  typography: {
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    textStyles,
  },
  spacing,
  borderRadius,
  shadows,
  transitions,
  sizes,
  zIndex,
  breakpoints,
  variants: {
    button: buttonVariants,
    buttonSize: buttonSizes,
    card: cardVariants,
  },
  a11y,
};

// For easy imports
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './borderRadius';
export * from './shadows';
export * from './transitions';
export * from './sizes';
export * from './zIndex';
export * from './breakpoints';
export * from './variants';
export * from './accessibility';
```

---

## Component Template with Design System

Here's how components should use the design system:

```typescript
import React from 'react';
import { 
  colors, 
  spacing, 
  borderRadius, 
  fontSize, 
  fontWeight,
  transitions,
  buttonVariants,
  buttonSizes,
  a11y 
} from '@/designSystem';

interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  label,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
}) => {
  const variantStyle = buttonVariants[variant];
  const sizeStyle = buttonSizes[size];

  const buttonStyle = {
    // Layout
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    
    // Sizing
    padding: sizeStyle.padding,
    fontSize: sizeStyle.fontSize,
    
    // Colors
    backgroundColor: disabled ? colors.neutral.gray300 : variantStyle.bg,
    color: disabled ? colors.neutral.gray500 : variantStyle.text,
    border: `1px solid ${disabled ? colors.neutral.gray300 : variantStyle.border}`,
    
    // Shape
    borderRadius: borderRadius.md,
    
    // Animation
    transition: transitions.normal,
    cursor: disabled ? 'not-allowed' : 'pointer',
    
    // Typography
    fontWeight: fontWeight.medium,
    
    // Focus (Accessibility)
    outlineOffset: '2px',
  } as React.CSSProperties;

  const hoverStyle = {
    ':hover': {
      backgroundColor: disabled ? undefined : variantStyle.hover,
      boxShadow: disabled ? 'none' : shadows.md,
    },
    ':focus-visible': {
      outline: `2px solid ${colors.primary}`,
      outlineOffset: '2px',
    },
  };

  return (
    <button
      style={buttonStyle}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      aria-label={label}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.backgroundColor = variantStyle.hover;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = variantStyle.bg;
      }}
    >
      {icon && <span>{icon}</span>}
      {loading ? 'Loading...' : label}
    </button>
  );
};

export default Button;
export type { ButtonProps };
```

---

## Agent Instructions for Design Consistency

When requesting components, include this directive:

```
Generate [ComponentName] following our design system:

Design System Imports:
- colors from '@/designSystem'
- spacing from '@/designSystem'
- borderRadius from '@/designSystem'
- fontSize, fontWeight from '@/designSystem'
- transitions from '@/designSystem'
- shadows from '@/designSystem'
- a11y from '@/designSystem'

Requirements:
1. Use colors from designSystem, never hardcode colors
2. Use spacing scale (spacing.sm, spacing.md, spacing.lg, etc)
3. Use borderRadius scale (borderRadius.sm, borderRadius.md, etc)
4. Use textStyles for all text elements
5. Use transitions for all animations
6. Use shadows for elevation
7. Implement focus states with a11y.focusRing
8. Support responsive design with breakpoints
9. Document which design tokens are used
10. Export component and types

Return component with full design system compliance.
```

---

## Design System Usage Checklist

Before deploying any component, verify:

- [ ] All colors imported from `colors` object
- [ ] All spacing uses `spacing` scale
- [ ] All border-radius uses `borderRadius` scale
- [ ] All font sizes use `fontSize` scale
- [ ] All fonts weights use `fontWeight` scale
- [ ] All shadows use `shadows` scale
- [ ] All transitions use `transitions` scale
- [ ] All z-index uses `zIndex` scale
- [ ] Component supports size variants (sm/md/lg)
- [ ] Component supports style variants (primary/secondary/etc)
- [ ] Focus states implemented with accessibility focus ring
- [ ] Semantic HTML used
- [ ] ARIA labels for interactive elements
- [ ] Responsive design for breakpoints
- [ ] Hover/active states consistent
- [ ] Loading states implemented
- [ ] Disabled states handled
- [ ] No hardcoded CSS values
- [ ] Types exported with component
- [ ] Comments explain complex logic only

---

## Design Tokens File Structure

Organize design system files:

```
src/
├── designSystem/
│   ├── index.ts (main export)
│   ├── colors.ts
│   ├── typography.ts
│   ├── spacing.ts
│   ├── borderRadius.ts
│   ├── shadows.ts
│   ├── transitions.ts
│   ├── sizes.ts
│   ├── zIndex.ts
│   ├── breakpoints.ts
│   ├── variants.ts
│   └── accessibility.ts
├── components/
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Input.tsx
│   └── ...
└── hooks/
```

---

## Summary: Design System Principles

1. **Single Source of Truth** - All design values defined once in designSystem
2. **No Hardcoding** - Never hardcode colors, spacing, sizes, etc
3. **Consistent Variants** - All components support same variant/size options
4. **Accessible by Default** - All components include focus states and ARIA labels
5. **Responsive Ready** - Components work at all breakpoints
6. **Motion Guidelines** - All transitions use defined timing functions
7. **Type Safe** - All design tokens have TypeScript types
8. **Documented** - Why design tokens are used, not just what

---

## Example: Full Component Using Design System

```typescript
import React, { useState } from 'react';
import {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  textStyles,
  shadows,
  transitions,
  cardVariants,
  a11y,
} from '@/designSystem';

interface CardProps {
  title: string;
  description: string;
  variant?: 'elevated' | 'outline' | 'subtle';
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({
  title,
  description,
  variant = 'elevated',
  onClick,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const variantStyle = cardVariants[variant];

  const cardStyle = {
    padding: spacing.lg,
    backgroundColor: variantStyle.bg,
    border: variantStyle.border || 'none',
    borderRadius: borderRadius.lg,
    boxShadow: variantStyle.shadow,
    transition: transitions.normal,
    cursor: onClick ? 'pointer' : 'default',
    outline: isFocused ? a11y.focusRing : 'none',
  } as React.CSSProperties;

  const titleStyle = {
    ...textStyles.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  };

  const descriptionStyle = {
    ...textStyles.body,
    color: colors.textSecondary,
  };

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && e.key === 'Enter') onClick();
      }}
    >
      <h3 style={titleStyle}>{title}</h3>
      <p style={descriptionStyle}>{description}</p>
    </div>
  );
};

export default Card;
export type { CardProps };
```

This ensures **perfect consistency** across your entire design system! 🎨

