'use client';

import { useState, useEffect } from 'react';

interface List {
  id: number;
  name: string;
}

interface UseListsReturn {
  lists: List[];
  isLoading: boolean;
  mutate: () => void;
}

export function useLists(): UseListsReturn {
  const [lists, setLists] = useState<List[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading lists
    const loadLists = async () => {
      setIsLoading(true);
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setLists([
        { id: 1, name: 'Sample List 1' },
        { id: 2, name: 'Sample List 2' },
      ]);
      setIsLoading(false);
    };

    loadLists();
  }, []);

  const mutate = () => {
    // Refresh lists
    setIsLoading(true);
    setTimeout(() => {
      setLists([
        { id: 1, name: 'Sample List 1' },
        { id: 2, name: 'Sample List 2' },
      ]);
      setIsLoading(false);
    }, 500);
  };

  return {
    lists,
    isLoading,
    mutate,
  };
}

export async function deleteList(listId: number): Promise<void> {
  // TODO: Replace with actual API call
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('Deleted list:', listId);
}
