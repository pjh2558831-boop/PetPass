"use client";

export function HomepageSkipLink() {
  return (
    <a
      className="weekendoog-skip-link"
      href="#weekendoog-hero-heading"
      onClick={(event) => {
        const target = document.getElementById("weekendoog-hero-heading");
        if (!target) return;
        event.preventDefault();
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: "start" });
      }}
    >
      본문으로 건너뛰기
    </a>
  );
}
