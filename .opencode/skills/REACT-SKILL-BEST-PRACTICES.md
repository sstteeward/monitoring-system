# React TSX Skill - Best Practices for OpenCode Agents

## 🎯 Core Principles for Agent Integration

### 1. **Clear Component Specifications**

When prompting your agent to generate components, be explicit about:

```
Good: "Create a reusable Button component that accepts label, onClick handler, 
and variant prop (primary/secondary/danger). Include TypeScript interfaces 
and make it memo-optimized."

Bad: "Make a button component"
```

**Why:** Clear specs help your agent generate production-ready code the first time.

### 2. **Progressive Component Building**

Build complex UIs component-by-component rather than all at once:

```
Phase 1: Create basic Button, Input, Select components
Phase 2: Compose them into Form component
Phase 3: Add validation and state management
Phase 4: Optimize performance with useMemo/useCallback
```

**Why:** Easier for agent to handle, easier to test, easier to maintain.

### 3. **Request Complete Type Definitions**

Always ask for interfaces to be defined alongside components:

```typescript
// ✅ Ask for this format:
interface CardProps {
  title: string;
  description: string;
  onAction?: () => void;
  variant?: 'default' | 'elevated' | 'outline';
}

const Card: React.FC<CardProps> = ({ ... }) => {
  // Component implementation
};

export type { CardProps };
```

**Why:** Makes props discoverable and prevents runtime errors.

---

## 📋 Agent Prompting Patterns

### Pattern 1: Component Generation with Requirements

```
I need a React component called "ProductCard" that:
- Displays product image, name, price, and rating
- Accepts TypeScript props: product (IProduct), onAddToCart (function)
- Shows a "Add to Cart" button that's disabled if out of stock
- Uses React.memo for performance
- Includes proper TypeScript interfaces
- Has no external dependencies (use React only)

Generate the complete TSX code with all types.
```

### Pattern 2: Refactoring Request

```
Here's my current component:
[paste class component or old code]

Please refactor it to:
- Use functional components with hooks
- Add proper TypeScript types
- Optimize with useCallback for handlers
- Use useMemo for expensive calculations
- Keep the same functionality
- Export types for consumers

Return the refactored code.
```

### Pattern 3: Performance Optimization

```
This component re-renders too often:
[paste component code]

Optimize by:
- Identifying unnecessary re-renders
- Using React.memo where appropriate
- Implementing useCallback for callbacks
- Using useMemo for derived state
- Explain what changed and why

Return optimized code.
```

### Pattern 4: Custom Hook Extraction

```
I have this logic repeated in 3 components:
[paste shared logic]

Extract it into a custom hook:
- Name it appropriately (use useXxx pattern)
- Accept configuration as parameters
- Return state/functions needed
- Add TypeScript types
- Show example usage

Return the hook and usage example.
```

### Pattern 5: Form Building

```
Build a registration form component with:
- Fields: email, password, confirmPassword, agreeToTerms
- Validation: email format, password 8+ chars, passwords match
- Error messages for each field
- Submit button (disabled until form valid)
- Success/error handling callback props
- TypeScript types for form data
- Accessible (ARIA labels, semantic HTML)

Return complete TSX component.
```

---

## 🔧 Configuration & Setup

### 1. **Set Agent Context**

Tell your agent about your project setup:

```
My React project uses:
- TypeScript strict mode enabled
- React 18+
- Tailwind CSS for styling
- Prettier for code formatting
- Jest + React Testing Library for tests
- ESLint with React recommended config

Generate components compatible with this setup.
```

### 2. **Define Coding Standards**

Establish what your agent should follow:

```
Code standards for all generated components:
- Use functional components only
- Props interfaces named as [ComponentName]Props
- Export both component and type
- Use const [Component]: React.FC<Props> = (props) => {}
- Max 300 lines per component (split if needed)
- JSX elements on separate lines if > 80 chars
- Comments for complex logic only
```

### 3. **CSS/Styling Convention**

Be clear about styling approach:

