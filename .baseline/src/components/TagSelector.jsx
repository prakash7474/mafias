import { useCallback, useMemo } from 'react';
import { TAG_CONFIG } from './RegistrationForm.jsx';

const TAG_ORDER = ['red', 'brown', 'orange'];

export const useTagConfig = () => {
  const values = useMemo(
    () => TAG_ORDER.map((id) => ({ id, ...TAG_CONFIG[id] })),
    []
  );

  const byId = useMemo(
    () => Object.fromEntries(TAG_ORDER.map((id) => [id, TAG_CONFIG[id]])),
    []
  );

  const findById = useCallback(
    (id) => (id && byId[id] ? byId[id] : null),
    [byId]
  );

  return { values, byId, findById, order: TAG_ORDER };
};
