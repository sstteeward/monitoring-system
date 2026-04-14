# React TSX Development with Antigravity IDE - Complete Guide

## 🚀 Overview

This guide shows how to use your React TSX Skill and 
Design System within
Google Antigravity IDE for autonomous, consistent web development.

---

## 1. Antigravity Architecture for React Development

### Key Antigravity Features for Web Dev

| Feature                | How It Helps React Development                              |
|------------------------|------------------------------------------------------------|
| Agent Manager          | Orchestrate multiple agents building different components/features |
| Browser-in-Loop        | Test components in real browser while agents iterate        |
| Multi-Agent Tasks      | One agent builds components, another tests, another optimizes |
| Artifact Generation    | Agents create task lists, code diffs, test results          |
| Code Editor            | VS Code-like interface for reviewing and editing agent work |
| Terminal Access        | Install packages, run build, run tests automatically        |

### Workflow Example

```text
Agent 1: Generate Button, Input, Select components
            ↓
Agent 2: Compose into Form component
            ↓
Agent 3: Test form in browser, fix issues
            ↓
Agent 4: Optimize performance and a11y
            ↓
Result: Production-ready component suite
```
Agent 1: Generate Button, Input, Select components
           ↓
Agent 2: Compose into Form component
           ↓
Agent 3: Test form in browser, fix issues
           ↓
Agent 4: Optimize performance and a11y
           ↓
Result: Production-ready component suite
```

---

## 2. Setting Up Your Project in Antigravity

### Step 1: Create React + TypeScript Project

**Initial Prompt to Agent:**

```
Create a new React project with TypeScript and Tailwind CSS:

1. Initialize with: npm create vite@latest my-app -- --template react-ts
2. Install dependencies: npm install
3. Install Tailwind: npm install -D tailwindcss postcss autoprefixer
4. Initialize Tailwind: npx tailwindcss init -p
5. Configure tailwind.config.js for src/
6. Create directory structure:
   - src/designSystem/
   - src/components/
   - src/hooks/
   - src/types/
   - src/pages/

Create basic App.tsx and index.css with Tailwind base styles.
"""
```

**What Antigravity Does:**
- Creates files automatically
- Runs terminal commands
- Generates artifacts showing what was created
- Provides verification in browser

### Step 2: Add Design System Files

**Prompt:**

```
Create the design system files in src/designSystem/:

1. colors.ts - Color palette (primary, secondary, neutral, semantic)
2. typography.ts - Font sizes, weights, text styles
3. spacing.ts - Spacing scale (xs, sm, md, lg, xl, 2xl, 3xl)
4. borderRadius.ts - Radius values
5. shadows.ts - Shadow levels
6. transitions.ts - Animation timing
7. sizes.ts - Component size variants
8. zIndex.ts - Stacking order
9. breakpoints.ts - Responsive breakpoints
10. variants.ts - Component variant definitions
11. accessibility.ts - WCAG AA compliance standards
12. index.ts - Export everything

Use the design system consistency guide provided.
Export all from index.ts for easy imports.
"""
```

---

## 3. Component Generation Workflow in Antigravity

### Workflow: Building a Complete Form System

#### Phase 1: Generate Base Components

**Task 1 - Create Atomic Components:**

```
In Antigravity Agent Manager, create new task:

Agent Task: "Generate Base Form Components"

Prompt:
"""
Generate 4 reusable form components with full TypeScript:

1. TextInput
   - Props: label, name, placeholder, error, disabled, type
   - Uses design system for spacing, colors, typography
   - Exported interface: TextInputProps
   - Semantic HTML with ARIA labels

2. Checkbox
   - Props: label, name, checked, onChange, disabled
   - Accessible with focus ring
   - Consistent with design system

3. Select
   - Props: label, name, options, value, onChange, disabled
   - Full keyboard navigation
   - Design system styling

4. Button
   - Props: label, onClick, variant, size, disabled, loading
   - Variants: primary, secondary, outline, danger
   - Sizes: sm, md, lg
   - Loading state with spinner

All components:
- Import from src/designSystem
- Use borderRadius.md, spacing scales
- Have textStyles applied
- Include accessible focus states with a11y.focusRing
- Export props interfaces
- No external dependencies (React only)
- Use React.memo for performance
"""

Agent will:
✓ Create TextInput.tsx
✓ Create Checkbox.tsx
✓ Create Select.tsx
✓ Create Button.tsx
✓ Save to src/components/
✓ Generate artifact showing created files
```

**Verify in Browser:**
- Agent opens browser
- Shows component previews
- Tests interactivity
- Records verification video

#### Phase 2: Compose into Form Component

**Task 2 - Create Form Container:**

```
Agent Task: "Build ContactForm Component"

