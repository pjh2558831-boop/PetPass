"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowUpRight } from "lucide-react";
import { eventStatus, kstToday } from "@/lib/homepage/pet-content";
import type { ContentFeed, PetEventItem, PetNewsItem } from "@/types/pet-content";
import styles from "./homepage-pet-content.module.css";

function useContent<T>(endpoint: string, ref: RefObject<HTMLDivElement | null>) {
  const pending = useRef<Promise<ContentFeed<T>> | null>(null);
  const [feed, setFeed] = useState<ContentFeed<T> | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      pending.current ??= fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(25000) })
        .then(async response => {
          if (!response.ok) throw new Error("unavailable");
          const envelope = await response.json();
          if (envelope.ok !== true) throw new Error("unavailable");
          const result = envelope.data as ContentFeed<T>;
          if (!["ready", "empty", "unavailable"].includes(result.state) || !Array.isArray(result.items)) throw new Error("invalid");
          return result;
        }).catch(() => ({ state: "unavailable" as const, items: [] }));
      void pending.current.then(result => { if (active) setFeed(result); });
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: "300px" });
    if (observer && ref.current) observer.observe(ref.current);
    else load();
    return () => { active = false; observer?.disconnect(); };
  }, [endpoint, ref]);
  return feed;
}

function ExternalMark() {
  return <><ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only"> (외부 링크, 새 창)</span></>;
}

export function HomepagePetContent() {
  const newsRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef<HTMLDivElement>(null);
  const news = useContent<PetNewsItem>("/api/content/pet-news", newsRef);
  const events = useContent<PetEventItem>("/api/content/pet-events", eventsRef);
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setToday(kstToday());
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);
  const eventItems = events?.items.flatMap(item => {
    const status = today ? eventStatus(item.startDate, item.endDate, today) : item.status;
    return status ? [{ ...item, status }] : [];
  }).slice(0, 3) ?? [];

  return <section className={`homepage-shell ${styles.section}`} aria-label="반려생활 소식과 행사">
    <div ref={newsRef} className={styles.panel} aria-labelledby="pet-news-heading">
      <p className={styles.eyebrow}>함께하는 일상</p>
      <h2 id="pet-news-heading">반려생활 소식</h2>
      <p className={styles.description}>반려동물과 함께하는 생활에 필요한 소식을 만나보세요.</p>
      <div className={styles.rows} aria-busy={!news}>
        {!news ? <p className={styles.message}>소식을 불러오는 중입니다.</p> : news.state === "unavailable" ? <p className={styles.message}>소식을 불러오지 못했습니다.</p> : !news.items.length ? <p className={styles.message}>현재 표시할 반려동물 소식이 없습니다.</p> :
          <ul>{news.items.slice(0, 4).map(item => <li key={item.id}>
            <a className={styles.newsLink} href={item.originalUrl} target="_blank" rel="noopener noreferrer">
              <span><span className={styles.newsTitle}>{item.title}</span><span className={styles.metadata}>{item.sourceLabel}{item.providedAt && <> · <time dateTime={item.providedAt}>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.providedAt))}</time> <span>제공</span></>}</span></span>
              <ExternalMark />
            </a>
          </li>)}</ul>}
      </div>
      <p className={styles.note}>검색 제공: NAVER · 기사 출처는 각 원문에 표시됩니다.</p>
    </div>
    <div ref={eventsRef} className={styles.panel} aria-labelledby="pet-events-heading">
      <p className={styles.eyebrow}>달력에 담아둘 만남</p>
      <h2 id="pet-events-heading">다가오는 반려동물 행사</h2>
      <p className={styles.description}>전국의 반려동물 관련 행사 일정을 확인해 보세요.</p>
      <div className={styles.rows} aria-busy={!events}>
        {!events ? <p className={styles.message}>행사 정보를 불러오는 중입니다.</p> : events.state === "unavailable" ? <p className={styles.message}>행사 정보를 불러오지 못했습니다.</p> : !eventItems.length ? <p className={styles.message}>조회 기간에 확인된 반려동물 행사가 없습니다.</p> :
          <ul>{eventItems.map(item => <li className={styles.eventRow} key={item.id}>
            <time className={styles.dateBlock} dateTime={item.startDate}><span>{Number(item.startDate.slice(5, 7))}월</span><strong>{item.startDate.slice(8)}</strong></time>
            <div className={styles.eventDetails}>
              <p className={styles.metadata}>{item.regionLabel} · {item.status === "ongoing" ? "진행 중" : "예정"}</p>
              <h3>{item.title}</h3>
              <p className={styles.metadata}>{item.venueLabel ?? "장소 확인 필요"}</p>
              <p className={styles.metadata}><time dateTime={item.startDate}>{item.startDate.replaceAll("-", ".")}</time>{item.endDate ? <> ~ <time dateTime={item.endDate}>{item.endDate.replaceAll("-", ".")}</time></> : " · 종료일 확인 필요"}</p>
              {item.informationUrl && <a className={styles.eventLink} href={item.informationUrl} target="_blank" rel="noopener noreferrer">행사 안내 <ExternalMark /></a>}
            </div>
          </li>)}</ul>}
      </div>
      <p className={styles.note}>한국관광공사 · 향후 90일 일정, 시작일 기준 지난 30일까지 조회{events?.coverageLimited ? " · 일부 조회 결과" : ""}</p>
      <p className={styles.note}>반려동물 입장 조건과 일정 변경 여부는 행사 안내를 확인해 주세요.</p>
    </div>
  </section>;
}
