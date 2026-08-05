import {
  ACCOMMODATION_LICENSE_MATCH_LABELS,
  LICENSE_MATCH_LABELS,
  LICENSE_OPERATING_LABELS,
  REFINED_VENUE_LABELS,
} from "@/lib/shared/format";
import type {
  AccommodationEntityCandidate,
  LicensingMatchResult,
  LocalDataDataset,
  LocalDataLicenseRecord,
} from "@/types/license";

const DATASET_LABELS: Record<LocalDataDataset, string> = {
  general_restaurants: "일반음식점 인허가",
  rest_cafes: "휴게음식점 인허가",
  lodgings: "숙박업 인허가",
  tourist_accommodations: "관광숙박업 등록",
  tourist_pensions: "관광펜션업 등록",
};

function RecordDetails({ record }: { record: LocalDataLicenseRecord }) {
  const address = record.roadAddress ?? record.parcelAddress;
  return (
    <div className="mt-4 rounded-2xl border border-[#dce6df] bg-[#fbfdfb] p-4">
      <p className="text-sm font-black text-[#315b48]">
        {DATASET_LABELS[record.dataset]}
      </p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {[
          ["업소명", record.businessName],
          ["주소", address],
          ["인허가·등록일", record.licensingDate],
          ["인허가 업종", record.businessCategory],
          ["업태·세부 유형", record.businessSubtype],
          ["객실 수", record.roomCount],
          ["시설 면적", record.facilityArea],
          ["기록된 영업 상태", LICENSE_OPERATING_LABELS[record.operatingState]],
          ["폐업일", record.closureDate],
          ["휴업·정지 시작일", record.suspensionStartDate],
          ["휴업·정지 종료일", record.suspensionEndDate],
          ["영업 재개일", record.reopeningDate],
          ["제공처 갱신 시각", record.providerUpdatedAt],
        ].map(([label, value]) =>
          value ? (
            <div
              key={label}
              className="rounded-2xl border border-[#dce6df] bg-white p-4"
            >
              <dt className="text-xs font-extrabold text-[#607269]">{label}</dt>
              <dd className="mt-2 whitespace-pre-line font-semibold leading-6 text-[#344a40]">
                {value}
              </dd>
            </div>
          ) : null,
        )}
      </dl>
    </div>
  );
}

function AccommodationAlternative({
  candidate,
}: {
  candidate: AccommodationEntityCandidate;
}) {
  return (
    <li className="rounded-2xl border border-[#dce6df] bg-white p-4 text-sm">
      <p className="font-extrabold">
        {candidate.identity.businessName ?? "업소명 미제공"}
      </p>
      <p className="mt-1 text-[#64736b]">
        {candidate.identity.address ?? "주소 미제공"}
      </p>
      <p className="mt-2 text-xs font-bold text-[#607269]">
        {candidate.records
          .map(({ record }) => DATASET_LABELS[record.dataset])
          .join(" · ")}
      </p>
    </li>
  );
}

export function LicenseInformationPanel({
  licensing,
}: {
  licensing: LicensingMatchResult | undefined;
}) {
  if (!licensing || licensing.matchState === "not_applicable") return null;

  const accommodation = licensing.licensingKind === "accommodation";
  const selectedRecords = accommodation
    ? licensing.selectedRecords
    : licensing.selectedRecord
      ? [licensing.selectedRecord]
      : [];
  const hasHistoricalState = selectedRecords.some(
    (record) =>
      record.operatingState === "closed" ||
      record.operatingState === "suspended",
  );
  const label = accommodation
    ? ACCOMMODATION_LICENSE_MATCH_LABELS[licensing.matchState]
    : LICENSE_MATCH_LABELS[licensing.matchState];

  return (
    <section
      className="surface-card p-5 sm:p-6"
      aria-labelledby="license-heading"
    >
      <p className="eyebrow">PUBLIC LICENSE DATA</p>
      <h2
        id="license-heading"
        className="mt-2 text-xl font-black tracking-[-0.03em]"
      >
        인허가 정보
      </h2>
      <p className="mt-3 rounded-2xl bg-[#f3f8f4] p-4 text-sm font-extrabold leading-6 text-[#315b48]">
        {label}
      </p>

      {licensing.matchState === "not_found" ? (
        <p className="mt-3 text-sm font-semibold leading-6 text-[#6a5547]">
          {accommodation
            ? "일치 기록이 검색되지 않았다는 의미이며, 무허가 숙박시설이라는 뜻은 아닙니다."
            : "일치 기록이 검색되지 않았다는 의미이며, 무허가 업소라는 뜻은 아닙니다."}
        </p>
      ) : null}

      {licensing.refinedVenueKind ? (
        <p className="mt-4 text-sm font-bold text-[#405b4e]">
          확인된 세부 유형: {REFINED_VENUE_LABELS[licensing.refinedVenueKind]}
        </p>
      ) : null}

      {accommodation && selectedRecords.length > 1 ? (
        <p className="mt-4 rounded-2xl bg-[#eef7ff] p-4 text-sm font-extrabold leading-6 text-[#31546b]">
          동일 시설에 대한 복수 인허가 기록이 확인되었습니다
        </p>
      ) : null}

      {selectedRecords.map((record) => (
        <RecordDetails
          key={`${record.dataset}:${record.sourceEvidence.managementNumber ?? record.businessName}`}
          record={record}
        />
      ))}

      {accommodation && licensing.operatingStateDiscrepancy ? (
        <p className="mt-4 rounded-2xl bg-[#fff3e8] p-4 text-sm font-extrabold leading-6 text-[#765138]">
          데이터별 영업상태가 달라 현재 상태 확인이 필요합니다
        </p>
      ) : null}

      {hasHistoricalState ? (
        <p className="mt-4 rounded-2xl bg-[#fff8f1] p-4 text-sm font-semibold leading-6 text-[#6a5547]">
          공공데이터에는 폐업 또는 영업 중단 상태로 기록되어 있습니다. 과거 기록일 수 있으므로 현재 영업 정보는 별도 확인이 필요합니다.
        </p>
      ) : null}

      {licensing.matchState === "ambiguous" ? (
        <div className="mt-4">
          <p className="text-sm font-bold text-[#52665b]">
            아래 후보 중 하나를 확정하지 않았습니다. 수동 확인이 필요합니다.
          </p>
          <ul className="mt-3 space-y-3">
            {accommodation
              ? licensing.alternatives.map((candidate) => (
                  <AccommodationAlternative
                    key={`${candidate.identity.businessName}:${candidate.identity.address}`}
                    candidate={candidate}
                  />
                ))
              : licensing.alternatives.map((candidate) => (
                  <li
                    key={`${candidate.record.dataset}:${candidate.record.sourceEvidence.managementNumber ?? candidate.record.businessName}`}
                    className="rounded-2xl border border-[#dce6df] bg-white p-4 text-sm"
                  >
                    <p className="font-extrabold">
                      {candidate.record.businessName ?? "업소명 미제공"}
                    </p>
                    <p className="mt-1 text-[#64736b]">
                      {candidate.record.roadAddress ??
                        candidate.record.parcelAddress ??
                        "주소 미제공"}
                    </p>
                  </li>
                ))}
          </ul>
        </div>
      ) : null}

      {licensing.reasons.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs leading-5 text-[#64736b]">
          {licensing.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {licensing.sources.length > 0 ? (
        <div className="mt-5 border-t border-[#dce6df] pt-4 text-xs leading-6 text-[#6b7972]">
          <p>제공처: Ministry of the Interior and Safety</p>
          <p>
            데이터셋: {licensing.sources.map((source) => source.dataset).join(" · ")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
