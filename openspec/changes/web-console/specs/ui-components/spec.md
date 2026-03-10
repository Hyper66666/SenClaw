# UI Components Specification

## Overview

This specification defines the reusable UI components for the Senclaw Web Console. All components follow accessibility best practices, use Tailwind CSS for styling, and are built with TypeScript.

## Base Components (Radix UI Primitives)

### Button

**Purpose**: Clickable action trigger

**Variants**:
- `primary`: Solid background, high emphasis
- `secondary`: Outlined, medium emphasis
- `ghost`: No background, low emphasis
- `danger`: Red color scheme for destructive actions

**Props**:
```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}
```

**Implementation**:
```tsx
export function Button({
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  children,
  onClick,
}: ButtonProps) {
  const baseStyles = 'rounded font-medium transition-colors focus:outline-none focus:ring-2';
  const variantStyles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500',
    ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
}
```

---

### Card

**Purpose**: Container for related content

**Props**:
```typescript
interface CardProps {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}
```

**Implementation**:
```tsx
export function Card({ title, children, actions }: CardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      {title && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}
```

---

### Input

**Purpose**: Text input field

**Props**:
```typescript
interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  type?: 'text' | 'email' | 'password' | 'number';
}
```

**Implementation**:
```tsx
export function Input({
  label,
  placeholder,
  value,
  onChange,
  error,
  disabled,
  type = 'text',
}: InputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`
          px-3 py-2 border rounded-md
          focus:outline-none focus:ring-2 focus:ring-blue-500
          disabled:bg-gray-100 disabled:cursor-not-allowed
          ${error ? 'border-red-500' : 'border-gray-300'}
        `}
      />
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
```

---

### Textarea

**Purpose**: Multi-line text input

**Props**:
```typescript
interface TextareaProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  rows?: number;
}
```

---

### Select

**Purpose**: Dropdown selection

**Props**:
```typescript
interface SelectProps<T> {
  label?: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
}
```

---

### Badge

**Purpose**: Status indicator or label

**Props**:
```typescript
interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
}
```

---

## Domain Components

### AgentCard

**Purpose**: Display agent summary in list view

**Props**:
```typescript
interface AgentCardProps {
  agent: Agent;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}
```

**Layout**:
```
┌─────────────────────────────────────┐
│ Agent Name                    [...]  │ ← Dropdown menu (view, delete)
│ Provider: openai/gpt-4              │
│ Tools: echo, calculator (2)         │
│ Created: 2 hours ago                │
└─────────────────────────────────────┘
```

---

### RunStatusBadge

**Purpose**: Visual indicator for run status

**Props**:
```typescript
interface RunStatusBadgeProps {
  status: RunStatus;
}
```

**Styling**:
- `pending`: Gray background, gray text
- `running`: Blue background, blue text, animated pulse
- `completed`: Green background, green text, checkmark icon
- `failed`: Red background, red text, X icon

---

### MessageList

**Purpose**: Display conversation history for a run

**Props**:
```typescript
interface MessageListProps {
  messages: Message[];
}
```

**Message Rendering**:
- **System**: Gray background, italic text
- **User**: Blue background, left-aligned
- **Assistant**: White background, right-aligned
- **Tool**: Yellow background, monospace font for JSON

**Tool Call Rendering**:
```
┌─────────────────────────────────────┐
│ 🔧 Tool Call: calculator            │
│ Arguments:                          │
│ {                                   │
│   "operation": "add",               │
│   "a": 5,                           │
│   "b": 3                            │
│ }                                   │
│                                     │
│ Result: 8                           │
└─────────────────────────────────────┘
```

---

### HealthIndicator

**Purpose**: Show service health status

**Props**:
```typescript
interface HealthIndicatorProps {
  status: 'healthy' | 'degraded' | 'unhealthy';
  label: string;
  detail?: string;
}
```

**Visual**:
- `healthy`: Green dot + "Healthy"
- `degraded`: Yellow dot + "Degraded"
- `unhealthy`: Red dot + "Unhealthy"

---

### LoadingSpinner

**Purpose**: Indicate loading state

**Props**:
```typescript
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}
```

**Implementation**: CSS animation, no external dependencies

---

### ErrorMessage

**Purpose**: Display error state

**Props**:
```typescript
interface ErrorMessageProps {
  error: Error | string;
  retry?: () => void;
}
```

**Layout**:
```
┌─────────────────────────────────────┐
│ ⚠️ Error                            │
│ Failed to load agents               │
│ [Retry]                             │
└─────────────────────────────────────┘
```

---

### EmptyState

**Purpose**: Display when no data is available

**Props**:
```typescript
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}
```

---

## Layout Components

### AppLayout

**Purpose**: Root layout with navigation and content area

**Structure**:
```
┌─────────────────────────────────────┐
│ [Logo] Senclaw      [Health] [Dark] │ ← Header
├─────────────────────────────────────┤
│ Agents | Runs | Tasks               │ ← Navigation
├─────────────────────────────────────┤
│                                     │
│         Page Content                │
│                                     │
└─────────────────────────────────────┘
```

---

### PageHeader

**Purpose**: Page title and actions

**Props**:
```typescript
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}
```

---

## Accessibility Requirements

### Keyboard Navigation
- All interactive elements must be focusable
- Tab order follows visual order
- Enter/Space activates buttons
- Escape closes modals/dropdowns

### Screen Reader Support
- All images have `alt` text
- Icon buttons have `aria-label`
- Form inputs have associated `<label>`
- Status changes announced with `aria-live`

### Focus Management
- Visible focus indicator (2px blue outline)
- Focus trapped in modals
- Focus restored after modal close

### Color Contrast
- Text: 4.5:1 minimum (WCAG AA)
- Interactive elements: 3:1 minimum
- Test with Chrome DevTools Lighthouse

---

## Testing

### Unit Tests (Vitest + React Testing Library)

```typescript
describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when loading', () => {
    render(<Button loading>Click</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Visual Regression Tests (Future)
- Storybook + Chromatic for component snapshots
- Catch unintended style changes

---

## Implementation Checklist

- [ ] Set up Tailwind CSS with dark mode support
- [ ] Install Radix UI primitives (`@radix-ui/react-*`)
- [ ] Create base components (Button, Card, Input, Textarea, Select, Badge)
- [ ] Create domain components (AgentCard, RunStatusBadge, MessageList, HealthIndicator)
- [ ] Create utility components (LoadingSpinner, ErrorMessage, EmptyState)
- [ ] Create layout components (AppLayout, PageHeader)
- [ ] Add unit tests for all components
- [ ] Document component usage in Storybook (optional)
- [ ] Verify accessibility with axe-core
