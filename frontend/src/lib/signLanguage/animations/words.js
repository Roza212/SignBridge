// Barrel export — each word is a sign function (ref) => void. The animator
// looks them up by the uppercased word; anything not found falls through to
// letter-by-letter fingerspelling.
export { HOME }   from './Words/HOME';
export { PERSON } from './Words/PERSON';
export { TIME }   from './Words/TIME';
export { YOU }    from './Words/YOU';

// Common spelling aliases — map to the same underlying sign.
export { PERSON as PEOPLE } from './Words/PERSON';
export { YOU    as YOUR }   from './Words/YOU';
