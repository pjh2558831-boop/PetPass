"use client";

import { useState, type MouseEvent } from "react";
import { hasRecentPhotoFailure, rememberPhotoFailure, retryPhoto } from "./photo-failure-cache";

type PhotoState = "missing" | "loading" | "loaded" | "failed";
function initialState(source: string | null): PhotoState {
  return !source ? "missing" : hasRecentPhotoFailure(source) ? "failed" : "loading";
}

export function usePlacePhotoState(source: string | null) {
  const [photo, setPhoto] = useState(() => ({ source, state: initialState(source) }));
  if (photo.source !== source) setPhoto({ source, state: initialState(source) });
  function update(state: PhotoState) {
    setPhoto((current) => current.source === source ? { source, state } : current);
  }
  return {
    state: photo.state,
    onLoad() {
      if (source) retryPhoto(source);
      update("loaded");
    },
    onError() {
      if (source) rememberPhotoFailure(source);
      update("failed");
    },
    retry(event: MouseEvent<HTMLButtonElement>) {
      event.preventDefault();
      event.stopPropagation();
      if (source) retryPhoto(source);
      update("loading");
    },
  };
}
