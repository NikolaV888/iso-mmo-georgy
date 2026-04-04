/**
 * HudManager manages DOM-based UI overlays on top of the Phaser canvas.
 * It builds the bottom bar Action Menu and the Stats Window, updating them
 * when the server pushes a state snapshot.
 */
export class HudManager {
    private wrapper: HTMLDivElement;

    // UI Elements
    private statsWindow: HTMLDivElement | null = null;
    private hpLabel: HTMLSpanElement | null = null;
    private levelLabel: HTMLSpanElement | null = null;

    // ...
    private statLabels: Record<string, HTMLSpanElement> = {};

    constructor() {
        const existing = document.getElementById('hud-wrapper');
        if (existing) existing.remove();

        this.wrapper = document.createElement('div');
        this.wrapper.id = 'hud-wrapper';

        Object.assign(this.wrapper.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            pointerEvents: 'none', // click through transparent areas
            zIndex: '1000',
            fontFamily: 'monospace, sans-serif'
        });
        document.body.appendChild(this.wrapper);

        this.buildTopLeftPortrait();
        this.buildBottomActionBar();
        this.buildStatsWindow();
    }

    public destroy() {
        this.wrapper.remove();
        this.statsWindow = null;
        this.hpLabel = null;
        this.levelLabel = null;
        this.statLabels = {};
    }

    /** Called 20x a second when the snapshot arrives */
    public updateLocalPlayer(p: any) {
        if (!p) return;

        // Update Top Left HUD
        if (this.hpLabel) this.hpLabel.innerText = `${p.hp} / ${p.maxHp}`;
        if (this.levelLabel) this.levelLabel.innerText = `Lv. ${p.level}`;

        // Update Stats Window
        if (this.statLabels['hp']) this.statLabels['hp'].innerText = `${p.hp} / ${p.maxHp}`;
        if (this.statLabels['damage']) this.statLabels['damage'].innerText = String(p.attackDamage);
        if (this.statLabels['speed']) this.statLabels['speed'].innerText = String(p.attackSpeed);

        if (this.statLabels['str']) this.statLabels['str'].innerText = String(p.str);
        if (this.statLabels['agi']) this.statLabels['agi'].innerText = String(p.agi);
        if (this.statLabels['int']) this.statLabels['int'].innerText = String(p.int);
        if (this.statLabels['vit']) this.statLabels['vit'].innerText = String(p.vit);
    }

    // ── Build Methods ─────────────────────────────────────────────────────────

    private buildTopLeftPortrait() {
        const topBar = document.createElement('div');
        Object.assign(topBar.style, {
            position: 'absolute',
            top: '10px', left: '10px',
            backgroundColor: 'rgba(15, 15, 20, 0.85)',
            border: '2px solid #554433',
            borderRadius: '4px',
            padding: '8px 16px',
            color: '#eeffee',
            pointerEvents: 'auto',
            display: 'flex', gap: '16px', alignItems: 'center'
        });

        const nameLabel = document.createElement('strong');
        nameLabel.innerText = "Player";
        nameLabel.style.color = "#ffaa00";

        this.levelLabel = document.createElement('span');
        this.levelLabel.innerText = "Lv. 1";

        this.hpLabel = document.createElement('span');
        this.hpLabel.innerText = "100 / 100";
        this.hpLabel.style.color = "#ff4444";
        this.hpLabel.style.fontWeight = "bold";

        topBar.appendChild(nameLabel);
        topBar.appendChild(this.levelLabel);
        const hpTitle = document.createElement('span');
        hpTitle.innerText = "HP:";
        topBar.appendChild(hpTitle);
        topBar.appendChild(this.hpLabel);

        this.wrapper.appendChild(topBar);
    }

    private buildBottomActionBar() {
        const bottomBar = document.createElement('div');
        Object.assign(bottomBar.style, {
            position: 'absolute',
            bottom: '0px', left: '0px', width: '100%',
            height: '48px',
            backgroundColor: 'rgba(30, 20, 15, 0.95)',
            borderTop: '2px solid #554433',
            display: 'flex',
            justifyContent: 'center', alignItems: 'center', gap: '8px',
            pointerEvents: 'auto'
        });

        const buttons = ["Stats", "Pack", "Quests", "Party", "Skills", "Guild", "Options"];
        
        buttons.forEach(label => {
            const btn = document.createElement('button');
            btn.innerText = label;
            Object.assign(btn.style, {
                backgroundColor: '#3a2d21',
                border: '1px solid #554433',
                color: '#ddcca0',
                fontWeight: 'bold',
                padding: '6px 16px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                outline: 'none'
            });

            btn.addEventListener('mouseenter', () => btn.style.backgroundColor = '#4c392b');
            btn.addEventListener('mouseleave', () => btn.style.backgroundColor = '#3a2d21');

            if (label === 'Stats') {
                btn.addEventListener('click', () => this.toggleStatsWindow());
            }

            bottomBar.appendChild(btn);
        });

        this.wrapper.appendChild(bottomBar);
    }

    private buildStatsWindow() {
        this.statsWindow = document.createElement('div');
        Object.assign(this.statsWindow.style, {
            position: 'absolute',
            bottom: '60px', left: '10px', // Docked above the bottom bar on the left
            width: '240px',
            backgroundColor: 'rgba(20, 20, 25, 0.9)',
            border: '2px solid #554433',
            borderRadius: '4px',
            padding: '12px',
            display: 'none', // Hidden by default
            flexDirection: 'column', gap: '8px',
            pointerEvents: 'auto',
            color: '#eeeedd'
        });

        const title = document.createElement('div');
        title.innerText = "CHARACTER STATS";
        Object.assign(title.style, {
            textAlign: 'center', fontWeight: 'bold',
            borderBottom: '1px solid #554433', paddingBottom: '8px',
            marginBottom: '4px', color: '#ffaa00'
        });
        this.statsWindow.appendChild(title);

        // Core stats
        this.addStatRow("HP", "hp", "#ff4444");
        this.addStatRow("Damage", "damage", "#ffaa00");
        this.addStatRow("Atk Speed", "speed", "#aaffaa");
        
        const sep = document.createElement('div');
        Object.assign(sep.style, { height: '1px', backgroundColor: '#554433', margin: '4px 0' });
        this.statsWindow.appendChild(sep);

        // RPG stats
        this.addStatRow("STR", "str", "#ffffff");
        this.addStatRow("AGI", "agi", "#ffffff");
        this.addStatRow("INT", "int", "#ffffff");
        this.addStatRow("VIT", "vit", "#ffffff");

        this.wrapper.appendChild(this.statsWindow);
    }

    private addStatRow(label: string, key: string, color: string) {
        if (!this.statsWindow) return;
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', justifyContent: 'space-between' });

        const lbl = document.createElement('span');
        lbl.innerText = label;
        lbl.style.fontWeight = "bold";

        const val = document.createElement('span');
        val.innerText = "0";
        val.style.color = color;

        this.statLabels[key] = val;

        row.appendChild(lbl);
        row.appendChild(val);
        this.statsWindow.appendChild(row);
    }

    private toggleStatsWindow() {
        if (!this.statsWindow) return;
        if (this.statsWindow.style.display === 'none') {
            this.statsWindow.style.display = 'flex';
        } else {
            this.statsWindow.style.display = 'none';
        }
    }
}
