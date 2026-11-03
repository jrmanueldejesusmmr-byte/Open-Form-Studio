import { GLOSSARY_TERMS, GlossaryTerm } from '../glossary/terms';

export class GlossaryPanel {
  private container: HTMLElement;
  private currentFilterLevel: 'principiante' | 'profesional' = 'principiante';
  private searchKeyword: string = '';

  constructor(parentContainer: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'arq-glossary-panel';
    parentContainer.appendChild(this.container);
    this.render();
  }

  public render() {
    this.container.innerHTML = `
      <div class="glossary-header" style="margin-bottom: 12px;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px;">Glosario Técnico ArquiStudio</h3>
        <div class="glossary-controls" style="display: flex; gap: 10px; align-items: center;">
          <input type="text" id="glossary-search" placeholder="Buscar término..." value="${this.searchKeyword}" style="flex: 1; padding: 6px; background: #2d2d2d; color: #fff; border: 1px solid #555; border-radius: 4px;" />
          <label style="font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="checkbox" id="glossary-level-toggle" ${this.currentFilterLevel === 'profesional' ? 'checked' : ''} />
            Profesional
          </label>
        </div>
      </div>
      <div class="glossary-content" style="display: flex; gap: 12px; max-height: 350px;">
        <div class="glossary-list" style="flex: 1; overflow-y: auto; border-right: 1px solid #444; padding-right: 8px;">
          ${this.renderTermsList()}
        </div>
        <div class="glossary-details" id="glossary-details-view" style="flex: 1.2; font-size: 13px; line-height: 1.4;">
          <p style="color: #888;">Selecciona un término para ver su definición detallada.</p>
        </div>
      </div>
    `;
    this.attachEvents();
  }

  private renderTermsList(): string {
    const filtered = GLOSSARY_TERMS.filter(t => 
      t.nombre.toLowerCase().includes(this.searchKeyword.toLowerCase())
    );

    if (filtered.length === 0) {
      return '<p style="color: #888; font-size: 12px;">No se encontraron términos.</p>';
    }

    return filtered.map(t => `
      <div class="glossary-item-card" data-id="${t.id}" style="padding: 8px; margin-bottom: 6px; background: #252526; border-radius: 4px; cursor: pointer; border: 1px solid transparent;">
        <strong style="font-size: 13px; color: #4ec9b0;">${t.nombre}</strong>
        <span style="font-size: 10px; background: #333; padding: 2px 6px; border-radius: 3px; float: right; color: #ce9178;">${t.categoria}</span>
        <p style="margin: 4px 0 0 0; font-size: 11px; color: #cccccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.definicionCorta}</p>
      </div>
    `).join('');
  }

  private attachEvents() {
    const searchInput = this.container.querySelector('#glossary-search') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchKeyword = (e.target as HTMLInputElement).value;
        const listContainer = this.container.querySelector('.glossary-list');
        if (listContainer) {
          listContainer.innerHTML = this.renderTermsList();
          this.attachCardEvents();
        }
      });
    }

    const toggle = this.container.querySelector('#glossary-level-toggle') as HTMLInputElement;
    if (toggle) {
      toggle.addEventListener('change', (e) => {
        this.currentFilterLevel = (e.target as HTMLInputElement).checked ? 'profesional' : 'principiante';
        this.render();
      });
    }

    this.attachCardEvents();
  }

  private attachCardEvents() {
    const cards = this.container.querySelectorAll('.glossary-item-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        const term = GLOSSARY_TERMS.find(t => t.id === id);
        if (term) {
          this.showDetails(term);
        }
      });
    });
  }

  private showDetails(term: GlossaryTerm) {
    const detailsView = this.container.querySelector('#glossary-details-view');
    if (detailsView) {
      const definitionToShow = this.currentFilterLevel === 'profesional' ? term.definicionLarga : term.definicionCorta;
      detailsView.innerHTML = `
        <h4 style="margin: 0 0 6px 0; color: #4fc1ff;">${term.nombre} <span style="font-size: 10px; color: #dcdcaa; border: 1px solid #dcdcaa; padding: 1px 4px; border-radius: 3px;">${term.nivel}</span></h4>
        <p style="margin: 0 0 8px 0; color: #9cdcfe; font-size: 11px;">Categoría: ${term.categoria}</p>
        <p style="margin: 0 0 12px 0;">${definitionToShow}</p>
        <h5 style="margin: 0 0 4px 0; font-size: 12px; color: #b5cea8;">Términos relacionados:</h5>
        <ul style="margin: 0; padding-left: 16px;">
          ${term.relacionados.map(relId => `<li><span style="color: #569cd6;">${relId}</span></li>`).join('')}
        </ul>
      `;
    }
  }
}