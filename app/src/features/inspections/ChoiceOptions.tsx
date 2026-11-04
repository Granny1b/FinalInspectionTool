import { offListLabel, offListValues } from './choices';

type Props = {
  /** The settings' list (responsibles or deviation categories). */
  list: readonly string[];
  /** The stored value; '' for none. */
  value: string;
  /** The value when the field was first shown: still offered after another was picked. */
  initial: string | undefined;
  /** The text of the empty choice. */
  empty: string;
  /** For each option: a select whose own text is hidden must not hide its open list too. */
  optionClassName?: string;
};

/** The options of a Responsible or category select: none, values off the list, then the list. */
export function ChoiceOptions({ list, value, initial, empty, optionClassName }: Props) {
  return (
    <>
      <option value="" className={optionClassName}>
        {empty}
      </option>
      {offListValues(list, [initial, value]).map((offList) => (
        <option key={`off:${offList}`} value={offList} className={optionClassName}>
          {offListLabel(offList)}
        </option>
      ))}
      {list.map((entry) => (
        <option key={entry} value={entry} className={optionClassName}>
          {entry}
        </option>
      ))}
    </>
  );
}
