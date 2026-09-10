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
          <p>weekendog2@gmail.com으로 문의해 주세요.</p>
        </div>
      </div>
      <a
        href="mailto:weekendog2@gmail.com"
        className="weekendoog-contact-card__link"
        aria-label="이메일로 문의하기"
      >
        <MessageCircle size={16} aria-hidden="true" />
        문의하기
      </a>
    </aside>
  );
}
