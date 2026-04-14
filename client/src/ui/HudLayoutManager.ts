interface StoredHudPosition {
    left: number;
    top: number;
}

interface DraggableSurfaceOptions {
    id: string;
    element: HTMLElement;
    handle?: HTMLElement;
    layer?: number;
}

interface DraggableSurfaceRecord {
    id: string;
    element: HTMLElement;
    handle: HTMLElement;
    layer: number;
    initialized: boolean;
    onPointerDown: (event: PointerEvent) => void;
}

interface ActiveDragState {
    surface: DraggableSurfaceRecord;
    offsetX: number;
    offsetY: number;
}

const STORAGE_PREFIX = "iso-mmo:hud-layout:v1";

export class HudLayoutManager {
    private readonly surfaces = new Map<string, DraggableSurfaceRecord>();
    private readonly layerOffsets = new Map<number, number>();
    private activeDrag: ActiveDragState | null = null;

    constructor() {
        window.addEventListener("resize", this.handleResize);
    }

    public destroy() {
        this.surfaces.forEach((surface) => {
            surface.handle.removeEventListener("pointerdown", surface.onPointerDown);
            surface.handle.classList.remove("hud-drag-handle");
        });
        this.surfaces.clear();
        this.stopDragging();
        window.removeEventListener("resize", this.handleResize);
    }

    public clampAll() {
        this.handleResize();
    }

    public promoteSurface(surfaceId: string) {
        const surface = this.surfaces.get(surfaceId);
        if (!surface) return;
        this.bringToFront(surface);
    }

    public registerSurface(options: DraggableSurfaceOptions) {
        const handle = options.handle ?? options.element;
        const record: DraggableSurfaceRecord = {
            id: options.id,
            element: options.element,
            handle,
            layer: options.layer ?? 100,
            initialized: false,
            onPointerDown: (event: PointerEvent) => {
                this.beginDrag(record, event);
            },
        };

        handle.classList.add("hud-drag-handle");
        handle.addEventListener("pointerdown", record.onPointerDown);
        this.surfaces.set(record.id, record);

        window.requestAnimationFrame(() => {
            this.initializeSurface(record);
        });
    }

    private initializeSurface(surface: DraggableSurfaceRecord) {
        if (surface.initialized) return;

        const rect = surface.element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const storedPosition = this.readStoredPosition(surface.id);
        if (storedPosition) {
            this.applyPosition(surface, storedPosition.left, storedPosition.top);
        } else {
            this.applyPosition(surface, rect.left, rect.top);
        }

        surface.initialized = true;
        this.applyLayer(surface);
    }

    private beginDrag(surface: DraggableSurfaceRecord, event: PointerEvent) {
        if (event.button !== 0) return;
        if (this.shouldIgnoreDragStart(event)) return;

        this.initializeSurface(surface);
        const rect = surface.element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        event.preventDefault();
        this.bringToFront(surface);

        this.activeDrag = {
            surface,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
        };

        document.body.classList.add("hud-is-dragging");
        window.addEventListener("pointermove", this.handlePointerMove);
        window.addEventListener("pointerup", this.handlePointerUp);
        window.addEventListener("pointercancel", this.handlePointerUp);
    }

    private readonly handlePointerMove = (event: PointerEvent) => {
        if (!this.activeDrag) return;

        event.preventDefault();
        const { surface, offsetX, offsetY } = this.activeDrag;
        this.applyPosition(
            surface,
            event.clientX - offsetX,
            event.clientY - offsetY
        );
    };

    private readonly handlePointerUp = () => {
        if (!this.activeDrag) return;

        const surface = this.activeDrag.surface;
        const rect = surface.element.getBoundingClientRect();
        this.writeStoredPosition(surface.id, rect.left, rect.top);
        this.stopDragging();
    };

    private readonly handleResize = () => {
        this.surfaces.forEach((surface) => {
            this.initializeSurface(surface);

            const rect = surface.element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            this.applyPosition(surface, rect.left, rect.top);
            this.writeStoredPosition(surface.id, surface.element.getBoundingClientRect().left, surface.element.getBoundingClientRect().top);
        });
    };

    private stopDragging() {
        this.activeDrag = null;
        document.body.classList.remove("hud-is-dragging");
        window.removeEventListener("pointermove", this.handlePointerMove);
        window.removeEventListener("pointerup", this.handlePointerUp);
        window.removeEventListener("pointercancel", this.handlePointerUp);
    }

    private applyPosition(surface: DraggableSurfaceRecord, left: number, top: number) {
        const rect = surface.element.getBoundingClientRect();
        const width = rect.width || surface.element.offsetWidth;
        const height = rect.height || surface.element.offsetHeight;
        const clamped = this.clampToViewport(left, top, width, height);

        surface.element.style.left = `${Math.round(clamped.left)}px`;
        surface.element.style.top = `${Math.round(clamped.top)}px`;
        surface.element.style.right = "auto";
        surface.element.style.bottom = "auto";
        surface.element.style.transform = "none";
        surface.element.style.margin = "0";
    }

    private clampToViewport(left: number, top: number, width: number, height: number) {
        const maxLeft = Math.max(0, window.innerWidth - width);
        const maxTop = Math.max(0, window.innerHeight - height);

        return {
            left: Math.min(maxLeft, Math.max(0, left)),
            top: Math.min(maxTop, Math.max(0, top)),
        };
    }

    private bringToFront(surface: DraggableSurfaceRecord) {
        const nextOffset = (this.layerOffsets.get(surface.layer) ?? 0) + 1;
        this.layerOffsets.set(surface.layer, nextOffset);
        surface.element.style.zIndex = String(surface.layer + nextOffset);
    }

    private shouldIgnoreDragStart(event: PointerEvent): boolean {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;

        return Boolean(target.closest("button, input, select, textarea, option, a, [data-no-drag]"));
    }

    private readStoredPosition(surfaceId: string): StoredHudPosition | null {
        try {
            const rawValue = window.localStorage.getItem(this.getStorageKey(surfaceId));
            if (!rawValue) return null;

            const parsed = JSON.parse(rawValue) as Partial<StoredHudPosition>;
            if (
                typeof parsed.left !== "number" ||
                !Number.isFinite(parsed.left) ||
                typeof parsed.top !== "number" ||
                !Number.isFinite(parsed.top)
            ) {
                return null;
            }

            return {
                left: parsed.left,
                top: parsed.top,
            };
        } catch {
            return null;
        }
    }

    private writeStoredPosition(surfaceId: string, left: number, top: number) {
        try {
            window.localStorage.setItem(
                this.getStorageKey(surfaceId),
                JSON.stringify({
                    left: Math.round(left),
                    top: Math.round(top),
                } satisfies StoredHudPosition)
            );
        } catch {
            // Ignore storage failures so HUD dragging never breaks gameplay.
        }
    }

    private getStorageKey(surfaceId: string): string {
        return `${STORAGE_PREFIX}:${surfaceId}`;
    }

    private applyLayer(surface: DraggableSurfaceRecord) {
        const currentOffset = this.layerOffsets.get(surface.layer) ?? 0;
        surface.element.style.zIndex = String(surface.layer + currentOffset);
    }
}