Prompt:
"""
Create ContactForm component that composes the base components:

Requirements:
1. Form Fields:
   - name (TextInput, required)
   - email (TextInput, email validation)
   - message (TextInput with rows for textarea)
   - subscribe (Checkbox)

2. State Management:
   - useState for form data
   - useState for validation errors
   - useCallback for handlers

3. Validation:
   - Email format validation (regex)
   - Required field validation
   - Show error messages in TextInputs

4. Behavior:
   - Submit button submits form
   - Clear button resets form
   - Disable submit while loading
   - Show success/error message after submit

5. Design System:
   - Use spacing.md for form gaps
   - Use colors for validation states
   - Use transitions for animations
   - Full accessibility compliance

6. TypeScript:
   - Export interface ContactFormProps
   - Export type FormData
   - Type all callbacks

Return complete component with all types.
"""

Agent will:
✓ Create ContactForm.tsx
✓ Validate form logic
✓ Create types file
✓ Show form in browser
✓ Test all interactions
✓ Record browser test
```

#### Phase 3: Performance Optimization

**Task 3 - Optimize Components:**

```
Agent Task: "Optimize Form Components for Performance"

Prompt:
"""
Review ContactForm and base components for performance:

Optimization checklist:
1. Add React.memo to components
2. Use useCallback for all event handlers
3. Use useMemo for validation results
4. Check for unnecessary re-renders
5. Optimize dependency arrays
6. Remove any inline object/function literals in props

For each optimization:
- Explain why it reduces re-renders
- Show before/after code
- Provide performance impact

Use React DevTools Profiler to measure:
- Component render time
- Which components re-render
- How often they re-render
"""
```

#### Phase 4: Add Tests

**Task 4 - Generate Tests:**

```
Agent Task: "Create Jest + React Testing Library Tests"

Prompt:
"""
Create comprehensive tests for ContactForm:

1. Install dependencies: npm install -D @testing-library/react jest

2. Create tests for:
   - Render test: Component renders correctly
   - Validation: Shows errors for invalid input
   - Submission: Calls onSubmit with correct data
   - Clear: Clear button resets form
   - Accessibility: All labels linked to inputs
   - Keyboard: Tab navigation works

3. Test file: src/components/__tests__/ContactForm.test.tsx

4. Run tests and show results in artifact
"""

Agent will:
✓ Create test files
✓ Run tests
✓ Show test coverage
✓ Generate artifact with results
```

---

## 4. Multi-Agent Parallel Workflow

### Running Multiple Agents Simultaneously

In Antigravity's **Agent Manager**, set up parallel tasks:

```
Task Group: "Build Complete Product Page"

Task 1 (Agent A): Generate Hero, CTA, Feature components
Task 2 (Agent B): Build responsive grid layout
Task 3 (Agent C): Create component stories for Storybook
Task 4 (Agent D): Write unit tests for all components
Task 5 (Agent E): Optimize bundle size and performance

All agents work simultaneously!
Monitor progress in Agent Manager dashboard.
Agents coordinate and update each other on artifacts.
```

**Benefits:**
- Component building parallelized
- Testing happens as you code
- Performance optimization concurrent
- Documentation auto-generated
- Everything tracked in artifacts

---

## 5. Design System Enforcement in Antigravity

### System Prompt for Agents

Create a **System Prompt** that all agents follow:

```

# Design System Compliance Mandate

Every component generated MUST follow these rules:

## 1. Design System Imports
import {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  textStyles,
  shadows,
  transitions,
  a11y,
  buttonVariants,
  cardVariants,
} from '@/designSystem';

## 2. No Hardcoded Values
❌ backgroundColor: '#0066CC'
✅ backgroundColor: colors.primary

❌ padding: '16px'
✅ padding: spacing.md

❌ borderRadius: '8px'
✅ borderRadius: borderRadius.md

## 3. Component Patterns
- Functional components only
- TypeScript interfaces for props
- React.memo for optimization
- useCallback for handlers
- useMemo for computations
- Semantic HTML always
- ARIA labels everywhere
- Focus visible states

## 4. Exports
Every component must export:
- Component (default export)
- ComponentProps interface
- Any related types

## 5. Verification
Before completing:
- Component renders without errors
- Types compile without warnings
- Component works in browser
- Accessibility check passes
- Design tokens verified

