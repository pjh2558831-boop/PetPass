import { WEEKENDOG_PROCESS_STEPS } from "@/lib/homepage/editorial-content";

export function RecommendationProcessSection() {
  return (
    <section
      className="recommendation-process-section"
      aria-labelledby="recommendation-process-heading"
    >
      <div className="weekendoog-shell recommendation-process-inner">
        <h2 id="recommendation-process-heading">이용 방법</h2>
        <ol className="weekendoog-process-list">
          {WEEKENDOG_PROCESS_STEPS.map((step) => (
            <li key={step.number} className="weekendoog-process-item">
              <span className="weekendoog-process-number" aria-hidden="true">
                {step.number}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
