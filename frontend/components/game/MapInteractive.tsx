"use client";

import type { MapObject, MapResponse } from "@/types/map";
import type { RunProgress } from "@/types/run";

interface MapInteractiveProps {
  map: MapResponse;
  progress: RunProgress[];
  onObjectClick: (mapObjectId: string, progressId: string) => void;
  activeObjectId?: string | null;
  highlightObjectId?: string | null;
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

export default function MapInteractive({
  map,
  progress,
  onObjectClick,
  activeObjectId,
  highlightObjectId,
  className,
}: MapInteractiveProps) {
  const aspectRatio = map.original_width / map.original_height;

  const progressByObject = new Map<string, RunProgress>();
  for (const p of progress) {
    if (p.map_object_id) {
      const existing = progressByObject.get(p.map_object_id);
      // When the same object is reused (wrap-around), prefer the assigned entry
      if (!existing || p.status === "assigned") {
        progressByObject.set(p.map_object_id, p);
      }
    }
  }

  const handleObjectClick = (obj: MapObject) => {
    if (!obj.is_interactive) return;
    // If activeObjectId is provided, only that object is clickable
    if (activeObjectId !== undefined && obj.id !== activeObjectId) return;
    const p = progressByObject.get(obj.id);
    if (p && p.status === "assigned") {
      onObjectClick(obj.id, p.id);
    }
  };

  return (
    <div
      className={`relative w-full overflow-hidden bg-gray-100 ${className ?? ""}`}
      style={{ aspectRatio }}
    >
      <style>{`
        @keyframes contour-glow {
          0%, 100% {
            filter: drop-shadow(0 0 3px #facc15) drop-shadow(0 0 6px #facc15);
          }
          50% {
            filter: drop-shadow(0 0 8px #facc15) drop-shadow(0 0 16px #fbbf24) drop-shadow(0 0 2px #fff);
          }
        }
        .object-glow {
          animation: contour-glow 1.6s ease-in-out infinite;
        }
      `}</style>

      {/* Background */}
      {/* biome-ignore lint/performance/noImgElement: SVG map background, Next/Image doesn't support SVG well */}
      <img
        src={`/maps/${map.slug}/background.svg`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* Objects */}
      {map.objects.map((obj) => {
        if (obj.slug === "background") return null;

        const p = progressByObject.get(obj.id);
        const isActive = obj.id === activeObjectId && p?.status === "assigned";
        const isHighlighted = obj.id === highlightObjectId;

        return (
          <div key={obj.id} style={getObjectStyle(obj, map)}>
            {/* biome-ignore lint/performance/noImgElement: SVG map object, Next/Image doesn't support SVG well */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: map objects use click only; keyboard navigation handled at parent level */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: map object img requires click for game interaction */}
            <img
              src={`/maps/${map.slug}/objects/${obj.slug}.svg`}
              alt=""
              className={`absolute inset-0 w-full h-full${isHighlighted ? " object-glow" : ""}`}
              draggable={false}
              onClick={() => handleObjectClick(obj)}
              style={{
                cursor: isActive ? "pointer" : "default",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
