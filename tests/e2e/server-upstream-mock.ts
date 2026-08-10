type Scenario = {
  title: string;
  address: string;
  contentTypeId: "12" | "14" | "15" | "28" | "32" | "38" | "39" | "75";
  petPolicy?: Record<string, string | null>;
  introPetPolicy?: Record<string, string>;
  petResponse?: "empty" | "unavailable";
  unknownHours?: boolean;
  imageUrl?: string;
};

type CatalogScenario = {
  contentId: string;
  title: string;
  address: string;
  contentTypeId: "12" | "14" | "15" | "28" | "32" | "38" | "39";
  districtCode: string;
  latitude: number;
  longitude: number;
  omitProviderContentTypeId?: boolean;
};

const catalogScenarios: CatalogScenario[] = [
  {
    contentId: "1001",
    title: "해운대 해수욕장",
    address: "부산광역시 해운대구 해운대해변로 264",
    contentTypeId: "12",
    districtCode: "350",
    latitude: 35.1596,
    longitude: 129.1603,
    omitProviderContentTypeId: true,
  },
  {
    contentId: "1101",
    title: "광복 전망대",
    address: "부산광역시 중구 중앙대로 1",
    contentTypeId: "12",
    districtCode: "110",
    latitude: 35.106,
    longitude: 129.032,
  },
  {
    contentId: "1102",
    title: "송도 바다길",
    address: "부산광역시 서구 송도해변로 1",
    contentTypeId: "12",
    districtCode: "140",
    latitude: 35.076,
    longitude: 129.017,
  },
  {
    contentId: "1103",
    title: "부산항 산책길",
    address: "부산광역시 동구 충장대로 1",
    contentTypeId: "12",
    districtCode: "170",
    latitude: 35.116,
    longitude: 129.045,
  },
  {
    contentId: "1104",
    title: "태종대 전망길",
    address: "부산광역시 영도구 전망로 1",
    contentTypeId: "12",
    districtCode: "200",
    latitude: 35.052,
    longitude: 129.087,
  },
  {
    contentId: "1105",
    title: "시민공원",
    address: "부산광역시 부산진구 시민공원로 1",
    contentTypeId: "12",
    districtCode: "230",
    latitude: 35.168,
    longitude: 129.057,
  },
  {
    contentId: "1106",
    title: "광안 해변길",
    address: "부산광역시 수영구 광안해변로 1",
    contentTypeId: "12",
    districtCode: "500",
    latitude: 35.153,
    longitude: 129.118,
  },
  {
    contentId: "1107",
    title: "희망 기장 전망대",
    address: "부산광역시 기장군 기장해안로 1",
    contentTypeId: "12",
    districtCode: "710",
    latitude: 35.244,
    longitude: 129.222,
  },
  {
    contentId: "1201",
    title: "부산 생활문화관",
    address: "부산광역시 부산진구 문화로 1",
    contentTypeId: "14",
    districtCode: "230",
    latitude: 35.162,
    longitude: 129.053,
  },
  {
    contentId: "1301",
    title: "수영 여름축제",
    address: "부산광역시 수영구 축제로 1",
    contentTypeId: "15",
    districtCode: "500",
    latitude: 35.155,
    longitude: 129.12,
  },
  {
    contentId: "1401",
    title: "영도 해양레저장",
    address: "부산광역시 영도구 해양로 1",
    contentTypeId: "28",
    districtCode: "200",
    latitude: 35.08,
    longitude: 129.07,
  },
  {
    contentId: "2001",
    title: "일광스테이 호텔",
    address: "부산광역시 해운대구 달맞이길 10",
    contentTypeId: "32",
    districtCode: "350",
    latitude: 35.16,
    longitude: 129.17,
  },
  {
    contentId: "1005",
    title: "부산 반려동물 식당",
    address: "부산광역시 해운대구 달맞이길 20",
    contentTypeId: "39",
    districtCode: "350",
    latitude: 35.166,
    longitude: 129.158,
  },
  {
    contentId: "1501",
    title: "부산 여행 편집숍",
    address: "부산광역시 부산진구 서면로 1",
    contentTypeId: "38",
    districtCode: "230",
    latitude: 35.157,
    longitude: 129.059,
  },
];

