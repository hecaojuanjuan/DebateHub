"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { useLanguage } from "./language-provider";

export function LocalizedForm(props: ComponentPropsWithoutRef<"form">) {
  const { t, locale } = useLanguage();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.querySelectorAll("input,textarea").forEach((field) => {
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement
      )
        field.setCustomValidity("");
    });
  }, [locale]);
  return (
    <form
      {...props}
      ref={ref}
      onInputCapture={(event) => {
        const field = event.target;
        if (
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement
        )
          field.setCustomValidity("");
        props.onInputCapture?.(event);
      }}
      onInvalidCapture={(event) => {
        const field = event.target;
        if (
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement
        ) {
          field.setCustomValidity("");
          const validity = field.validity;
          if (validity.valueMissing)
            field.setCustomValidity(t("Please complete this field."));
          else if (validity.tooShort)
            field.setCustomValidity(
              t("Use at least {min} characters.", { min: field.minLength }),
            );
          else if (validity.tooLong)
            field.setCustomValidity(
              t("Use no more than {max} characters.", { max: field.maxLength }),
            );
          else if (validity.patternMismatch)
            field.setCustomValidity(
              field.name === "username"
                ? t("Use a valid username. {hint}", { hint: field.title })
                : t("Match the format shown above."),
            );
        }
        props.onInvalidCapture?.(event);
      }}
    />
  );
}