```
For styling, use:
- Tailwind CSS classes for all components
- No inline styles unless necessary
- CSS modules if you need scoped styles
- BEM naming for custom CSS classes

Example: className="btn btn--primary btn--lg"
```

---

## ✅ Quality Checklist Before Using Generated Code

After agent generates a component, verify:

### Type Safety ✓
- [ ] All props have TypeScript interfaces
- [ ] Interfaces are exported for consumers
- [ ] No `any` types used
- [ ] Return types are explicit for functions

### Functionality ✓
- [ ] Component does what was requested
- [ ] Event handlers are properly typed
- [ ] State updates are correct
- [ ] Edge cases are handled (empty states, errors)

### Performance ✓
- [ ] useCallback used for event handlers passed to children
- [ ] useMemo used for expensive computations
- [ ] No unnecessary re-renders
- [ ] Dependencies arrays are complete

### Code Quality ✓
- [ ] Code is readable and well-structured
- [ ] Comments explain "why" not "what"
- [ ] No console.errors or warnings
- [ ] Follows your project's code style

### Accessibility ✓
- [ ] Semantic HTML elements used
- [ ] ARIA labels where needed
- [ ] Keyboard navigation works
- [ ] Color contrast is sufficient

### Testing ✓
- [ ] Component is testable (no tight coupling)
- [ ] Props are easy to mock
- [ ] Side effects are isolated in useEffect
- [ ] Pure functions where possible

---

## 🚀 Workflow Examples

### Workflow 1: Building a Complete Form System

**Step 1: Request Base Components**
```
Generate 3 basic form components:
1. TextInput - input with label, error message
2. Checkbox - checkbox with label
3. Button - submit button with loading state

Each should have full TypeScript types and be styled with Tailwind.
```

**Step 2: Compose Into Form**
```
Now create a "ContactForm" component that:
- Uses the TextInput, Checkbox, Button components
- Manages form state with useState
- Validates on submit
- Shows error messages from validation
- Calls onSubmit callback with form data

Include complete types for form data.
```

**Step 3: Add Advanced Features**
```
Enhance ContactForm with:
- Loading state while submitting
- Success/error messages
- Clear form button
- Disable submit button while loading
- useCallback for handlers
- useMemo for validation results
```

**Step 4: Extract Custom Hook**
```
This form logic is complex. Extract into useForm hook:
- Takes initial values and validation function
- Returns form state, handlers, validation errors
- Handle reset, setValues, setFieldValue
- Return object: {values, errors, setValues, handleSubmit, reset}

Show usage in ContactForm.
```

### Workflow 2: Building a Data Table Component

**Step 1: Basic Table**
```
Create a Table component that:
- Accepts array of data and columns
- Renders header and rows
- Has full TypeScript generics: Table<T>
- Types for columns: Column<T>
- Uses React.memo for performance
```

**Step 2: Add Features**
```
Enhance Table with:
- Sorting by clicking headers
- Filtering by column values
- Pagination (10, 25, 50 items per page)
- Row selection with checkboxes
- Action buttons (edit, delete)

Use useMemo for filtered/sorted data.
```

**Step 3: Custom Hooks**
```
Extract into custom hooks:
- useTableSort(data, sortBy)
- useTableFilter(data, filters)
- useTablePagination(data, pageSize)
- usTableSelection(data)

Show how to compose them.
```

---

## 🎓 Learning & Iteration

### Getting Feedback Loop Right

1. **Generate code** with clear requirements
2. **Test it** in your application
3. **Provide feedback** to agent: "This works great, but..."
4. **Request refinements** with specific issues
5. **Iterate** until satisfied

Example iteration:

```
First attempt: "Create a Button component"
Feedback: "It works but styling isn't quite right. 
           The hover state feels sluggish."
Second attempt: "Update the Button - add faster 
                 transitions (100ms) and more vibrant 
                 hover color. Test performance."
Result: ✅ Better component
```

### Common Issues & How to Fix Them

