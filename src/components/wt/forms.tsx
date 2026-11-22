import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Labelled field wrapper. */
export function Field({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string | undefined;
  htmlFor?: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Native select styled to match inputs (accessible and mobile-friendly). */
export function NativeSelect({
  id,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  id?: string | undefined;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string | undefined;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Dialog with a trigger button and a form. `onSubmit` returns true to close.
 * Renders nothing when `allowed` is false (scoped actions).
 */
export function FormDialog({
  trigger,
  triggerVariant = "default",
  title,
  description,
  submitLabel = "Save",
  onSubmit,
  children,
  allowed = true,
  disabled,
  submitDisabled,
}: {
  trigger: ReactNode;
  triggerVariant?: ButtonProps["variant"] | undefined;
  title: string;
  description?: string | undefined;
  submitLabel?: string | undefined;
  onSubmit: () => Promise<boolean | undefined> | boolean | undefined;
  children: ReactNode;
  allowed?: boolean | undefined;
  disabled?: boolean | undefined;
  submitDisabled?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!allowed) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onSubmit();
    setBusy(false);
    if (ok) setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" disabled={disabled}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-4">{children}</div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || submitDisabled}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
  label?: string | undefined;
}) {
  const id = useId();
  return (
    <div className="relative w-full sm:max-w-xs">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
        aria-hidden
      />
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-card pl-8"
      />
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
    </div>
  );
}

/** Inline note explaining why an action is unavailable to this role. */
export function ScopeNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed bg-muted px-3 py-2 text-xs text-muted-foreground">
      {children}
    </p>
  );
}
