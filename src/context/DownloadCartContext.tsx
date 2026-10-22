import { useUser } from '@app/hooks/useUser';
import type { DownloadCartItem } from '@server/interfaces/api/downloadInterfaces';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

export type NewCartItem = DownloadCartItem & {
  title: string;
  subtitle?: string;
  posterPath?: string;
};

export type CartItem = NewCartItem & { key: string };

interface DownloadCartContextProps {
  items: CartItem[];
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  addItem: (item: NewCartItem) => void;
  removeItem: (key: string) => void;
  hasItem: (item: DownloadCartItem) => boolean;
  clear: () => void;
}

export const getCartItemKey = (item: DownloadCartItem): string => {
  switch (item.type) {
    case 'movie':
      return `movie-${item.mediaId}`;
    case 'season':
      return `season-${item.mediaId}-${item.seasonNumber}`;
    case 'episode':
      return `episode-${item.mediaId}-${item.seasonNumber}-${item.episodeNumber}`;
  }
};

export const DownloadCartContext =
  React.createContext<DownloadCartContextProps>({
    items: [],
    isOpen: false,
    setOpen: () => undefined,
    addItem: () => undefined,
    removeItem: () => undefined,
    hasItem: () => false,
    clear: () => undefined,
  });

export const DownloadCartProvider = ({
  children,
}: {
  children?: React.ReactNode;
}) => {
  const { user } = useUser();
  const storageKey = user ? `download-cart-${user.id}` : undefined;
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string>();

  // Restore the cart of the current user from local storage
  useEffect(() => {
    if (!storageKey) {
      return;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      setItems(stored ? JSON.parse(stored) : []);
    } catch (e) {
      setItems([]);
    }

    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (e) {
      // Local storage is unavailable, the cart only lives in memory
    }
  }, [items, storageKey, loadedKey]);

  const addItem = useCallback((item: NewCartItem) => {
    const key = getCartItemKey(item);

    setItems((current) => {
      if (current.find((i) => i.key === key)) {
        return current;
      }

      // A season includes its episodes, so drop them from the cart
      const filtered =
        item.type === 'season'
          ? current.filter(
              (i) =>
                !(
                  i.type === 'episode' &&
                  i.mediaId === item.mediaId &&
                  i.seasonNumber === item.seasonNumber
                )
            )
          : current;

      return [...filtered, { ...item, key }];
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((current) => current.filter((i) => i.key !== key));
  }, []);

  const hasItem = useCallback(
    (item: DownloadCartItem) => {
      const key = getCartItemKey(item);

      return !!items.find(
        (i) =>
          i.key === key ||
          (item.type === 'episode' &&
            i.type === 'season' &&
            i.mediaId === item.mediaId &&
            i.seasonNumber === item.seasonNumber)
      );
    },
    [items]
  );

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, isOpen, setOpen, addItem, removeItem, hasItem, clear }),
    [items, isOpen, addItem, removeItem, hasItem, clear]
  );

  return (
    <DownloadCartContext.Provider value={value}>
      {children}
    </DownloadCartContext.Provider>
  );
};
