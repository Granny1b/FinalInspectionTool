import { offListLabel, offListValue } from './choices';

type Props = {
  /** The settings' list (responsibles or deviation categories). */
  list: readonly string[];
  /** The stored value; '' for none. */
  value: string;
  /** The text of the empty choice. */
  empty: string;
  /** For each option: a select whose own text is hidden must not hide its open list too. */
  optionClassName?: string;
};

/** The options of a Responsible or category select: none, a value off the list, then the list. */
export function ChoiceOptions({ list, value, empty, optionClassName }: Props) {
  const offList = offListValue(list, value);
  return (
    <>
      <option value="" className={optionClassName}>
        {empty}
      </option>
      {offList !== null && (
        <option value={offList} className={optionClassName}>
          {offListLabel(offList)}
        </option>
      )}
      {list.map((entry) => (
        <option key={entry} value={entry} className={optionClassName}>
          {entry}
        </option>
      ))}
    </>
  );
}
