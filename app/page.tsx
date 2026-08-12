import Link from "next/link";
import {
  ArrowRight,
  Backpack,
  CheckCircle2,
  Clock3,
  MapPinned,
  Quote,
  Route,
  ShieldCheck,
} from "lucide-react";
import { MapPanel } from "@/components/map/map-panel";
import { StatusBadge } from "@/components/pet-access/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/demo-badge";

export default function HomePage() {
  return (
    <div className="landing-page">
      <section className="page-shell grid items-center gap-8 py-10 sm:py-16 lg:grid-cols-[.88fr_1.12fr] lg:py-20">
        <div className="max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#bad6c6] bg-[#eaf6ef] px-3 py-1.5 text-xs font-extrabold text-[#236148]">
              <ShieldCheck size={15} aria-hidden="true" />
              원문 근거로 확인하는 동반 조건
            </span>
            <DemoBadge />
          </div>
          <h1 className="balance mt-6 text-4xl font-black leading-[1.08] tracking-[-0.055em] sm:text-5xl lg:text-[58px]">
            이번 여행,
            <br />
            <span className="text-[#3d8b68]">함께 들어갈 수 있는 곳</span>만
            이어요.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#5e6e66] sm:text-lg sm:leading-8">
            장소의 반려동물 규정과 우리 아이의 크기, 이동장, 목줄 조건을 비교해
            방문할 장소를 먼저 살펴보거나, 관광지부터 식당과 카페까지 조건에 맞는
            여행 일정을 만들 수 있어요.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <ButtonLink href="/planner/pet" className="w-full sm:w-auto">
              여행 계획 시작하기
              <ArrowRight size={17} aria-hidden="true" />
            </ButtonLink>
            <ButtonLink
              href="/results"
              variant="secondary"
              className="w-full sm:w-auto"
            >
              <MapPinned size={17} aria-hidden="true" />
              방문 가능 장소 보기
            </ButtonLink>
          </div>
          <ul className="mt-8 grid gap-3 text-sm font-semibold text-[#52635a] sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <CheckCircle2 size={17} className="text-[#3d8b68]" aria-hidden="true" />
              계정 없이 바로 사용
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={17} className="text-[#3d8b68]" aria-hidden="true" />
              정보가 모호하면 확인 필요 표시
            </li>
          </ul>
        </div>

        <div className="relative">
          <MapPanel />
          <div className="surface-card absolute -bottom-5 left-4 right-4 z-10 flex items-center justify-between gap-3 p-3 sm:left-7 sm:right-auto sm:min-w-[340px] sm:p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#63736b]">2번째 · 식당</span>
                <StatusBadge status="CONDITIONAL" />
              </div>
              <p className="mt-2 truncate text-sm font-black">마린 테라스 식탁</p>
              <p className="mt-1 text-xs text-[#6f7d76]">야외석 · 이동장 필요</p>
            </div>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#fff0e3] text-[#b85a2a]">
              <Backpack size={19} aria-hidden="true" />
            </span>
          </div>
        </div>
      </section>

      <section className="border-y border-[#dfe5df] bg-[#fffdf8] py-14 sm:py-18">
        <div className="page-shell">
          <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr]">
            <div>
              <p className="eyebrow">헛걸음을 줄이는 방법</p>
              <h2 className="balance mt-3 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
                “동반 가능” 한 줄보다
                <br />
                필요한 조건을 먼저 봐요.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-7 text-[#65746c]">
                펫패스는 없는 규정을 만들어내지 않아요. 관광공사 원문에서 확인한
                내용만 준비물과 제한으로 보여주고, 부족한 정보는 방문 전 문의로
                남겨둬요.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: MapPinned,
                  number: "01",
                  title: "조건 비교",
                  text: "크기, 이동장, 목줄과 시설 원문을 대조해요.",
                },
                {
                  icon: Route,
                  number: "02",
                  title: "경로 구성",
                  text: "운영시간과 이동 순서를 고려해 하루를 이어요.",
                },
                {
                  icon: Quote,
                  number: "03",
                  title: "근거 확인",
                  text: "판정 아래에서 출처와 원문을 그대로 확인해요.",
                },
              ].map(({ icon: Icon, number, title, text }) => (
                <article key={number} className="surface-card p-5">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-2xl bg-[#edf8f2] text-[#236148]">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <span className="text-xs font-black text-[#a7b1ab]">{number}</span>
                  </div>
                  <h3 className="mt-6 text-base font-black">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6a7971]">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="page-shell py-16 sm:py-20">
        <div className="surface-card grid overflow-hidden lg:grid-cols-2">
          <div className="p-7 sm:p-10">
            <p className="eyebrow">첫 지원 시나리오</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
              소형견과 이동장이 있다면,
              <br />
              부산 하루는 이렇게.
            </h2>
            <div className="mt-7 space-y-3">
              {[
                ["10:00", "청사포 바다 산책길", "목줄 필수"],
                ["11:40", "마린 테라스 식탁", "야외석 · 이동장"],
                ["14:00", "민트 파도 카페", "방문 전 전화 확인"],
              ].map(([time, name, note], index) => (
                <div key={name} className="flex items-center gap-4 rounded-2xl bg-[#f5f7f4] p-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-[#236148] shadow-sm">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{name}</p>
                    <p className="mt-1 text-xs text-[#6b7972]">{note}</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-bold text-[#66766e]">
                    <Clock3 size={13} aria-hidden="true" />
                    {time}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col justify-center bg-[#254a3a] p-7 text-white sm:p-10">
            <p className="text-xs font-extrabold tracking-[0.12em] text-[#b9dfca]">
              SOURCE-FIRST
            </p>
            <blockquote className="mt-5 text-2xl font-bold leading-relaxed tracking-[-0.025em]">
              “소형 반려견은 야외 테라스에 한해 동반 가능하며 이동장 사용 필수”
            </blockquote>
            <p className="mt-5 text-sm leading-7 text-[#d5e6dc]">
              화면의 상태와 준비물은 이 원문 안에 있는 정보만 사용해 만들어요.
              이번 버전의 장소와 문구는 실제 영업 정보가 아닌 명시적 로컬 데모
              픽스처예요.
            </p>
            <Link
              href="/places/demo-busan-terrace-table"
              className="mt-7 inline-flex items-center gap-2 text-sm font-extrabold text-[#d8f0e3]"
            >
              상세 근거 화면 보기
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