| Issue | Fix |
|-------|-----|
| Component re-renders too often | Ask agent to add React.memo and useCallback |
| Props are hard to discover | Request exported TypeScript interfaces |
| No error handling | Ask for error boundary or error states |
| Styling inconsistent | Define CSS convention first, reference it |
| Performance degradation | Request useMemo for computations, useCallback for handlers |
| Type errors | Ask agent to enable TypeScript strict mode checks |

---

## 🔗 Integration with Other Skills

The React TSX skill works great alongside:

### With Postman Skill
```
Use together for:
- Component that displays API data
- Form that submits to API endpoints
- Error handling for API failures

"Create a UserList component that fetches from 
/api/users endpoint using fetch. Include loading 
and error states. Types from Postman collection."
```

### With Netlify Skill
```
Use together for:
- Deploy components as part of site
- Test components in production
- Monitor component performance

"Generate ProfileCard component optimized for 
Netlify deployment. Ensure no hydration mismatches."
```

---

## 📊 Measuring Success

Track these metrics for generated components:

| Metric | Target |
|--------|--------|
| TypeScript errors on first run | 0 |
| Build warnings | 0 |
| Component renders correctly | 100% |
| Types exported and usable | Yes |
| Code review comments | < 3 |
| Test coverage | > 80% |
| Performance (Lighthouse) | > 90 |

---

## 🎯 Advanced Tips

### Tip 1: Context for Complex Apps

If building a large system:
```
My app architecture:
- Pages in /pages directory
- Components in /components directory
- Custom hooks in /hooks directory
- Types in /types directory
- Utils in /utils directory

Generate components following this structure.
Include imports with correct paths.
```

### Tip 2: Requesting Multiple Variants

```
Generate 3 variants of Button component:
1. Solid (filled background)
2. Outline (bordered style)
3. Ghost (text only, no bg)

All should accept same props (label, onClick, etc).
Use discriminated union types if needed.
```

### Tip 3: Performance-First Generation

```
Generate [ComponentName] with performance as priority:
- Use React.memo by default
- useCallback for all functions
- useMemo for all computations
- Minimize re-renders
- Provide performance metrics/comments
```

### Tip 4: Accessibility-First Generation

```
Generate [ComponentName] with full accessibility:
- Semantic HTML only
- Complete ARIA labels
- Keyboard navigation
- Focus management
- Screen reader tested
- WCAG 2.1 AA compliant
```

---

## 🔄 Maintenance & Updates

### Updating Generated Components

When you need to modify generated code:

```
I need to update this component:
[paste current component code]

Changes:
1. Add new prop: disabled (boolean)
2. Update button to be disabled when true
3. Update TypeScript interface
4. Update JSDoc comments

Return updated component.
```

### Versioning Components

Keep track of iterations:

```
// v1: Basic Button component
// v2: Added memo optimization
// v3: Added loading state and disabled prop
// v4: Improved accessibility with ARIA

const Button: React.FC<ButtonProps> = ({ ... }) => {
  // v4 implementation
};
```

---

## 🎬 Quick Start Command

Copy this prompt to get started quickly:

```
Generate a [COMPONENT_NAME] React component with:

Requirements:
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

TypeScript:
- Export interface [COMPONENT_NAME]Props
- Strict type safety, no 'any'

Performance:
- Use React.memo
- useCallback for functions
- useMemo for computed values

Quality:
- No console errors
- Accessible (ARIA labels)
- Follow [YOUR_CODE_STYLE]

Return complete TSX code ready for production.
```

---

## 📚 Resources

When using the skill, reference these:
- React Docs: https://react.dev
- TypeScript Handbook: https://www.typescriptlang.org/docs/
- Accessibility Guidelines: https://www.w3.org/WAI/WCAG21/quickref/

---

## Summary

✅ **Do:**
- Give clear, detailed specifications
- Build progressively (small components first)
- Define coding standards upfront
- Export TypeScript types
- Review generated code before using
- Test in your actual application
- Provide feedback for iteration

❌ **Don't:**
- Use vague descriptions
- Ask for massive components at once
- Ignore TypeScript warnings
- Skip accessibility requirements
- Deploy without testing
- Assume generated code is perfect
- Forget to define your project's standards

Happy component building! 🚀
