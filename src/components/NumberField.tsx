import { useState } from 'react';

interface Props {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  'aria-label': string;
  /** Left-pad the shown number with zeros, e.g. 2 for seconds. */
  pad?: number;
  /** Report undefined for an empty box instead of 0. */
  allowEmpty?: boolean;
  min?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  inputMode?: 'numeric' | 'decimal';
  /** Allow decimals (e.g. weights). */
  decimal?: boolean;
}

/**
 * A number box you can actually clear while typing. It keeps what you are typing until you
 * leave the field, and reports a whole, non-negative number (or a decimal if `decimal`).
 */
export function NumberField(props: Props) {
  const { value, onChange, pad = 0, allowEmpty = false, decimal = false, ...rest } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(value).padStart(pad, '0'));

  return (
    <input
      type="number"
      inputMode={decimal ? 'decimal' : 'numeric'}
      step={decimal ? 'any' : undefined}
      {...rest}
      value={shown}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        if (text === '') {
          onChange(allowEmpty ? undefined : 0);
          return;
        }
        const n = Number(text);
        if (!Number.isFinite(n)) return;
        onChange(decimal ? Math.max(0, n) : Math.max(0, Math.floor(n)));
      }}
    />
  );
}
