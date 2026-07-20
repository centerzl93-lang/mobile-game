import { Sex } from '../types';

// Village-flavoured given names, split by sex, for naming villagers. Kept deliberately simple
// and pastoral to match the setting. Add freely — `randomName` just picks from the matching pool.
export const MALE_NAMES: string[] = [
  'Alden', 'Bram', 'Cedric', 'Doran', 'Edmund', 'Finn', 'Garrick', 'Hurst',
  'Ivo', 'Jory', 'Kellan', 'Lowell', 'Merrick', 'Nolan', 'Osric', 'Perrin',
  'Quill', 'Rowan', 'Silas', 'Tobias', 'Ulric', 'Verne', 'Wystan', 'Yorick',
  'Aldous', 'Barrett', 'Corin', 'Dunstan', 'Emric', 'Fenwick', 'Godric', 'Harlan',
  'Leofric', 'Manfred', 'Osgar', 'Rennick', 'Selwin', 'Tomlin', 'Warin', 'Cuthbert',
];

export const FEMALE_NAMES: string[] = [
  'Alys', 'Bryony', 'Cora', 'Della', 'Edith', 'Fern', 'Gwen', 'Hazel',
  'Isolde', 'Junia', 'Kára', 'Lark', 'Maud', 'Nesta', 'Orla', 'Petra',
  'Quenna', 'Rowena', 'Sable', 'Thea', 'Ursa', 'Verity', 'Willa', 'Yvette',
  'Aldith', 'Beatrix', 'Clover', 'Dora', 'Elowen', 'Freya', 'Gisela', 'Helewise',
  'Linnet', 'Maren', 'Odile', 'Rosalind', 'Sibyl', 'Tamsin', 'Winifred', 'Bess',
];

/** A random given name appropriate to the villager's sex. */
export function randomName(sex: Sex): string {
  const pool = sex === 'm' ? MALE_NAMES : FEMALE_NAMES;
  return pool[(Math.random() * pool.length) | 0];
}
