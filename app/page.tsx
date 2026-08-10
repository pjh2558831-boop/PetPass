import {
  ArrowRight,
  Backpack,
  CalendarDays,
  Check,
  CircleHelp,
  Compass,
  ListChecks,
  MapPinned,
  PawPrint,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Waypoints,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

const planningSteps = [
  {
    number: "01",
    icon: PawPrint,
    title: "반려동물 정보",
    description: "종류와 크기, 이동장·목줄 같은 준비물을 입력해요.",
  },
  {
    number: "02",
    icon: CalendarDays,
    title: "여행 조건",
    description: "지역과 날짜, 여행 형태, 원하는 장소 유형을 정해요.",
  },
  {
    number: "03",
    icon: Waypoints,
    title: "경로 비교",
    description: "조건에 맞는 경우 최대 세 가지 경로 전략을 비교해요.",
  },
  {
    number: "04",
    icon: ListChecks,
    title: "상세 결과",
    description: "추천 결과에서 장소별 동반 판정과 근거, 이동 순서를 확인해요.",
  },
] as const;

const routeStrategies = [
  {
    icon: SlidersHorizontal,
    title: "취향 균형 코스",
    description: "선호한 장소 유형과 여행 역할을 고르게 살펴요.",
  },
  {
    icon: Route,
    title: "이동 최소 코스",
    description: "품질 기준 안에서 이동과 역주행이 적은 조합을 살펴요.",
  },
  {
    icon: Compass,
    title: "새로운 발견 코스",
    description: "검증된 관광공사 장소의 역할 다양성을 우선해요.",
  },
] as const;

function PlanningPreview() {
  return (
    <section
      className="surface-panel p-5 sm:p-7"
      aria-labelledby="planning-preview-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Planning preview</p>
          <h2 id="planning-preview-title" className="mt-2 text-lg font-black">
            입력한 조건이 일정이 되기까지
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-[#c9ddd0] bg-[var(--brand-soft)] px-3 py-1.5 text-[11px] font-extrabold text-[var(--brand)]">
          현재 부산 지원
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-white text-[var(--brand)] shadow-sm">
            <PawPrint size={19} aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm font-black">반려동물 프로필</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            크기와 준비물 조건
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-white text-[var(--brand)] shadow-sm">
            <CalendarDays size={19} aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm font-black">여행 조건</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            날짜와 범위, 장소 유형
          </p>
        </div>
      </div>

      <div className="my-4 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--line)]" />
        <span className="grid size-9 place-items-center rounded-full bg-[var(--brand)] text-white">
          <Route size={16} />
        </span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <div className="rounded-2xl border border-[#c9ddd0] bg-[var(--brand-soft)] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black text-[#174b36]">경로 전략 비교</p>
          <span className="text-[11px] font-bold text-[#547466]">조건 충족 시 최대 3개</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-extrabold text-[#315d49]">
          <span className="rounded-lg bg-white px-2 py-2">취향 균형</span>
          <span className="rounded-lg bg-white px-2 py-2">이동 최소</span>
          <span className="rounded-lg bg-white px-2 py-2">새로운 발견</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-[var(--brand-deep)] p-4 text-white">
        <div>
          <p className="text-xs font-bold text-[#badcca]">비교 뒤 선택한 경로</p>
          <p className="mt-1 text-sm font-black">근거와 순서를 담은 추천 결과</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
          <ListChecks size={19} aria-hidden="true" />
        </span>
      </div>

      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
        실제 장소는 추천 단계에서 공공 관광 정보와 제공자 응답을 검증한 뒤 불러옵니다.
      </p>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="landing-page">
      <section className="landing-shell grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">반려동물 동반 여행 플래너</p>
          <h1 className="balance mt-5 text-4xl font-black leading-[1.12] tracking-[-0.055em] sm:text-5xl sm:leading-[1.1] xl:text-[56px]">
            함께 들어갈 수 있는 곳부터,
            <br className="hidden sm:block" />
            <span className="text-[var(--brand)]">이동하기 좋은 순서까지.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[var(--muted)] sm:text-lg sm:leading-8">
            한국관광공사의 반려동물 동반 정보와 우리 아이의 크기·준비물을
            비교하고, 여행 조건에 맞는 경로를 현실적인 일정으로 정리해요.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/planner/pet" variant="brand" className="w-full sm:w-auto">
              여행 계획 시작하기
              <ArrowRight size={17} aria-hidden="true" />
            </ButtonLink>
            <ButtonLink
              href="#planning-flow"
              variant="brandSecondary"
              className="w-full sm:w-auto"
            >
              이용 흐름 보기
            </ButtonLink>
          </div>
          <ul className="mt-8 grid gap-3 text-sm font-bold text-[#52665d] sm:grid-cols-2">
            <li className="flex items-start gap-2.5">
              <Check
                size={17}
                className="mt-0.5 shrink-0 text-[var(--brand)]"
                aria-hidden="true"
              />
              원문 출처와 조회 시각 보존
            </li>
            <li className="flex items-start gap-2.5">
              <Check
                size={17}
                className="mt-0.5 shrink-0 text-[var(--brand)]"
                aria-hidden="true"
              />
              모호한 조건은 확인 필요로 안내
            </li>
          </ul>
        </div>

        <PlanningPreview />
      </section>

      <section
        className="border-y border-[var(--line)] bg-[var(--surface)]"
        aria-labelledby="source-note-title"
      >
        <div className="landing-shell grid gap-4 py-6 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-6">
          <span className="grid size-11 place-items-center rounded-2xl bg-[var(--orange-soft)] text-[var(--orange)]">
            <ShieldCheck size={21} aria-hidden="true" />
          </span>
          <div>
            <h2 id="source-note-title" className="text-sm font-black">
              공공 반려동물 동반 정보에서 시작합니다.
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              외부 응답을 검증한 뒤 도메인 판정에 사용하며, 제공자 실패를 데모 장소로
              대체하지 않습니다.
            </p>
          </div>
          <p className="text-xs font-bold text-[#6c7d74] md:text-right">
            현재 지원 지역 · 부산
          </p>
        </div>
      </section>

      <section id="planning-flow" className="landing-shell py-16 sm:py-24" aria-labelledby="planning-flow-title">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="eyebrow">How it works</p>
            <h2
              id="planning-flow-title"
              className="balance mt-3 text-3xl font-black tracking-[-0.045em] sm:text-4xl"
            >
              조건을 묻고, 비교하고,
              <br />
              근거까지 확인해요.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-[var(--muted)] sm:text-base">
            입력은 두 단계로 나누고, 추천 결과에서는 서로 다른 경로 전략과 장소별
            근거, 이동 순서를 이어서 살펴볼 수 있어요.
          </p>
        </div>

        <ol className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {planningSteps.map(({ number, icon: Icon, title, description }) => (
            <li key={number} className="border-t-2 border-[#cfdcd3] pt-5">
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="text-xs font-black tracking-[0.12em] text-[#9aa79f]">
                  {number}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-black">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-[var(--line)] bg-[var(--surface)] py-16 sm:py-24" aria-labelledby="evidence-title">
        <div className="landing-shell grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16">
          <div>
            <p className="eyebrow">확인할 것부터</p>
            <h2
              id="evidence-title"
              className="balance mt-3 text-3xl font-black tracking-[-0.045em] sm:text-4xl"
            >
              정보가 부족할수록
              <br />
              더 분명하게 말합니다.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-[var(--muted)] sm:text-base">
              “동반 가능”이라는 한 줄만으로는 여행을 결정하기 어려워요. PetPass는
              시설 원문과 반려동물 조건을 나란히 보고, 확인되지 않은 내용을 허용으로
              단정하지 않아요.
            </p>
          </div>

          <div className="surface-panel overflow-hidden">
            {[
              {
                icon: MapPinned,
                title: "공공 원문에서 시작",
                description:
                  "한국관광공사의 반려동물 동반 관광 정보를 검증한 뒤 사용해요.",
              },
              {
                icon: Backpack,
                title: "우리 아이 조건과 대조",
                description:
                  "종류·크기와 이동장·목줄·입마개, 실내외 선호를 시설 조건과 비교해요.",
              },
              {
                icon: CircleHelp,
                title: "모르면 확인 필요",
                description:
                  "근거가 없거나 모호하거나 충돌하면 방문 전 확인이 필요하다고 남겨요.",
              },
            ].map(({ icon: Icon, title, description }, index) => (
              <article
                key={title}
                className={`flex gap-4 p-5 sm:p-6 ${index > 0 ? "border-t border-[var(--line)]" : ""}`}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-base font-black">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">
                    {description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-shell py-16 sm:py-24" aria-labelledby="strategies-title">
        <div className="max-w-2xl">
          <p className="eyebrow">세 가지 관점</p>
          <h2
            id="strategies-title"
            className="balance mt-3 text-3xl font-black tracking-[-0.045em] sm:text-4xl"
          >
            한 경로를 정답처럼 내놓지 않아요.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)] sm:text-base">
            조건을 충족하는 경우 서로 다른 기준으로 구성한 최대 세 코스를 비교하고,
            여행에 맞는 경로를 직접 선택할 수 있어요.
          </p>
        </div>

        <div className="surface-panel mt-10 overflow-hidden">
          <div className="grid md:grid-cols-3 md:divide-x md:divide-[var(--line)]">
            {routeStrategies.map(({ icon: Icon, title, description }, index) => (
              <article
                key={title}
                className={`p-6 sm:p-7 ${index > 0 ? "border-t border-[var(--line)] md:border-t-0" : ""}`}
              >
                <span className="grid size-11 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
              </article>
            ))}
          </div>
          <div className="border-t border-[var(--line)] bg-[var(--orange-soft)] px-6 py-4 text-sm font-bold leading-6 text-[#765034] sm:px-7">
            추천 결과에서는 각 전략의 이유와 장소별 동반 판정, 이동 경로를 함께
            확인할 수 있어요.
          </div>
        </div>
      </section>

      <section className="landing-shell" aria-labelledby="closing-cta-title">
        <div className="surface-panel surface-panel--brand flex flex-col gap-7 p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-2xl items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-[#c9e5d6]">
              <PawPrint size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-extrabold tracking-[0.12em] text-[#b8d9c8]">
                START WITH YOUR PET
              </p>
              <h2 id="closing-cta-title" className="mt-2 text-2xl font-black sm:text-3xl">
                우리 아이의 조건부터 여행을 시작해 보세요.
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#d4e6dc]">
                반려동물 정보와 준비물은 브라우저에 검증된 형식으로 저장됩니다.
              </p>
            </div>
          </div>
          <ButtonLink
            href="/planner/pet"
            variant="brandSecondary"
            className="w-full shrink-0 lg:w-auto"
          >
            여행 계획 시작하기
            <ArrowRight size={17} aria-hidden="true" />
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