const scenarios: Record<string, Scenario> = {
  "1005": {
    title: "부산 반려동물 식당",
    address: "부산광역시 해운대구 달맞이길 20",
    contentTypeId: "39",
    petPolicy: {
      acmpyPsblCpam: "반려동물 동반 가능",
      acmpyNeedMtr: "이동장 사용 필수",
    },
    unknownHours: true,
  },
  "2001": {
    title: "라군스테이 호텔",
    address: "부산광역시 해운대구 달맞이길 10",
    contentTypeId: "32",
  },
  "2002": {
    title: "마린크라운 호텔",
    address: "부산광역시 해운대구 달맞이길 20",
    contentTypeId: "32",
  },
  "2003": {
    title: "솔바람 관광펜션",
    address: "부산광역시 해운대구 달맞이길 30",
    contentTypeId: "32",
  },
  "2004": {
    title: "코랄베이 호텔",
    address: "부산광역시 해운대구 달맞이길 40",
    contentTypeId: "32",
  },
  "2005": {
    title: "블루웨이브",
    address: "부산광역시 해운대구 달맞이길 50",
    contentTypeId: "32",
  },
  "2006": {
    title: "찾을수없는숙소",
    address: "부산광역시 해운대구 달맞이길 60",
    contentTypeId: "32",
  },
  "2007": {
    title: "파셜뷰 호텔",
    address: "부산광역시 해운대구 달맞이길 70",
    contentTypeId: "32",
  },
  "2008": {
    title: "폴트브레이크 호텔",
    address: "부산광역시 해운대구 달맞이길 80",
    contentTypeId: "32",
  },
  "2009": {
    title: "올드포트 호텔",
    address: "부산광역시 해운대구 달맞이길 90",
    contentTypeId: "32",
  },
  "2010": {
    title: "듀얼스테이트 호텔",
    address: "부산광역시 해운대구 달맞이길 100",
    contentTypeId: "32",
  },
  "2011": {
    title: "해운대 해수욕장",
    address: "부산광역시 해운대구 해운대해변로 264",
    contentTypeId: "12",
    petPolicy: { acmpyTypeCd: "전구역 동반가능" },
  },
  "2012": {
    title: "마린 테라스 식탁",
    address: "부산광역시 해운대구 달맞이길 110",
    contentTypeId: "39",
    petPolicy: { acmpyTypeCd: "전구역 동반가능" },
  },
  "3001": {
    title: "반려동물 전구역 관광지",
    address: "부산광역시 수영구 광안해변로 1",
    contentTypeId: "38",
    petPolicy: { acmpyTypeCd: "전구역 동반가능" },
  },
  "3002": {
    title: "소형견 동반 관광지",
    address: "부산광역시 수영구 광안해변로 2",
    contentTypeId: "38",
    petPolicy: { acmpyPsblCpam: "소형견만 가능" },
  },
  "3003": {
    title: "이동장 필수 관광지",
    address: "부산광역시 수영구 광안해변로 3",
    contentTypeId: "38",
    petPolicy: {
      acmpyPsblCpam: "반려동물 동반 가능",
      acmpyNeedMtr: "이동장 사용 필수",
    },
  },
  "3004": {
    title: "야외 동반 관광지",
    address: "부산광역시 수영구 광안해변로 4",
    contentTypeId: "38",
    petPolicy: { etcAcmpyInfo: "실내 동반 불가하지만 야외 동반 가능" },
  },
  "3005": {
    title: "반려동물 지정 객실",
    address: "부산광역시 수영구 광안해변로 5",
    contentTypeId: "32",
    petPolicy: { etcAcmpyInfo: "일부 지정 객실만 반려동물 동반 가능" },
  },
  "3006": {
    title: "반려동물 출입 제한 관광지",
    address: "부산광역시 수영구 광안해변로 6",
    contentTypeId: "38",
    petPolicy: { etcAcmpyInfo: "반려동물 동반 불가" },
  },
  "3007": {
    title: "반려동물 정보 미제공 관광지",
    address: "부산광역시 수영구 광안해변로 7",
    contentTypeId: "38",
    petResponse: "empty",
  },
  "3008": {
    title: "반려동물 문의 관광지",
    address: "부산광역시 수영구 광안해변로 8",
    contentTypeId: "38",
    petPolicy: { etcAcmpyInfo: "반려동물 동반 가능 여부는 전화 문의" },
  },
  "3009": {
    title: "반려동물 정책 상충 관광지",
    address: "부산광역시 수영구 광안해변로 9",
    contentTypeId: "38",
    petPolicy: {
      acmpyPsblCpam: "반려동물 동반 가능",
      etcAcmpyInfo: "반려동물 동반 불가",
    },
  },
  "3010": {
    title: "반려동물 원문 장애 관광지",
    address: "부산광역시 수영구 광안해변로 10",
    contentTypeId: "38",
    petResponse: "unavailable",
  },
  "3011": {
    title: "반려동물 보조 원문 관광지",
    address: "부산광역시 수영구 광안해변로 11",
    contentTypeId: "38",
    petResponse: "unavailable",
    introPetPolicy: { chkpetshopping: "반려동물 동반 가능" },
  },
  "3012": {
    title: "안전한 원문 관광지",
    address: "부산광역시 수영구 광안해변로 12",
    contentTypeId: "38",
    petPolicy: {
      etcAcmpyInfo:
        "<img src=x onerror=alert(1)>반려동물 동반 가능<br>목줄 착용 필수",
    },
  },
  "3013": {
    title: "지원 대상이 아닌 레거시 관광 기록",
    address: "부산광역시 수영구 광안해변로 13",
    contentTypeId: "75",
  },
  "3014": {
    title: "이미지 오류 관광지",
    address: "부산광역시 수영구 광안해변로 14",
    contentTypeId: "38",
    imageUrl: "https://tong.visitkorea.or.kr/broken-petpass-image.jpg",
    petPolicy: { acmpyTypeCd: "전구역 동반가능" },
  },
};

