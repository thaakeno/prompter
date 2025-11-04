import { useState, useEffect, Dispatch, SetStateAction, useCallback } from 'react';
import * as db from '../services/db';

type UseIndexedDBReturn<T> = [T, Dispatch<SetStateAction<T>>, boolean];

function useIndexedDB<T>(
  storeName: string,
  initialValue: T
): UseIndexedDBReturn<T> {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        if (Array.isArray(initialValue)) {
            const data = await db.getStoreData<any>(storeName);
            if (isMounted) {
                // Return initial value if DB is empty, otherwise return DB data
                setStoredValue((data.length > 0 ? data : initialValue) as unknown as T);
            }
        } else {
             const data = await db.getSingleObject<{key: string, value: T}>(storeName, 'user-settings');
             if(isMounted) {
                 setStoredValue(data ? data.value : initialValue);
             }
        }
      } catch (error) {
        console.error(`Error loading from IndexedDB store "${storeName}":`, error);
        if (isMounted) setStoredValue(initialValue);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadData();

    return () => { isMounted = false; };
  }, [storeName]);

  const setValue: Dispatch<SetStateAction<T>> = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      
      const saveData = async () => {
         try {
            if (Array.isArray(valueToStore)) {
                await db.setStoreData(storeName, valueToStore);
            } else {
                await db.setSingleObject(storeName, { key: 'user-settings', value: valueToStore });
            }
         } catch(error) {
             console.error(`Error saving to IndexedDB store "${storeName}":`, error);
         }
      };
      saveData();
    } catch (error) {
      console.error(error);
    }
  }, [storeName, storedValue]);

  return [storedValue, setValue, loading];
}

export default useIndexedDB;
