import type { WeightUnit } from '../store/history';
import { NumberField } from './NumberField';

interface Props {
  exercises: string[];
  values: Record<string, number | undefined>;
  unit: WeightUnit;
  onChange: (exercise: string, value: number | undefined) => void;
  onFillAll: (value: number) => void;
}

/** One weight box per tracked exercise. Leave a box empty for "not logged". */
export function WeightFields({ exercises, values, unit, onChange, onFillAll }: Props) {
  const first = exercises.map((e) => values[e]).find((v) => v !== undefined && v > 0);
  return (
    <div className="weight-fields">
      {exercises.map((ex) => (
        <label key={ex} className="weight-row">
          <span className="weight-name">{ex}</span>
          <NumberField
            decimal
            allowEmpty
            min={0}
            aria-label={`Weight for ${ex}`}
            placeholder="–"
            value={values[ex]}
            onChange={(v) => onChange(ex, v)}
          />
          <span className="muted">{unit}</span>
        </label>
      ))}
      {exercises.length > 1 && first !== undefined && (
        <button type="button" className="btn ghost small" onClick={() => onFillAll(first)}>
          Use {first} {unit} for all
        </button>
      )}
    </div>
  );
}
