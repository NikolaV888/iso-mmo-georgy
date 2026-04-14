export type DomChild = Node | string | null | undefined | false;

function normalizeClasses(classNames?: string | string[]): string[] {
    if (!classNames) return [];
    return Array.isArray(classNames) ? classNames : [classNames];
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    classNames?: string | string[],
    textContent?: string
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    const classes = normalizeClasses(classNames);
    if (classes.length > 0) element.classList.add(...classes);
    if (textContent !== undefined) element.textContent = textContent;
    return element;
}

export function appendChildren(parent: HTMLElement, ...children: DomChild[]) {
    children.forEach((child) => {
        if (child === null || child === undefined || child === false) return;
        if (typeof child === "string") {
            parent.append(document.createTextNode(child));
            return;
        }
        parent.append(child);
    });
}

export function createButton(
    label: string,
    classNames: string | string[] = "hud-button"
): HTMLButtonElement {
    const button = createElement("button", classNames, label);
    button.type = "button";
    return button;
}

export function setButtonDisabled(button: HTMLButtonElement, disabled: boolean) {
    button.disabled = disabled;
    button.classList.toggle("is-disabled", disabled);
}

export interface MeterElements {
    root: HTMLDivElement;
    fill: HTMLDivElement;
    valueLabel: HTMLSpanElement;
}

export function createMeter(labelText: string, variant: string): MeterElements {
    const root = createElement("div", ["hud-meter", `hud-meter--${variant}`]);
    const head = createElement("div", "hud-meter__head");
    const label = createElement("span", "hud-meter__label", labelText);
    const valueLabel = createElement("span", "hud-meter__value", "0 / 0");
    const track = createElement("div", "hud-meter__track");
    const fill = createElement("div", "hud-meter__fill");

    appendChildren(head, label, valueLabel);
    track.append(fill);
    appendChildren(root, head, track);

    return { root, fill, valueLabel };
}

export function updateMeter(
    meter: MeterElements,
    value: number,
    max: number,
    valueText = `${value} / ${max}`
) {
    const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    meter.fill.style.width = `${Math.round(ratio * 100)}%`;
    meter.valueLabel.textContent = valueText;
}
