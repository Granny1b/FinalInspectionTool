import { customAlphabet } from 'nanoid';

/**
 * Alphanumeric only: IDs end up in blob paths (`templates/{id}/draft.json`) and in
 * Table Storage RowKeys (`{inspectionId}_{itemId}`), so we avoid `_` and `-`.
 * 16 chars of base62 ≈ 95 bits of entropy — plenty for this volume.
 */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const ID_LENGTH = 16;

export const newId: () => string = customAlphabet(ALPHABET, ID_LENGTH);

/** Accepts any id we generate, plus slightly looser legacy/hand-made ids (still path/RowKey safe). */
export const ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;
