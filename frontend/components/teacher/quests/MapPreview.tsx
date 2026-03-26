import type { MapObject, MapResponse } from "@/types/map";

interface MapPreviewProps {
  map: MapResponse;
  className?: string;
}

function getObjectStyle(obj: MapObject, map: MapResponse): React.CSSProperties {
  return {
    position: "absolute",
    left: `${(obj.x / map.original_width) * 100}%`,
    top: `${(obj.y / map.original_height) * 100}%`,
    width: `${(obj.width / map.original_width) * 100}%`,
    height: `${(obj.height / map.original_height) * 100}%`,
    zIndex: obj.z_index,
  };
}

export default function MapPreview({ map, className }: MapPreviewProps) {
  const aspectRatio = map.original_width / map.original_height;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-gray-100 ${className ?? ""}`}
      style={{ aspectRatio }}
    >
      {/* Background */}
      <img
        src={`/maps/${map.slug}/background.svg`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* Objects */}
      {map.objects.filter((obj) => obj.slug !== "background").map((obj) => (
        <img
          key={obj.id}
          src={`/maps/${map.slug}/objects/${obj.slug}.svg`}
          alt=""
          style={getObjectStyle(obj, map)}
          draggable={false}
          className={
            obj.is_interactive
              ? "cursor-pointer opacity-100 hover:opacity-80 transition-opacity duration-150"
              : ""
          }
        />
      ))}
    </div>
  );
}