function envelope(
  items: Record<string, unknown>[],
  pagination: { numOfRows?: number; pageNo?: number; totalCount?: number } = {},
) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: {
        items: items.length > 0 ? { item: items } : {},
        numOfRows: pagination.numOfRows ?? 20,
        pageNo: pagination.pageNo ?? 1,
        totalCount: pagination.totalCount ?? items.length,
      },
    },
  };
}

function json(
  items: Record<string, unknown>[],
  status = 200,
  pagination?: { numOfRows?: number; pageNo?: number; totalCount?: number },
): Response {
  return Response.json(envelope(items, pagination), { status });
}

function tourismResponse(url: URL): Response {
  const operation = url.pathname.split("/").at(-1);
  const contentId = url.searchParams.get("contentId") ?? "2001";
  const catalogScenario = catalogScenarios.find(
    (candidate) => candidate.contentId === contentId,
  );
  const scenario =
    scenarios[contentId] ??
    (catalogScenario
      ? {
          title: catalogScenario.title,
          address: catalogScenario.address,
          contentTypeId: catalogScenario.contentTypeId,
          petPolicy: { etcAcmpyInfo: "반려동물 동반 가능" },
        }
      : scenarios["2001"]);
  if (operation === "areaBasedList2") {
    const contentTypeId = url.searchParams.get("contentTypeId");
    const districtCode = url.searchParams.get("lDongSignguCd");
    const pageNo = Number(url.searchParams.get("pageNo") ?? "1");
    const providerPageSize = 4;
    const matches = catalogScenarios.filter(
      (item) =>
        (!contentTypeId || item.contentTypeId === contentTypeId) &&
        (!districtCode || item.districtCode === districtCode),
    );
    const offset = (pageNo - 1) * providerPageSize;
    return json(
      matches.slice(offset, offset + providerPageSize).map((item) => ({
        contentid: item.contentId,
        ...(item.omitProviderContentTypeId
          ? {}
          : { contenttypeid: item.contentTypeId }),
        title: item.title,
        addr1: item.address,
        mapx: String(item.longitude),
        mapy: String(item.latitude),
        lDongRegnCd: "26",
        lDongSignguCd: item.districtCode,
        modifiedtime: "20260805000000",
      })),
      200,
      {
        numOfRows: providerPageSize,
        pageNo,
        totalCount: matches.length,
      },
    );
  }
  if (operation === "detailCommon2") {
    return json([
      {
        contentid: contentId,
        contenttypeid: scenario.contentTypeId,
        title: scenario.title,
        addr1: scenario.address,
        mapx: "129.16",
        mapy: "35.16",
        overview: "한국관광공사 숙박 상세 소개입니다.",
        firstimage: scenario.imageUrl,
        modifiedtime: "20260805000000",
      },
    ]);
  }
  if (operation === "detailIntro2") {
    return json([
      {
        contentid: contentId,
        contenttypeid: scenario.contentTypeId,
        checkintime: "15:00",
        checkouttime: "11:00",
        ...(scenario.unknownHours || scenario.contentTypeId === "32"
          ? {}
          : {
              usetime: "09:00-20:00",
              usetimeculture: "09:00-20:00",
              usetimeleports: "09:00-20:00",
              opentimefood: "09:00-20:00",
            }),
        parkinglodging: "주차 가능",
        ...scenario.introPetPolicy,
      },
    ]);
  }
  if (operation === "detailPetTour2") {
    if (scenario.petResponse === "unavailable") {
      return new Response("temporary", { status: 503 });
    }
    if (scenario.petResponse === "empty") return json([]);
    return json([
      {
        contentid: contentId,
        contenttypeid: scenario.contentTypeId,
        ...(scenario.petPolicy ?? { acmpyTypeCd: "제공 원문 확인 필요" }),
      },
    ]);
  }
  return json([], 404);
}

