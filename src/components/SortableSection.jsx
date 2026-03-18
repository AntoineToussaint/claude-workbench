import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function SortableSection({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <section ref={setNodeRef} style={style} className="project-section">
      {typeof children === "function" ? children({ dragHandleProps: { ...attributes, ...listeners } }) : children}
    </section>
  );
}
