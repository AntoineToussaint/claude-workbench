import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ICONS } from "../lib/icons";

export function SortableCard({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="sortable-card-wrapper">
      <div className="card-drag-handle" {...attributes} {...listeners}>
        {ICONS.grip}
      </div>
      {children}
    </div>
  );
}