function parseDirectionsPoint(value: string | null): { x: number; y: number } {
  const [x, y] = (value ?? "").split(",").map(Number);
  return { x, y };
}

function directionsResponse(url: URL): Response {
  const origin = parseDirectionsPoint(url.searchParams.get("origin"));
  const destination = parseDirectionsPoint(url.searchParams.get("destination"));
  const waypoints = (url.searchParams.get("waypoints") ?? "")
    .split("|")
    .filter(Boolean)
    .map((value) => parseDirectionsPoint(value));
  const points = [origin, ...waypoints, destination];
  const sections = points.slice(1).map((point, index) => {
    const previous = points[index];
    const distance = Math.max(
      100,
      Math.round((Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)) * 100_000),
    );
    return {
      distance,
      duration: Math.max(60, Math.round(distance / 8)),
      roads: [
        {
          vertexes: [previous.x, previous.y, point.x, point.y],
        },
      ],
    };
  });
  return Response.json({
    routes: [
      {
        result_code: 0,
        summary: {
          distance: sections.reduce((total, section) => total + section.distance, 0),
          duration: sections.reduce((total, section) => total + section.duration, 0),
        },
        sections,
      },
    ],
  });
}

function kakaoLocalResponse(url: URL): Response {
  const query = url.searchParams.get("query") ?? "카페";
  const [west, south, east, north] = (
    url.searchParams.get("rect") ?? "129.05,35.1,129.15,35.2"
  )
    .split(",")
    .map(Number);
  const x = String((west + east) / 2);
  const y = String((south + north) / 2);
  const categoryGroupCode =
    url.searchParams.get("category_group_code") ?? "";
  const categoryName =
    categoryGroupCode === "CE7"
      ? "음식점 > 카페"
      : categoryGroupCode === "FD6"
        ? "음식점 > 한식"
        : categoryGroupCode === "AT4"
          ? "여행 > 관광,명소"
          : categoryGroupCode === "CT1"
            ? "문화,예술 > 문화시설"
            : categoryGroupCode === "AD5"
              ? "여행 > 숙박"
              : "여행 > 관광,명소 > 공원";
  const centerId = `${x}-${y}`.replace(/[^0-9]/gu, "");
  return Response.json({
    meta: { total_count: 2, pageable_count: 2, is_end: true },
    documents: [
      {
        id: "shared-kakao-place",
        place_name: `${query} 공통 결과`,
        category_name: categoryName,
        category_group_code: categoryGroupCode,
        phone: "051-000-0000",
        address_name: "부산광역시 수영구 광안동 1",
        road_address_name: "부산광역시 수영구 광안해변로 1",
        place_url: "https://place.map.kakao.com/shared-kakao-place",
        distance: "100",
        x,
        y,
      },
      {
        id: `center-${centerId}`,
        place_name: `${query} 지역 결과`,
        category_name: categoryName,
        category_group_code: categoryGroupCode,
        phone: "",
        address_name: "부산광역시 수영구 광안동 2",
        road_address_name: "부산광역시 수영구 광안해변로 2",
        place_url: `https://place.map.kakao.com/center-${centerId}`,
        distance: "250",
        x,
        y,
      },
    ],
  });
}

function licenseItem(
  dataset: string,
  businessName: string,
  address: string,
  options: {
    category?: string;
    subtype?: string;
    state?: "active" | "closed";
  } = {},
): Record<string, unknown> {
  const closed = options.state === "closed";
  return {
    MNG_NO: `${dataset}-${businessName}`,
    BPLC_NM: businessName,
    ROAD_NM_ADDR: address,
    ROAD_NM_ZIP: "48000",
    LCPMT_YMD: "20200101",
    SALS_STTS_NM: closed ? "폐업" : "영업",
    DTL_SALS_STTS_NM: closed ? "폐업" : "정상",
    CLSBIZ_YMD: closed ? "20250101" : null,
    SNTTN_BZSTAT_NM: options.category ?? null,
    TOUR_LDGBIZ_DTL_NM: options.subtype ?? null,
    DAT_UPDT_PNT: "20260805000000",
    KSRM_CNT: dataset === "lodgings" ? "24" : null,
    GSRM_CNT: dataset !== "lodgings" ? "24" : null,
    LCTN_AREA: dataset === "lodgings" ? "920.5" : null,
    ARCH_TFA: dataset !== "lodgings" ? "920.5" : null,
  };
}