## 6. Documentation
Include:
- JSDoc comments explaining complex logic
- Props interface documentation
- Usage examples in comments
```

---

## 6. Browser Testing Workflow

### How Antigravity Tests Your Components

1. **Auto-Serve**: Agent runs `npm run dev` automatically
2. **Browser Open**: Opens live preview in built-in browser
3. **Interaction**: Agent clicks, types, scrolls to test
4. **Recording**: Records video of test for verification
5. **Artifact**: Creates artifact with test results

### Test Prompt Example:

```
Agent Task: "Test Button Component"

Prompt:
"""
Test the Button component thoroughly:

1. Visual Test:
   - Button renders with label
   - Shows correct color for each variant (primary, secondary, outline, danger)
   - Correct size for each size prop (sm, md, lg)

2. Interaction Test:
   - Click handler fires on click
   - Shows loading state when loading=true
   - Button disabled when disabled=true
   - Hover state visual feedback

3. Keyboard Test:
   - Tab focus visible
   - Space/Enter fires click
   - Focus ring visible with a11y.focusRing

4. Responsive Test:
   - Works on mobile (320px)
   - Works on tablet (768px)
   - Works on desktop (1024px)

5. Accessibility Test:
   - Screen reader reads label
   - ARIA attributes correct
   - Color not only differentiator

Record video showing all tests.
Report any issues found.
"""
```

---

## 7. Iteration Workflow with Artifacts

### Getting Feedback and Iterating

1. **Agent generates artifact** (shows component code, browser screenshot)
2. **You review** the artifact (visual + code)
3. **You comment** on artifact (like Google Docs)
4. **Agent sees comment** and makes changes
5. **Agent re-tests** in browser
6. **New artifact** with improvements

### Example Iteration:

```
You: "The button padding looks too small for the primary variant"

Agent: (updates ButtonProps, adjusts padding)
        Shows new version in browser
        Creates artifact with updated code
        "Updated primary button padding from spacing.md to spacing.lg"

You: "Perfect! This looks much better"

Agent: Commits changes, ready for next phase
```

---

## 8. Complete Example: Building a Dashboard Page

### Agent Prompts in Sequence:

**Prompt 1 - Header Component:**
```
Create a Header component with:
- Logo area
- Navigation menu
- User profile dropdown
- Design system compliance
- Responsive mobile menu
```

**Prompt 2 - Card Component:**
```
Create a Card component for dashboard widgets:
- cardVariants from design system
- Accepts title, description, children
- Hover elevation with shadows
- Responsive grid layout
```

**Prompt 3 - Dashboard Layout:**
```
Create DashboardPage that:
- Uses Header component
- Has 3x3 grid of Card components
- Cards show statistics (users, revenue, growth)
- Responsive: 1 column on mobile, 2 on tablet, 3 on desktop
- Uses design system spacing and transitions
```

**Prompt 4 - Data Integration:**
```
Fetch data from Mock API:
- GET /api/stats returns { users, revenue, growth }
- Show loading states in Cards
- Error handling with error message
- Refetch button
```

**Prompt 5 - Testing & Performance:**
```
Final checks:
- All components tested in browser
- No console errors
- Performance optimized
- Accessibility verified
- Bundle size under 50KB
- Record final demo video
```

---

## 9. Antigravity Agent Best Practices

### ✅ Do's

1. **Break tasks into small pieces** - Each agent does one thing well
2. **Reference design system** - Always mention it in prompts
3. **Request verification** - Ask agent to test in browser
4. **Check artifacts** - Review generated code and screenshots
5. **Provide feedback** - Comment on artifacts for iteration
6. **Use Agent Manager** - Run parallel tasks for speed
7. **Save knowledge** - Agents learn from previous work

### ❌ Don'ts

1. **Don't give vague prompts** - Be specific about requirements
2. **Don't ignore artifacts** - They show what agent actually built
3. **Don't skip browser testing** - Verify visually, not just code
4. **Don't hardcode values** - Always use design system
5. **Don't create massive components** - Keep under 300 lines
6. **Don't forget types** - TypeScript prevents runtime errors

---

## 10. Project Structure for Antigravity

```
my-react-app/
├── src/
│   ├── designSystem/
│   │   ├── index.ts
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   ├── borderRadius.ts
│   │   ├── shadows.ts
│   │   ├── transitions.ts
│   │   ├── sizes.ts
│   │   ├── zIndex.ts
│   │   ├── breakpoints.ts
│   │   ├── variants.ts
│   │   └── accessibility.ts
│   ├── components/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Header.tsx
│   │   ├── Form.tsx
│   │   └── __tests__/
│   │       └── *.test.tsx
│   ├── hooks/
│   │   ├── useForm.ts
│   │   ├── useLocalStorage.ts
│   │   └── useResponsive.ts
│   ├── types/
│   │   └── index.ts
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Dashboard.tsx
│   │   └── NotFound.tsx
│   ├── App.tsx
│   └── index.css
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── package.json
```

---

## 11. Key Commands in Antigravity

| Task | Antigravity Command |
|------|-------------------|
| Start dev server | `npm run dev` |
| Build project | `npm run build` |
| Run tests | `npm test` |
| Type check | `tsc --noEmit` |
| Format code | `prettier --write .` |
| Lint | `eslint src/ --fix` |
| Check bundle | `npm run build && npm run preview` |

---

## 12. Real-World Workflow Example

### Building an E-Commerce Product Page in Antigravity

**Day 1 - Foundation:**

```
Morning Task 1 (Agent A): Design System + Base Components
- Generate colors, spacing, typography
- Create Button, Input, Select components
- Create Card component
- Time: ~30 minutes
- Agent Manager shows artifacts

