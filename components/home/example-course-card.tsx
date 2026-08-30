import Image from "next/image";
import Link from "next/link";
import { WEEKENDOG_EXAMPLE_COURSE } from "@/lib/homepage/editorial-content";

export function ExampleCourseCard() {
  const course = WEEKENDOG_EXAMPLE_COURSE;

  return (
    <article
      className="weekendoog-example-course-card"
      aria-labelledby="weekendoog-example-course-heading"
    >
      <div className="weekendoog-example-course-image">
        <Image
          src={course.imageSrc}
          alt={course.imageAlt}
          fill
          sizes="(max-width: 767px) calc(100vw - 24px), 46vw"
        />
      </div>

      <div className="weekendoog-example-course-content">
        <p className="weekendoog-example-course-label">{course.label}</p>
        <h2 id="weekendoog-example-course-heading">{course.title}</h2>
        <p className="weekendoog-example-course-description">{course.description}</p>

        <ol className="weekendoog-example-course-stops">
          {course.stops.map((stop) => (
            <li key={stop.time}>
              <time>{stop.time}</time>
              <div>
                <h3>{stop.title}</h3>
                <p>{stop.note}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="weekendoog-example-course-disclosure">{course.disclosure}</p>
        <Link href="/planner/pet" className="weekendoog-example-course-link">
          이 조건으로 내 일정 만들기 <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
