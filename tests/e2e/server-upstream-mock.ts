type Scenario = {
  title: string;
  address: string;
  contentTypeId: "80" | "82" | "76";
  petPolicy?: Record<string, string | null>;
  introPetPolicy?: Record<string, string>;
  petResponse?: "empty" | "unavailable";
};

const scenarios: Record<string, Scenario> = {
  "2001": {
    title: "라군스테이 호텔",
    address: "부산광역시 해운대구 달맞이길 10",
    contentTypeId: "80",
  },
  "2002": {
    title: "마린크라운 호텔",
    address: "부산광역시 해운대구 달맞이길 20",
    contentTypeId: "80",
  },
  "2003": {
    title: "솔바람 관광펜션",
    address: "부산광역시 해운대구 달맞이길 30",
    contentTypeId: "80",
  },
  "2004": {
    title: "코랄베이 호텔",
    address: "부산광역시 해운대구 달맞이길 40",
    contentTypeId: "80",
  },
  "2005": {
    title: "블루웨이브",
    address: "부산광역시 해운대구 달맞이길 50",
    contentTypeId: "80",
  },
  "2006": {
    title: "찾을수없는숙소",
    address: "부산광역시 해운대구 달맞이길 60",
    contentTypeId: "80",
  },
  "2007": {
    title: "파셜뷰 호텔",
    address: "부산광역시 해운대구 달맞이길 70",
    contentTypeId: "80",
  },
  "2008": {
    title: "폴트브레이크 호텔",
    address: "부산광역시 해운대구 달맞이길 80",
    contentTypeId: "80",
  },
  "2009": {
    title: "올드포트 호텔",
    address: "부산광역시 해운대구 달맞이길 90",
    contentTypeId: "80",
  },
  "2010": {
    title: "듀얼스테이트 호텔",
    address: "부산광역시 해운대구 달맞이길 100",
    contentTypeId: "80",
  },
  "2011": {
    title: "해운대 해수욕장",
    address: "부산광역시 해운대구 해운대해변로 264",
    contentTypeId: "76",
    petPolicy: { acmpyTypeCd: "전구역 동반가능" },
  },
  "2012": {
    title: "마린 테라스 식탁",
    address: "부산광역시 해운대구 달맞이길 110",
    contentTypeId: "82",
    petPolicy: { acmpyTypeCd: "전구역 동반가능" },
  },
  "3001": {
    title: "반려동물 전구역 관광지",
    address: "부산광역시 수영구 광안해변로 1",
    contentTypeId: "76",
    petPolicy: { acmpyTypeCd: "전구역 동반가능" },
  },
  "3002": {
    title: "소형견 동반 관광지",
    address: "부산광역시 수영구 광안해변로 2",
    contentTypeId: "76",
    petPolicy: { acmpyPsblCpam: "소형견만 가능" },
  },
  "3003": {
    title: "이동장 필수 관광지",
    address: "부산광역시 수영구 광안해변로 3",
    contentTypeId: "76",
    petPolicy: {
      acmpyPsblCpam: "반려동물 동반 가능",
      acmpyNeedMtr: "이동장 사용 필수",
    },
  },
  "3004": {
    title: "야외 동반 관광지",
    address: "부산광역시 수영구 광안해변로 4",
    contentTypeId: "76",
    petPolicy: { etcAcmpyInfo: "실내 동반 불가하지만 야외 동반 가능" },
  },
  "3005": {
    title: "반려동물 지정 객실",
    address: "부산광역시 수영구 광안해변로 5",
    contentTypeId: "80",
    petPolicy: { etcAcmpyInfo: "일부 지정 객실만 반려동물 동반 가능" },
  },
  "3006": {
    title: "반려동물 출입 제한 관광지",
    address: "부산광역시 수영구 광안해변로 6",
    contentTypeId: "76",
    petPolicy: { etcAcmpyInfo: "반려동물 동반 불가" },
  },
  "3007": {
    title: "반려동물 정보 미제공 관광지",
    address: "부산광역시 수영구 광안해변로 7",
    contentTypeId: "76",
    petResponse: "empty",
  },
  "3008": {
    title: "반려동물 문의 관광지",
    address: "부산광역시 수영구 광안해변로 8",
    contentTypeId: "76",
    petPolicy: { etcAcmpyInfo: "반려동물 동반 가능 여부는 전화 문의" },
  },
  "3009": {
    title: "반려동물 정책 상충 관광지",
    address: "부산광역시 수영구 광안해변로 9",
    contentTypeId: "76",
    petPolicy: {
      acmpyPsblCpam: "반려동물 동반 가능",
      etcAcmpyInfo: "반려동물 동반 불가",
    },
  },
  "3010": {
    title: "반려동물 원문 장애 관광지",
    address: "부산광역시 수영구 광안해변로 10",
    contentTypeId: "76",
    petResponse: "unavailable",
  },
  "3011": {
    title: "반려동물 보조 원문 관광지",
    address: "부산광역시 수영구 광안해변로 11",
    contentTypeId: "76",
    petResponse: "unavailable",
    introPetPolicy: { chkpet: "반려동물 동반 가능" },
  },
  "3012": {
    title: "안전한 원문 관광지",
    address: "부산광역시 수영구 광안해변로 12",
    contentTypeId: "76",
    petPolicy: {
      etcAcmpyInfo:
        "<img src=x onerror=alert(1)>반려동물 동반 가능<br>목줄 착용 필수",
    },
  },
};

function envelope(items: Record<string, unknown>[]) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: {
        items: items.length > 0 ? { item: items } : {},
        numOfRows: 20,
        pageNo: 1,
        totalCount: items.length,
      },
    },
  };
}

function json(items: Record<string, unknown>[], status = 200): Response {
  return Response.json(envelope(items), { status });
}

function tourismResponse(url: URL): Response {
  const operation = url.pathname.split("/").at(-1);
  const contentId = url.searchParams.get("contentId") ?? "2001";
  const scenario = scenarios[contentId] ?? scenarios["2001"];
  if (operation === "areaBasedList2") {
    return json(
      Object.entries(scenarios)
        .filter(([, item]) => item.contentTypeId === "80")
        .slice(0, 5)
        .map(([id, item]) => ({
          contentid: id,
          contenttypeid: item.contentTypeId,
          title: item.title,
          addr1: item.address,
          mapx: "129.16",
          mapy: "35.16",
          modifiedtime: "20260805000000",
        })),
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
    return state.__petPassOriginalFetch!(input, init);
  };
}
