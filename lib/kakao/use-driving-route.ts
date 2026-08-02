"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createDirectionsRequest,
  getDirectionsRequestKey,
  loadDrivingRoute,
} from "@/lib/kakao/directions-client";
import type { KakaoMapLocation } from "@/lib/kakao/maps";
import type { KakaoDrivingRoute } from "@/types/kakao";

interface RouteState {
  key: string | null;
  route: KakaoDrivingRoute | null;
  error: string;
}

export function useDrivingRoute(locations: KakaoMapLocation[]) {
  const input = useMemo(() => {
    try {
      const request = createDirectionsRequest(locations);
      return {
        request,
        key: request ? getDirectionsRequestKey(request) : null,
        error: "",
      };
    } catch (error) {
      return {
        request: null,
        key: null,
        error:
          error instanceof Error
            ? error.message
            : "길찾기에 사용할 장소를 확인해 주세요.",
      };
    }
  }, [locations]);
  const [state, setState] = useState<RouteState>({
    key: null,
    route: null,
    error: "",
  });

  useEffect(() => {
    if (!input.request || !input.key) return;
    let active = true;
    loadDrivingRoute(input.request)
      .then((route) => {
        if (active) setState({ key: input.key, route, error: "" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          key: input.key,
          route: null,
          error:
            error instanceof Error
              ? error.message
              : "실시간 길찾기를 불러오지 못했습니다.",
        });
      });
    return () => {
      active = false;
    };
  }, [input.key, input.request]);

  if (input.error) {
    return { route: null, loading: false, error: input.error };
  }
  if (!input.key) {
    return { route: null, loading: false, error: "" };
  }
  if (state.key !== input.key) {
    return { route: null, loading: true, error: "" };
  }
  return { route: state.route, loading: false, error: state.error };
}