function localDataResponse(url: URL): Response {
  const parts = url.pathname.split("/");
  const dataset = parts.at(-2) ?? "";
  const businessName = url.searchParams.get("cond[BPLC_NM::LIKE]") ?? "";
  const scenario = Object.values(scenarios).find(
    ({ title }) =>
      title === businessName ||
      title.replace(/\s*(호텔|관광펜션)$/u, "") === businessName,
  );

  if (scenario?.title === "폴트브레이크 호텔") {
    return new Response("temporary", { status: 503 });
  }
  if (
    scenario?.title === "파셜뷰 호텔" &&
    dataset === "tourist_accommodations"
  ) {
    return new Response("temporary", { status: 503 });
  }

  const items: Record<string, unknown>[] = [];
  if (scenario?.title === "라군스테이 호텔" && dataset === "lodgings") {
    items.push(
      licenseItem(dataset, scenario.title, scenario.address, {
        category: "숙박업(일반)",
      }),
    );
  }
  if (
    scenario?.title === "마린크라운 호텔" &&
    dataset === "tourist_accommodations"
  ) {
    items.push(
      licenseItem(dataset, scenario.title, scenario.address, {
        subtype: "관광호텔업",
      }),
    );
  }
  if (
    scenario?.title === "솔바람 관광펜션" &&
    dataset === "tourist_pensions"
  ) {
    items.push(licenseItem(dataset, scenario.title, scenario.address));
  }
  if (
    scenario?.title === "코랄베이 호텔" &&
    (dataset === "lodgings" || dataset === "tourist_accommodations")
  ) {
    items.push(
      licenseItem(dataset, scenario.title, scenario.address, {
        subtype: dataset === "tourist_accommodations" ? "관광호텔업" : undefined,
      }),
    );
  }
  if (scenario?.title === "블루웨이브" && dataset === "lodgings") {
    items.push(licenseItem(dataset, "블루웨이브호텔", scenario.address));
  }
  if (scenario?.title === "블루웨이브" && dataset === "tourist_pensions") {
    items.push(licenseItem(dataset, "블루웨이브펜션", scenario.address));
  }
  if (scenario?.title === "파셜뷰 호텔" && dataset === "lodgings") {
    items.push(licenseItem(dataset, scenario.title, scenario.address));
  }
  if (scenario?.title === "올드포트 호텔" && dataset === "lodgings") {
    items.push(
      licenseItem(dataset, scenario.title, scenario.address, { state: "closed" }),
    );
  }
  if (
    scenario?.title === "듀얼스테이트 호텔" &&
    (dataset === "lodgings" || dataset === "tourist_accommodations")
  ) {
    items.push(
      licenseItem(dataset, scenario.title, scenario.address, {
        state: dataset === "lodgings" ? "closed" : "active",
      }),
    );
  }
  if (
    scenario?.title === "마린 테라스 식탁" &&
    dataset === "general_restaurants"
  ) {
    items.push(
      licenseItem(dataset, scenario.title, scenario.address, {
        category: "일반음식점",
      }),
    );
  }
  return json(items);
}

export function installE2EUpstreamMock(): void {
  const state = globalThis as typeof globalThis & {
    __petPassOriginalFetch?: typeof fetch;
  };
  if (state.__petPassOriginalFetch) return;
  state.__petPassOriginalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (url.hostname === "apis.data.go.kr") {
      if (url.pathname.includes("/B551011/KorPetTourService2/")) {
        return Promise.resolve(tourismResponse(url));
      }
      if (url.pathname.includes("/1741000/")) {
        return Promise.resolve(localDataResponse(url));
      }
    }
    if (url.hostname === "apis-navi.kakaomobility.com") {
      return Promise.resolve(directionsResponse(url));
    }
    if (
      url.hostname === "tong.visitkorea.or.kr" &&
      url.pathname === "/broken-petpass-image.jpg"
    ) {
      return Promise.resolve(new Response("missing", { status: 404 }));
    }
    if (
      url.hostname === "dapi.kakao.com" &&
      url.pathname === "/v2/local/search/keyword.json"
    ) {
      return Promise.resolve(kakaoLocalResponse(url));
    }
    return state.__petPassOriginalFetch!(input, init);
  };
}
