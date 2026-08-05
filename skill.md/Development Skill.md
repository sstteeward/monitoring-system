# Monitoring System Development Skill

This skill provides guidance for developing and maintaining the monitoring system, which is a Supabase-based application with React/Vite frontend and comprehensive monitoring capabilities for educational institutions.

## System Overview

This monitoring system consists of:

### Backend (Supabase)

- PostgreSQL database with schemas for:
  - Companies (educational institutions)
  - Companies departments and staff
  - Students and guardians
  - Courses and classes
  - Attendance and timetables
  - Performance tracking and grades
  - Journals and documents
  - Messaging and notifications
  - Security alerts and audit logs
  - Feedback and announcements
  - Geofencing and location tracking
  - Equipment and inventory management
- Row Level Security (RLS) policies for data protection
- Stored procedures (RPC functions) for business logic
- Database functions for automated tasks

### Frontend (React/Vite)

- React 19 with TypeScript
- Vite build system
- React Router v7 for navigation
- React Leaflet for mapping features
- Supabase JS client for backend communication
- Various UI components for different user roles:
  - Admin dashboard and management views
  - Company/admin views for educational institutions
  - Coordinator views for department management
  - Teacher views for class management
  - Student and parent views
  - Authentication and onboarding flows

### Key Features

- User authentication and role-based access control
- Real-time data synchronization
- Attendance tracking with geofencing
- Performance monitoring and grading
- Communication tools (messaging, announcements)
- Resource and document management
- Security monitoring and alerts
- Schedule and timetable management
- Feedback and survey systems

## Common Development Tasks

### Database Operations

When working with Supabase database:

1. **Schema Changes**:
   - Create migration files following the pattern: `supabase_[description].sql`
   - Test migrations in development before applying to production
   - Follow existing patterns in the SQL files in the root directory
   - Ensure proper indexing for frequently queried columns
2. **RLS Policies**:
   - Review existing policies in `supabase_*_rls.sql` files
   - When adding new tables, create corresponding RLS policies
   - Test policies with different roles: anon, authenticated, service_role, and specific role contexts (admin, company, coordinator, teacher, student, parent)
   - Follow the principle of least privilege
3. **Stored Procedures (RPC)**:
   - Review existing functions in `supabase_*_rpc.sql` files
   - Follow naming conventions: `fn_` prefix for functions
   - Use SECURITY DEFINER when needed for elevated privileges
   - Validate inputs and handle errors appropriately
4. **Database Functions**:
   - Look for patterns in files like `supabase_security_alerts_rpc.sql`
   - Consider performance implications of triggers and functions

### Frontend Development

For frontend work in React/Vite/TypeScript:

1. **Component Development**:
   - Follow existing patterns in `src/components/`
   - Use functional components with hooks
   - Implement proper TypeScript typing
   - Follow naming conventions: `[Feature][ViewType].tsx` (e.g., `AdminDashboard.tsx`)
   - Separate concerns: UI components vs. container components
2. **State Management**:
   - Context API is used for global state (check `src/contexts/`)
   - React Query/SWR patterns may be used for server state
   - Local state with useState/useReducer for component state
   - Follow existing patterns for state updates and loading/error states
3. **Styling**:
   - CSS modules or CSS files alongside components (e.g., `AdminDashboard.css`)
   - Consistent naming conventions
   - Responsive design considerations
   - Follow existing styling patterns in the codebase
4. **API Integration**:
   - Use the Supabase client initialized in `src/lib/supabase.ts`
   - Follow established patterns for queries, mutations, and real-time subscriptions
   - Handle loading states, errors, and empty states appropriately
   - Use React Query or similar for complex data fetching if adopted
5. **Routing**:
   - Follow patterns in `src/App.tsx`
   - Protected routes for authenticated users
   - Role-based route protection
   - Nested routes for feature areas

### API/Backend Development (if extending Supabase)

If working on custom backend functionality:

1. **Edge Functions**:
   - Follow Supabase Edge Function patterns if implemented
   - Proper error handling and logging
2. **Webhooks**:
   - Follow existing patterns if webhooks are used
   - Secure webhook endpoints
   - Idempotency considerations

### Testing

1. **Unit Tests**:
   - Follow existing test patterns (check if testing framework is set up)
   - Test utility functions and helpers
   - Mock external dependencies (Supabase, APIs)
   - Test edge cases and error conditions
2. **Component Tests**:
   - Test rendering with different props
   - Test user interactions
   - Test conditional rendering
   - Mock API calls and context values
3. **Integration Tests**:
   - Test API endpoints if custom backend exists
   - Test database interactions
   - Test authentication flows

### Development Workflow

1. **Environment Setup**:
   - Copy `.env.example` to `.env` and fill in values
   - Install dependencies: `npm install`
   - Start development server: `npm run dev`
   - Ensure Supabase is running and accessible
2. **Development Practices**:
   - Create feature branches for new work
   - Make small, frequent commits with descriptive messages
   - Run linting: `npm run lint`
   - Type checking: `tsc --noEmit`
   - Test changes thoroughly before committing
3. **Database Development**:
   - Test migrations against a copy of production schema
   - Verify RLS policies work as expected
   - Check performance of new queries
4. **Frontend Development**:
   - Create reusable components when appropriate
   - Follow accessibility guidelines (WCAG)
   - Test responsive behavior
   - Validate forms and user inputs

