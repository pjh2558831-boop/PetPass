"use client";

export function HomepageSkipLink() {
  return (
    <a
      className="weekendoog-skip-link"
      href="#main-content"
      onClick={(event) => {
        const target = document.getElementById("main-content");
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
