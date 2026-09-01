import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function ProductState({
  title,
  description,
  children,
  status = "section",
  headingProps,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  status?: "section" | "status" | "alert";
  headingProps?: Omit<ComponentPropsWithoutRef<"h1">, "children">;
}) {
  const headingId = headingProps?.id;
  const descriptionId = description && headingId ? `${headingId}-description` : undefined;
  const liveProps =
    status === "status"
      ? ({
          role: "status",
          "aria-live": "polite",
          ...(headingId ? { "aria-labelledby": headingId } : {}),
          ...(descriptionId ? { "aria-describedby": descriptionId } : {}),
        } as const)
      : status === "alert"
        ? ({
            role: "alert",
            ...(headingId ? { "aria-labelledby": headingId } : {}),
            ...(descriptionId ? { "aria-describedby": descriptionId } : {}),
          } as const)
        : {};

  return (
    <section className="product-state" {...liveProps}>
      <h1 {...headingProps}>{title}</h1>
      {description ? <p id={descriptionId}>{description}</p> : null}
      {children ? <div className="product-state__actions">{children}</div> : null}
    </section>
  );
}
