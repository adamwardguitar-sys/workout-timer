import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { NumberField } from './NumberField';

function Harness(props: { initial: number | undefined; pad?: number; allowEmpty?: boolean }) {
  const [v, setV] = useState<number | undefined>(props.initial);
  return (
    <>
      <NumberField aria-label="Field" value={v} onChange={setV} pad={props.pad} allowEmpty={props.allowEmpty} />
      <output data-testid="out">{v === undefined ? 'none' : v}</output>
    </>
  );
}

describe('NumberField', () => {
  it('shows the value, zero-padded when asked', () => {
    render(<Harness initial={5} pad={2} />);
    expect(screen.getByLabelText('Field')).toHaveValue(5);
    expect((screen.getByLabelText('Field') as HTMLInputElement).value).toBe('05');
  });

  it('can be cleared while you type a new number, instead of snapping back to 0', async () => {
    const user = userEvent.setup();
    render(<Harness initial={40} />);
    const input = screen.getByLabelText('Field');
    await user.clear(input);
    expect(input).toHaveValue(null); // genuinely empty while editing
    expect(screen.getByTestId('out')).toHaveTextContent('0');
    await user.type(input, '45');
    expect(input).toHaveValue(45);
    expect(screen.getByTestId('out')).toHaveTextContent('45');
  });

  it('tidies the display when you leave the field', async () => {
    const user = userEvent.setup();
    render(<Harness initial={7} pad={2} />);
    const input = screen.getByLabelText('Field') as HTMLInputElement;
    await user.clear(input);
    await user.tab();
    expect(input.value).toBe('00');
  });

  it('reports undefined for an empty optional field', async () => {
    const user = userEvent.setup();
    render(<Harness initial={5} allowEmpty />);
    await user.clear(screen.getByLabelText('Field'));
    expect(screen.getByTestId('out')).toHaveTextContent('none');
  });

  it('rounds down and never reports a negative number', () => {
    render(<Harness initial={5} />);
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: '7.9' } });
    expect(screen.getByTestId('out')).toHaveTextContent('7');
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: '-3' } });
    expect(screen.getByTestId('out')).toHaveTextContent('0');
  });
});
