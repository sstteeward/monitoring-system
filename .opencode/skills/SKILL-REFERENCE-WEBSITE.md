# React TSX Skill - Reference Website & Documentation

Complete documentation for the `react-tsx-dev` skill for OpenCode agents.

---

## 📖 Table of Contents

1. [Skill Overview](#skill-overview)
2. [How to Install](#how-to-install)
3. [Skill Capabilities](#skill-capabilities)
4. [When to Trigger](#when-to-trigger)
5. [Prompting Guide](#prompting-guide)
6. [API Reference](#api-reference)
7. [Code Examples](#code-examples)
8. [Workflow Examples](#workflow-examples)
9. [FAQ](#faq)
10. [Troubleshooting](#troubleshooting)

---

## Skill Overview

### What is the React TSX Skill?

The `react-tsx-dev` skill is an **AI agent skill** designed for OpenCode and Antigravity IDE that enables autonomous agents to:

- ✅ Generate production-ready React TypeScript (TSX) components
- ✅ Refactor existing components to modern patterns
- ✅ Implement hooks and state management correctly
- ✅ Ensure design system compliance
- ✅ Optimize performance (memo, useCallback, useMemo)
- ✅ Add accessibility features (ARIA, focus states, semantic HTML)
- ✅ Generate TypeScript interfaces and types
- ✅ Create custom hooks for reusable logic
- ✅ Build complex UI patterns (forms, tables, modals)

### Key Features

| Feature | Description |
|---------|-------------|
| **Type Safety** | Full TypeScript support with strict mode |
| **Performance** | React.memo, useCallback, useMemo patterns |
| **Accessibility** | WCAG 2.1 AA compliance built-in |
| **Design System** | Integrates with your design tokens |
| **Modern Patterns** | Functional components with hooks only |
| **Testing Ready** | Generates testable, pure components |
| **Production Ready** | No console errors, fully optimized |

---

## How to Install

### For OpenCode IDE

1. **Download the skill**
   - Get `react-tsx-dev.skill` file

2. **Locate skills folder**
   ```
   .opencode/skills/
   ```

3. **Extract the skill**
   ```bash
   unzip react-tsx-dev.skill -d .opencode/skills/
   ```

4. **Restart OpenCode**
   - Quit and reopen OpenCode
   - Skill automatically detected

5. **Verify installation**
   - Create a new task
   - Type "create a button component"
   - Skill should trigger automatically

### For Antigravity IDE

1. **Download the skill**
   - Get `react-tsx-dev.skill` file

2. **Import into Antigravity**
   - Menu → Settings → Skills
   - Click "Add Skill"
   - Select `react-tsx-dev.skill`
   - Click Import

3. **Verify activation**
   - Create new Agent task
   - Skill appears in available skills
   - Ready to use

### For Custom Integration

If integrating with another IDE:

```
Extract .skill file:
  unzip react-tsx-dev.skill
  
Load SKILL.md into agent context:
  cat react-tsx-dev-skill/SKILL.md
  
Reference in agent system prompt
```

---

## Skill Capabilities

### Component Generation

The skill can generate:

```typescript
// Atomic components
- Button
- Input / Textarea
- Select / Dropdown
- Checkbox / Radio
- Card
- Badge
- Alert / Toast
- Modal / Dialog
- Breadcrumb
- Pagination

// Composite components
- Form with validation
- Data table
- Navigation bar
- Header / Footer
- Sidebar
- Dropdown menu
- Date picker
- File upload
- Search bar
- Tabs

// Advanced patterns
- Custom hooks
- Context providers
- Error boundaries
- Lazy loading
- Infinite scroll
- Real-time updates
- File handling
```

### Refactoring

The skill can refactor:

```typescript
// Class → Functional
- Convert class components to functional
- Replace lifecycle with hooks
- Update prop handling

// Pattern improvements
- Add missing useCallback
- Add missing useMemo
- Remove unnecessary re-renders
- Extract custom hooks
- Improve TypeScript types

// Code modernization
- Update deprecated patterns
- Improve accessibility
- Add error handling
- Optimize performance
```

### Type Generation

The skill automatically generates:

```typescript
// Interface definitions
- ComponentProps interface
- State shape interfaces
- API response types
- Form data types

// Type utilities
- Union types for variants
- Discriminated unions
- Generic types for reusable components
- Utility types (Partial, Pick, Omit)

// Documentation
- JSDoc comments
- PropTypes (if needed)
- Type assertions where safe
```

---

## When to Trigger

### Automatic Triggers

The skill automatically activates when you mention:

| Phrase | Use Case |
|--------|----------|
| "Create a button component" | Component generation |
| "Generate a form" | Complex component |
| "Build a modal" | Component composition |
| "Make an input with validation" | Smart component |
| "Refactor this class component" | Code modernization |
| "Add hooks to component" | Pattern upgrade |
| "Create a custom hook" | Logic extraction |
| "Generate types for component" | Type safety |
| "Build a data table" | Complex pattern |
| "Optimize this component" | Performance improvement |

### Explicit Trigger

Force the skill to activate:

```
@react-tsx-dev: Create a Button component with...
```

### Skill Description

The skill triggers when you ask for:

- **React components** - "Create a React component..."
- **TypeScript code** - "Generate TypeScript..."
- **TSX files** - "Write TSX code..."
- **Component refactoring** - "Refactor component..."
- **Hooks** - "Create a custom hook..."
- **Forms** - "Build a form with validation..."
- **Accessible UI** - "Make an accessible button..."
- **Performance optimization** - "Optimize re-renders..."

---

## Prompting Guide

### Basic Component Request

**Structure:**
```
Create [ComponentName] component with:
- Props: [list with types]
- Features: [what it does]
- Design: [styling approach]
- Types: [export interfaces]
```

**Example:**
```
Create Button component with:
- Props: label (string), onClick (function), variant (primary/secondary/outline), size (sm/md/lg), disabled (boolean)
- Features: All variants, hover states, click handler
- Design: Use design system tokens
- Types: Export ButtonProps interface

Include TypeScript, React.memo for performance.
```

### Refactoring Request

**Structure:**
```
Refactor [component] to:
- Use [pattern]
- Add [feature]
- Optimize [aspect]
- Types: [TypeScript improvements]
```

**Example:**
```
Refactor LoginForm to:
- Use functional component with hooks
- Add useCallback for handlers
- Optimize with useMemo for validation
- Types: Full TypeScript with strict mode
- Change: Make form state management cleaner
```

### Pattern Request

**Structure:**
```
Create a [pattern] using:
- Components: [which components]
- State: [state management]
- Validation: [validation logic]
- Integration: [API/external integration]
```

**Example:**
```
Create a registration form using:
- Components: TextInput, Checkbox, Button
- State: useState for form data
- Validation: Email, password strength, confirm match
- Integration: Call onSubmit callback with form data
```

### Performance Request

**Structure:**
```
Optimize [component] for performance:
- Identify: [what causes re-renders]
- Fix: [specific optimizations]
- Measure: [performance improvements]
```

**Example:**
```
Optimize ProductList component:
- Identify: List items re-render when parent updates
- Fix: Add React.memo, useCallback for item click handler
- Measure: Show before/after render counts
```

---

## API Reference

### Skill Metadata

```yaml
name: react-tsx-dev
description: >
  Generate, refactor, and optimize React TypeScript components.
  Use when: creating React components, refactoring to hooks,
  building forms, optimizing performance, adding types.
compatibility: Node.js 16+, React 18+, TypeScript 4.5+
```

### Input Format

The skill expects:

```
User request about React/TypeScript development
↓
Agent processes with skill context
↓
Generates component/code
```

### Output Format

The skill produces:

```typescript
// 1. Component file
// - Functional component with hooks
// - TypeScript interfaces
// - React.memo wrapper
// - Export statements

// 2. Types file (if needed)
// - Component props interface
// - State type definitions
// - Utility types

// 3. Examples (in comments)
// - Usage example
// - Props example
// - Integration example

// 4. Documentation
// - JSDoc comments
// - What each prop does
// - Performance notes
// - Accessibility notes
```

### Component Template

All generated components follow:

```typescript
import React, { [hooks] } from 'react';
import { [designSystemTokens] } from '@/designSystem';

/**
 * [ComponentName]
 * 
 * [Description]
 * 
 * @example
 * <ComponentName prop={value} />
 */

interface ComponentProps {
  /** Prop description */
  propName: PropType;
  // ... more props
}

const Component: React.FC<ComponentProps> = (props) => {
  // Logic here
  return (
    // JSX
  );
};

export default Component;
export type { ComponentProps };
```

---

## Code Examples

### Example 1: Simple Component

**Request:**
```
Create a Badge component that displays a label with a color variant.
Props: label (string), variant (success/warning/error/info).
Use design system colors.
```

**Generated Output:**
```typescript
import React from 'react';
import { colors, spacing, borderRadius, fontSize } from '@/designSystem';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'error' | 'info';
}

const Badge: React.FC<BadgeProps> = ({ label, variant = 'info' }) => {
  const variantColors = {
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    info: colors.info,
  };

  return (
    <span
      style={{
        backgroundColor: variantColors[variant],
        color: 'white',
        padding: `${spacing.xs} ${spacing.sm}`,
        borderRadius: borderRadius.full,
        fontSize: fontSize.sm,
        fontWeight: 500,
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
};

export default Badge;
export type { BadgeProps };
```

### Example 2: Form Component with Validation

**Request:**
```
Create an EmailInput component with:
- Props: value, onChange, error, required
- Validation: email format
- Show error message if invalid
- Design system compliant
- TypeScript with full types
```

**Generated Output:**
```typescript
import React, { useState } from 'react';
import { colors, spacing, fontSize, fontWeight, textStyles } from '@/designSystem';

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
}

const EmailInput: React.FC<EmailInputProps> = ({
  value,
  onChange,
  error,
  required = false,
  placeholder = 'Enter email',
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const isInvalid = !!error;
  const borderColor = isFocused
    ? colors.primary
    : isInvalid
    ? colors.error
    : colors.neutral.gray300;

  return (
    <div>
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: '100%',
          padding: `${spacing.md} ${spacing.md}`,
          fontSize: fontSize.base,
          border: `1px solid ${borderColor}`,
          borderRadius: '6px',
          transition: 'all 0.2s',
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        aria-invalid={isInvalid}
      />
      {error && (
        <div style={{ ...textStyles.caption, color: colors.error, marginTop: spacing.xs }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default EmailInput;
export type { EmailInputProps };
```

### Example 3: Custom Hook

**Request:**
```
Create useForm custom hook that:
- Manages form state
- Handles validation
- Returns values, errors, handlers
- useCallback for performance
```

**Generated Output:**
```typescript
import { useState, useCallback } from 'react';

interface UseFormOptions<T> {
  initialValues: T;
  onSubmit: (values: T) => void | Promise<void>;
  validate?: (values: T) => Record<string, string>;
}

export function useForm<T extends Record<string, any>>({
  initialValues,
  onSubmit,
  validate,
}: UseFormOptions<T>) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setFieldValue = useCallback((field: keyof T, value: any) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (validate) {
        const newErrors = validate(values);
        setErrors(newErrors);
        if (Object.keys(newErrors).length > 0) return;
      }

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    },
    [values, onSubmit, validate]
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  return {
    values,
    errors,
    setFieldValue,
    handleSubmit,
    reset,
    isSubmitting,
  };
}
```

---

## Workflow Examples

### Workflow 1: Building a Login Form

**Step 1: Create base components**
```
Agent: "Create TextInput component with label, value, onChange, error props"
Result: src/components/TextInput.tsx
```

**Step 2: Create button**
```
Agent: "Create Button component with primary and secondary variants"
Result: src/components/Button.tsx
```

**Step 3: Compose into form**
```
Agent: "Create LoginForm component using TextInput and Button. 
Include email validation and password validation."
Result: src/components/LoginForm.tsx
```

**Step 4: Create hook**
```
Agent: "Create useForm hook for form state management and validation"
Result: src/hooks/useForm.ts
```

**Step 5: Test**
```
Agent: "Create unit tests for LoginForm component using React Testing Library"
Result: src/components/__tests__/LoginForm.test.tsx
```

### Workflow 2: Building a Product Grid

**Step 1: Create ProductCard component**
```
Agent: "Create ProductCard component showing product image, name, price, and rating"
Result: src/components/ProductCard.tsx
```

**Step 2: Create ProductGrid layout**
```
Agent: "Create ProductGrid component with responsive grid layout.
Support mobile (1 column), tablet (2 columns), desktop (3 columns)"
Result: src/components/ProductGrid.tsx
```

**Step 3: Add filtering**
```
Agent: "Add filtering to ProductGrid. Support filter by category and price range"
Result: Updated ProductGrid.tsx with filtering logic
```

**Step 4: Add sorting**
```
Agent: "Add sorting to ProductGrid. Support sort by price and popularity"
Result: useSort hook + updated ProductGrid
```

**Step 5: Optimize**
```
Agent: "Optimize ProductGrid for performance. Use useMemo for filtered data,
useCallback for handlers, React.memo for ProductCard"
Result: Performance-optimized components
```

---

## FAQ

### Q: When should I use this skill?

**A:** Use it whenever you need React TSX code. Examples:
- Building new components
- Refactoring old components
- Implementing new features
- Optimizing performance
- Adding accessibility
- Creating custom hooks

### Q: What version of React does this skill target?

**A:** React 18+ with hooks (no class components).

### Q: Does it support CSS-in-JS libraries?

**A:** The skill teaches inline styles and design system tokens by default. It can work with styled-components, emotion, or CSS modules if you specify in the prompt.

### Q: How does it handle design systems?

**A:** The skill assumes you have a design system at `@/designSystem` and imports colors, spacing, typography, etc. from there.

### Q: Can it generate tests?

**A:** Yes! Request: "Create tests for [Component] using Jest and React Testing Library"

### Q: Does it support Next.js?

**A:** The skill focuses on component generation. For Next.js-specific features, mention it in the prompt: "Create a Next.js page component..."

### Q: How does type safety work?

**A:** All components export TypeScript interfaces for props. Types are strictly enforced (no `any` types).

### Q: Can it refactor my existing components?

**A:** Yes! Paste the existing code and request: "Refactor this component to use hooks and add TypeScript types"

### Q: What about performance optimization?

**A:** The skill automatically applies React.memo, useCallback, and useMemo. Request more: "Optimize this component and explain what changed"

### Q: How does accessibility work?

**A:** The skill adds ARIA labels, semantic HTML, focus states, and keyboard navigation by default.

---

## Troubleshooting

### Issue: Component doesn't compile

**Cause:** Missing imports or type errors

**Solution:**
```
Request: "Check the types in [Component] and fix any TypeScript errors.
Run `tsc --noEmit` and report what needs fixing"
```

### Issue: Component not using design system

**Cause:** Agent forgot to import design tokens

**Solution:**
```
Request: "Refactor [Component] to use design system. 
Import colors, spacing, typography from @/designSystem.
Replace all hardcoded values with design tokens"
```

### Issue: Component re-renders too often

**Cause:** Missing memo, useCallback, or useMemo

**Solution:**
```
Request: "Optimize [Component] for performance. 
Use React.memo, useCallback for handlers, useMemo for computations.
Identify the cause of extra re-renders"
```

### Issue: Not accessible

**Cause:** Missing ARIA labels or semantic HTML

**Solution:**
```
Request: "Add accessibility to [Component]. 
Include ARIA labels, semantic HTML, focus ring on interactive elements.
Verify keyboard navigation works"
```

### Issue: Props not exported

**Cause:** Forgot to export interface

**Solution:**
```
Request: "Export ComponentProps interface and show usage example"
```

### Issue: No TypeScript types

**Cause:** Types not defined

**Solution:**
```
Request: "Add full TypeScript types to [Component].
Create interfaces for all props and state.
No 'any' types allowed"
```

---

## Best Practices

### Do ✅

- Be specific about requirements
- Request design system compliance
- Ask for TypeScript types
- Request optimization
- Specify accessibility needs
- Review generated code
- Test in browser
- Provide feedback

### Don't ❌

- Use vague descriptions
- Ignore TypeScript warnings
- Skip accessibility
- Hardcode values
- Create massive components
- Use class components
- Skip testing
- Deploy without review

---

## Integration Examples

### With Design System

```
"Create Button component:
- Use colors from @/designSystem
- Use spacing scale: spacing.sm, spacing.md, spacing.lg
- Use fontSize and fontWeight from designSystem
- Use borderRadius from designSystem
- Ensure design consistency"
```

### With State Management (Redux)

```
"Create UserProfile component that:
- Gets user data from Redux store
- Dispatches updateUser action on save
- Shows loading and error states
- Fully typed with Redux types"
```

### With API Integration

```
"Create ProductList component that:
- Fetches products from GET /api/products
- Shows loading, error, and empty states
- Uses React.useEffect with cleanup
- Has TypeScript types for API response"
```

### With Form Library (React Hook Form)

```
"Create LoginForm component using:
- React Hook Form for form management
- Custom validation rules
- Error message display
- Submit handler with API call"
```

---

## Summary

The `react-tsx-dev` skill enables:

✅ **Fast component generation** - Create production-ready components in seconds
✅ **Type safety** - Full TypeScript with no `any` types
✅ **Design consistency** - Enforces design system usage
✅ **Performance** - Built-in optimization patterns
✅ **Accessibility** - WCAG AA compliance by default
✅ **Best practices** - Modern React patterns and hooks
✅ **Refactoring** - Upgrade legacy components automatically

**Use it for all your React TSX development needs!**

---

## Resources

- [REACT-SKILL-BEST-PRACTICES.md](./REACT-SKILL-BEST-PRACTICES.md) - Detailed prompting guide
- [DESIGN-SYSTEM-CONSISTENCY.md](./DESIGN-SYSTEM-CONSISTENCY.md) - Design tokens reference
- [REFERENCE-SITE.md](./REFERENCE-SITE.md) - Code examples and patterns
- [ANTIGRAVITY-REACT-COMPLETE-GUIDE.md](./ANTIGRAVITY-REACT-COMPLETE-GUIDE.md) - Antigravity workflows

---

## Support

**Having issues?** Check the [Troubleshooting](#troubleshooting) section.

**Need help?** Reference the [Workflow Examples](#workflow-examples).

**Want to learn more?** Read [Best Practices](#best-practices).

