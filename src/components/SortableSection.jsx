import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ICONS } from "../lib/icons";

export function SortableSection({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <section ref={setNodeRef} style={style} className="project-section">
      <div className="section-drag-handle" {...attributes} {...listeners}>
        {ICONS.grip}
      </div>
      {children}
    </section>
  );
}
