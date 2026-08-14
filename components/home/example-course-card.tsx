import { Clock3, Info, MapPin, Route } from "lucide-react";
import { WEEKENDOG_EXAMPLE_COURSE } from "@/lib/homepage/editorial-content";

export function ExampleCourseCard() {
  const course = WEEKENDOG_EXAMPLE_COURSE;

  return (
    <article className="weekendoog-example-course-card overflow-hidden rounded-[24px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black tracking-[0.12em] text-[var(--brand)]">
            {course.eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black leading-[1.3] tracking-[-0.04em] text-[var(--foreground)]">
            {course.title}
          </h2>
          <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted)]">
            {course.description}
          </p>
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
          <Route size={20} aria-hidden="true" />
        </span>
      </div>

      <div className="relative mt-6 hidden h-14 sm:block" aria-hidden="true">
        <div className="absolute left-[9%] right-[9%] top-5 h-px bg-[var(--brand-border)]" />
        <div className="relative grid grid-cols-4">
          {course.stops.map((stop, index) => (
            <span
              key={stop.time}
              className="mx-auto grid size-10 place-items-center rounded-full border-4 border-white bg-[var(--brand)] text-xs font-black text-white shadow-sm"
            >
              {index + 1}
            </span>
          ))}
        </div>
      </div>

      <ol className="mt-5 grid gap-3 sm:mt-2 sm:grid-cols-4">
        {course.stops.map((stop) => (
          <li
            key={stop.time}
            className="rounded-[18px] bg-[var(--surface-muted)] p-3 text-left sm:text-center"
          >
            <p className="flex items-center gap-1 text-[11px] font-extrabold text-[var(--brand)] sm:justify-center">
              <Clock3 size={13} aria-hidden="true" />
              {stop.time}
            </p>
            <p className="mt-1.5 text-sm font-black text-[var(--foreground)]">
              {stop.title}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-[var(--muted)] sm:justify-center">
              <MapPin size={12} aria-hidden="true" />
              {stop.note}
            </p>
          </li>
        ))}
      </ol>

      <p className="mt-5 flex items-start gap-2 rounded-[14px] border border-[var(--line)] bg-[#fafbf9] p-3 text-xs font-semibold leading-5 text-[var(--muted)]">
        <Info className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
        {course.disclosure}
      </p>
      <button
        type="button"
        aria-disabled="true"
        title="코스 상세 기능 준비 중"
        className="mt-4 inline-flex min-h-11 cursor-not-allowed items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--muted)]"
      >
        코스 자세히 보기 · 준비 중
      </button>
    </article>
  );
}
