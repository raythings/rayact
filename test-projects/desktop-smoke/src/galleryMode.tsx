import React from 'react';

export const GalleryModeContext = React.createContext<{
  gallery: boolean;
  setGallery: (enabled: boolean) => void;
}>({
  gallery: false,
  setGallery: () => {},
});

export function useGalleryMode() {
  return React.useContext(GalleryModeContext);
}
