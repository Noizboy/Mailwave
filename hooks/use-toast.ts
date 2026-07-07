import { sileo } from "sileo";

const POS = "top-center" as const;

export const toast = (props: { title?: string; description?: string }) =>
  sileo.info({ title: props.title, description: props.description, position: POS });

// Success: title shown directly, description optional
toast.success = (title: string, description?: string) =>
  sileo.success({ title, description, position: POS });

// Error: always uses a generic title so the specific message becomes the
// animated description — mirrors the playground's expand/collapse pattern.
// When called as toast.error("msg") → title="Something went wrong", description="msg"
// When called as toast.error("title", "detail") → both passed through
toast.error = (title: string, description?: string) => {
  if (description) {
    return sileo.error({
      title,
      description,
      position: POS,
      duration: 8000,
      autopilot: { expand: 200, collapse: 5500 },
    });
  }
  return sileo.error({
    title: "Something went wrong",
    description: title,
    position: POS,
    duration: 8000,
    autopilot: { expand: 200, collapse: 5500 },
  });
};

export function useToast() {
  return { toast };
}
