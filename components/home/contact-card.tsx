import { Headphones, MessageCircle } from "lucide-react";

export function ContactCard() {
  return (
    <aside className="weekendoog-contact-card" aria-labelledby="weekendoog-contact-title">
      <div className="weekendoog-contact-card__copy">
        <span className="weekendoog-contact-card__icon">
          <Headphones size={19} aria-hidden="true" />
        </span>
        <div>
          <h2 id="weekendoog-contact-title">
            문의가 필요하신가요?
          </h2>
          <p>GitHub 이슈에서 문의 내용을 남겨주세요.</p>
        </div>
      </div>
      <a
        href="https://github.com/pjh2558831-boop/PetPass/issues"
        target="_blank"
        rel="noreferrer"
        className="weekendoog-contact-card__link"
        aria-label="GitHub 이슈에서 문의하기 (새 창)"
      >
        <MessageCircle size={16} aria-hidden="true" />
        문의하기
      </a>
    </aside>
  );
}
