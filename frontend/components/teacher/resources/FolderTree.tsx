"use client";

import {
  ChevronRight,
  Folder,
  FolderOpen,
  Library,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useResourceStore } from "@/hooks/useResourceStore";
import { createFolder, deleteFolder } from "@/lib/api/resources";
import type { FolderResponse } from "@/types/resource";

interface FolderNodeProps {
  folder: FolderResponse;
  allFolders: FolderResponse[];
  depth: number;
}

// Константи для ідеального вирівнювання дерева
const BASE_PADDING = 8; // Базовий відступ (px-2)
const INDENT = 20; // Відступ для кожного наступного рівня підпапок

function FolderNode({ folder, allFolders, depth }: FolderNodeProps) {
  const t = useTranslations("resources.folders");
  const { selectedFolderId, setSelectedFolder, fetchFolders } =
    useResourceStore();

  const [expanded, setExpanded] = useState(false);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const children = allFolders.filter((f) => f.parent_id === folder.id);
  const isActive = selectedFolderId === folder.id;

  // Рахуємо динамічні відступи
  const currentPadding = BASE_PADDING + depth * INDENT;
  const guideLineLeft = currentPadding + 8; // Лінія йде рівно з центру шеврона (який має ширину 16px)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("deleteConfirm") || "Видалити цю папку?")) return;
    try {
      let curr = allFolders.find((f) => f.id === selectedFolderId);
      let isSelectedInTree = false;
      while (curr) {
        if (curr.id === folder.id) {
          isSelectedInTree = true;
          break;
        }
        curr = allFolders.find((f) => f.id === curr?.parent_id);
      }

      await deleteFolder(folder.id);
      await fetchFolders();

      if (isSelectedInTree) {
        setSelectedFolder(null);
      }
    } catch {
      console.error("Failed to delete folder");
    }
  };

  const handleAddChildClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAddingChild(true);
    setExpanded(true);
  };

  const handleCreateChild = async () => {
    if (isSubmitting) return;
    const name = childName.trim();
    if (!name) {
      setIsAddingChild(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await createFolder({ name, parent_id: folder.id });
      await fetchFolders();
      setChildName("");
      setIsAddingChild(false);
    } catch {
      console.error("Failed to create subfolder");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChildKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreateChild();
    if (e.key === "Escape") {
      setIsAddingChild(false);
      setChildName("");
    }
  };

  return (
    <div className="relative">
      {/* biome-ignore lint/a11y/useSemanticElements: folder row needs div for complex styling with children */}
      <div
        className={`group relative z-20 flex items-center gap-2 w-full pr-2 py-1.5 rounded-md text-sm transition-colors ${
          isActive
            ? "bg-blue-50 text-blue-700 font-medium"
            : "text-gray-700 hover:bg-gray-100"
        } cursor-pointer`}
        style={{ paddingLeft: `${currentPadding}px` }}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedFolder(folder.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setSelectedFolder(folder.id);
        }}
      >
        {children.length > 0 || isAddingChild ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 flex-shrink-0 outline-none transition-colors cursor-pointer"
          >
            <ChevronRight
              size={14}
              style={{
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}

        {isActive ? (
          <FolderOpen size={16} className="text-blue-500 flex-shrink-0" />
        ) : (
          <Folder size={16} className="text-gray-400 flex-shrink-0" />
        )}

        <span className="flex-1 truncate">{folder.name}</span>

        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            type="button"
            onClick={handleAddChildClick}
            // Додано cursor-pointer
            className="p-0.5 text-gray-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
            title={t("newSubfolder") || "Додати підпапку"}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            // Додано cursor-pointer та змінено hover на hover:text-blue-600
            className="p-0.5 text-gray-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
            title={t("delete") || "Видалити"}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="relative flex flex-col gap-0.5">
          {/* Вертикальна лінія-напрямна для дітей */}
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-200 pointer-events-none z-30"
            style={{ left: `${guideLineLeft}px` }}
          />

          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              allFolders={allFolders}
              depth={depth + 1}
            />
          ))}

          {isAddingChild && (
            <div
              className="relative z-20 mt-1 mb-1 pr-2"
              style={{
                paddingLeft: `${BASE_PADDING + (depth + 1) * INDENT}px`,
              }}
            >
              <input
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                onKeyDown={handleChildKeyDown}
                onBlur={() => {
                  if (!childName.trim()) setIsAddingChild(false);
                }}
                placeholder={t("name") || "Назва підпапки"}
                disabled={isSubmitting}
                className="w-full py-1 px-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FolderTree() {
  const t = useTranslations("resources");
  const { folders, selectedFolderId, setSelectedFolder, fetchFolders } =
    useResourceStore();

  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rootFolders = folders.filter((f) => f.parent_id === null);

  const handleCreateRoot = async () => {
    if (isSubmitting) return;
    const name = newName.trim();
    if (!name) {
      setIsAdding(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await createFolder({ name });
      await fetchFolders();
      setNewName("");
      setIsAdding(false);
    } catch {
      console.error("Failed to create folder");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreateRoot();
    if (e.key === "Escape") {
      setIsAdding(false);
      setNewName("");
    }
  };

  return (
    <div className="w-full">
      {/* Заголовок */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {t("folders.title") || "ПАПКИ"}
        </span>
        <button
          type="button"
          onClick={() => setIsAdding((v) => !v)}
          className="p-1 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
          title={t("folders.new") || "Нова папка"}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Всі ресурси (Root/Library) */}
      {/* biome-ignore lint/a11y/useSemanticElements: root library row needs div for consistent styling */}
      <div
        className={`flex items-center gap-2 w-full px-2 py-1.5 mb-1 rounded-md text-sm transition-colors cursor-pointer ${
          selectedFolderId === null
            ? "bg-blue-50 text-blue-700 font-medium"
            : "text-gray-700 hover:bg-gray-100"
        }`}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedFolder(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setSelectedFolder(null);
        }}
      >
        <Library
          size={16}
          className={
            selectedFolderId === null ? "text-blue-500" : "text-gray-400"
          }
        />
        <span>{t("title") || "Всі ресурси"}</span>
      </div>

      {/* Дерево папок */}
      <div className="flex flex-col gap-0.5">
        {rootFolders.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            allFolders={folders}
            depth={0}
          />
        ))}

        {/* Інпут для нової КОРЕНЕВОЇ папки */}
        {isAdding && (
          <div className="mt-1 px-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (!newName.trim()) setIsAdding(false);
              }}
              placeholder={t("folders.name") || "Назва папки"}
              disabled={isSubmitting}
              className="w-full py-1 px-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>
        )}
      </div>
    </div>
  );
}