Morning Task 2 (Agent B): Layout Components
- Create ProductImage carousel
- Create ProductDetails component
- Create ReviewSection component
- Time: ~20 minutes parallel with Task 1

Afternoon Task 3 (Agent C): Page Integration
- Create ProductPage component
- Wire up components together
- Add mock product data
- Time: ~15 minutes

Afternoon Task 4 (Agent D): Testing & Optimization
- Write tests for all components
- Optimize performance
- Test in browser
- Time: ~20 minutes parallel with Task 3

End of Day: Review artifacts, iterate based on feedback
```

**Day 2 - Polish:**

```
Task 5 (Agent E): Responsive Design
- Test on mobile, tablet, desktop
- Adjust for all breakpoints
- Create responsive component variants

Task 6 (Agent F): Accessibility
- Add ARIA labels
- Test keyboard navigation
- Verify color contrast
- WCAG 2.1 AA compliance

Task 7 (Agent G): Advanced Features
- Add to cart with animation
- Wishlist functionality
- Product filters
- Search integration

Task 8 (Agent H): Documentation
- Create Storybook stories
- Write component documentation
- Create usage examples
- Performance report

End of Day: Ship production-ready page
```

---

## 13. Measuring Success with Antigravity

### Metrics to Track:

| Metric | Target | Antigravity Advantage |
|--------|--------|----------------------|
| Components per day | 8-10 | Agents generate in parallel |
| Type safety | 100% | TypeScript enforced |
| Test coverage | >80% | Agents write tests |
| Accessibility | WCAG AA | Built into prompts |
| Design consistency | 100% | Design system enforced |
| Browser verified | 100% | Agents test visually |
| Bundle size | <100KB | Agents optimize |
| Development time | 50% reduction | Parallel agents |

---

## 14. Troubleshooting in Antigravity

### Issue: Agent generates inconsistent styling

**Solution:**
```
Provide agent with this system prompt update:

"Before generating any component, review src/designSystem/index.ts
and use ONLY imported design tokens. Never hardcode CSS values.
Verify all colors come from colors object, all spacing from
spacing scale, all sizes from sizes object."
```

### Issue: Components don't work in browser

**Solution:**
```
Request agent to:
1. Check browser console for errors
2. Run: npm run dev
3. Test component in localhost:5173
4. Record video showing the error
5. Fix issue and re-test
```

### Issue: TypeScript errors remain

**Solution:**
```
Ask agent to:
1. Run: tsc --noEmit
2. Fix all type errors
3. Verify all imports correct
4. Commit changes
```

---

## Summary: Antigravity + React TSX Workflow

✅ **Setup**: Create React + TS project with design system
✅ **Generate**: Agents create components following design system
✅ **Test**: Agents test in browser, provide video evidence
✅ **Iterate**: Review artifacts, provide feedback, agents refine
✅ **Optimize**: Performance, accessibility, bundle size
✅ **Deploy**: Production-ready components ready to ship

**Time Savings:**
- Building 10 components takes ~2 hours with agents
- Same task manually = 8-10 hours
- 5x productivity increase

**Quality Benefits:**
- 100% design system compliance
- Full TypeScript coverage
- Browser-verified functionality
- Tested and optimized

**Confidence:**
- Artifacts prove what was built
- Browser recordings show it works
- No surprises at review time

---

## Next Steps

1. Download Antigravity IDE
2. Create new React + TS project
3. Set up design system using provided guide
4. Create Agent Manager task: "Generate base components"
5. Review artifacts in browser
6. Iterate and refine
7. Ship production-ready UI!

**Welcome to the future of web development with Antigravity! 🚀**