### Code Quality Standards

1. **TypeScript**:
   - Use strict typing
   - Avoid `any` type when possible
   - Create interfaces/types for complex objects
   - Use utility types when appropriate
2. **Code Formatting**:
   - Follow existing code style (Prettier configured)
   - Consistent indentation (2 spaces)
   - Meaningful variable and function names
   - JSDoc comments for complex functions
3. **Error Handling**:
   - Try/catch blocks for async operations
   - Error boundaries for React components
   - User-friendly error messages
   - Logging for debugging (consider environment)
4. **Performance**:
   - Memoize expensive computations with useMemo/useCallback
   - Lazy load components when appropriate
   - Optimize database queries with proper indexing
   - Consider pagination for large datasets
5. **Security**:
   - Never hardcode secrets
   - Validate and sanitize user input
   - Use parameterized queries to prevent SQL injection
   - Implement proper authentication checks
   - Follow principle of least privilege for database access

### Project-Specific Considerations

#### Supabase Specific

- Understand the existing database schema by examining SQL files
- Learn the established patterns for RLS policies
- Follow naming conventions for tables, columns, and functions
- Use the Supabase client correctly for real-time subscriptions

#### React/Vite Specific

- Follow the existing file organization in `src/`
- Use React 19 features appropriately
- Leverage Vite's fast refresh during development
- Follow TypeScript best practices for React components

#### Educational Domain Specific

- Understand the data model for educational institutions
- Be familiar with common educational workflows (attendance, grading, scheduling)
- Consider privacy implications of student data
- Understand role-based access requirements for different user types

### Deployment Considerations

1. **Environment Variables**:
   - Never commit `.env` file
   - Use `.env.example` for sharing non-sensitive configuration
   - Verify required variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
   - Different environments may need different configurations
2. **Build Process**:
   - Run linting and type checking before building: `npm run lint && tsc --noEmit`
   - Build for production: `npm run build`
   - Preview production build: `npm run preview`
   - Check build output for errors
3. **Database Migrations**:
   - Apply migrations in correct order
   - Backup production data before major schema changes
   - Test migration scripts on staging first
   - Have rollback plans for critical changes

### Troubleshooting Guide

#### Database Issues

- **Connection Problems**: Check Supabase URL and keys in environment variables
- **RLS Issues**: Test queries as different roles in Supabase SQL editor
- **Performance**: Use EXPLAIN ANALYZE on slow queries, check for missing indexes
- **Migration Errors**: Verify SQL syntax, check dependencies between migrations

#### Frontend Issues

- **Rendering Problems**: Check browser console for errors and warnings
- **State Issues**: Use React DevTools to inspect component state and props
- **API Calls**: Verify network requests in browser dev tools
- **Type Errors**: Read TypeScript error messages carefully, check type definitions

#### Build/Deployment Issues

- **Dependency Conflicts**: Check package-lock.json, consider clearing node_modules
- **Environment Variables**: Verify all required vars are set in deployment environment
- **Build Size**: Use `vite build --mode` to analyze bundle size
- **Runtime Errors**: Check server logs, browser console, and error boundaries

### Getting Assistance

When encountering challenges:

1. Examine similar implementations in the codebase
2. Read error messages carefully - they often point directly to the issue
3. Consult Supabase and React documentation for specific technologies
4. Review recent commits that might have introduced the issue
5. Ask for clarification on requirements if unsure
6. Check the Supabase dashboard for real-time insights into database operations

### Security Guidelines

1. **Data Protection**:
   - PII (Personally Identifiable Information) must be protected per regulations
   - Use Supabase's built-in encryption for sensitive fields when needed
   - Never log sensitive data (passwords, personal identifiers)
2. **Access Control**:
   - Implement proper role-based access checks in both frontend and backend
   - Use Supabase auth helpers for user management
   - Regularly audit RLS policies
   - Implement proper session management
3. **Input Validation**:
   - Validate all inputs on both client and server sides
   - Use Supabase's parameterized queries or ORM methods to prevent SQL injection
   - Sanitize output to prevent XSS attacks, especially for user-generated content
   - Implement rate limiting for public endpoints if applicable
4. **Secure Communication**:
   - Ensure all Supabase connections use HTTPS
   - Keep dependencies updated to patch security vulnerabilities
   - Use environment-specific configurations to prevent leaking dev/test keys to prod

### Maintenance Practices

1. **Dependency Management**:
   - Regularly update dependencies: `npm update`
   - Audit for vulnerabilities: `npm audit`
   - Keep TypeScript and related tools current
   - Monitor for breaking changes in major version updates
2. **Code Health**:
   - Refactor technical debt regularly
   - Keep dependencies up to date
   - Monitor bundle size and performance
   - Update documentation when making significant changes
3. **Monitoring and Logging**:
   - Implement proper error logging (consider integrating with Supabase logging)
   - Monitor application performance metrics
   - Set up alerts for critical errors or performance degradation
   - Regularly review logs for anomalies
4. **Backup and Recovery**:
   - Ensure Supabase backup strategies are understood and monitored
   - Test recovery procedures periodically
   - Document rollback procedures for schema changes
   - Keep track of migration history
This skill provides a foundation for effective development work on this monitoring system. Practices should be adapted as needed based on specific requirements, team conventions, and evolving project needs.
