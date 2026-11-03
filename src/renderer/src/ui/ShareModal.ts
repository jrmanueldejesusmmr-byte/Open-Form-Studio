import { supabase } from '../services/supabaseClient';

export class ShareModal {
  private container: HTMLElement;
  private currentProjectId: string;

  constructor(projectId: string) {
    this.currentProjectId = projectId;
    this.container = document.createElement('div');
    this.container.id = 'arq-share-modal-overlay';
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.7);
      display: flex; justify-content: center; align-items: center;
      z-index: 100000;
    `;
    document.body.appendChild(this.container);
    this.render();
  }

  private render() {
    this.container.innerHTML = `
      <div style="background: #252526; border: 1px solid #454545; border-radius: 8px; width: 450px; padding: 20px; color: #fff; box-shadow: 0 8px 32px rgba(0,0,0,0.8); font-family: sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 16px; color: #3b82f6;">Compartir Proyecto</h3>
          <button id="close-share-modal" style="background: none; border: none; color: #aaa; font-size: 18px; cursor: pointer;">✕</button>
        </div>

        <p style="font-size: 12px; color: #ccc; margin-bottom: 16px;">
          Genera un enlace público tipo Google Docs para permitir que otros usuarios accedan al documento con el rol seleccionado.
        </p>

        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <select id="share-role-select" style="background: #1e1e1e; color: #fff; border: 1px solid #555; padding: 8px; border-radius: 4px; font-size: 12px; flex: 1;">
            <option value="visualizador">Visualizador (Ver y agregar anotaciones)</option>
            <option value="editor">Editor (Editar el proyecto completo)</option>
          </select>
          <button id="btn-generate-link" style="background: #2563eb; color: #fff; border: none; padding: 8px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: bold;">
            Generar Enlace
          </button>
        </div>

        <div id="link-result-container" style="display: none; background: #1e1e1e; border: 1px solid #333; padding: 10px; border-radius: 4px;">
          <label style="font-size: 11px; color: #888; display: block; margin-bottom: 4px;">Enlace del proyecto:</label>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="generated-link-input" readonly style="flex: 1; background: #111; color: #4ade80; border: 1px solid #444; padding: 6px; border-radius: 4px; font-size: 11px;" />
            <button id="btn-copy-link" style="background: #374151; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;">
              Copiar
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents() {
    const closeBtn = this.container.querySelector('#close-share-modal');
    closeBtn?.addEventListener('click', () => this.destroy());

    const generateBtn = this.container.querySelector('#btn-generate-link');
    generateBtn?.addEventListener('click', () => this.generateLink());

    const copyBtn = this.container.querySelector('#btn-copy-link');
    copyBtn?.addEventListener('click', () => {
      const input = this.container.querySelector('#generated-link-input') as HTMLInputElement;
      if (input && input.value) {
        navigator.clipboard.writeText(input.value);
        copyBtn.textContent = '¡Copiado!';
        setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2000);
      }
    });
  }

  private async generateLink() {
    const roleSelect = this.container.querySelector('#share-role-select') as HTMLSelectElement;
    const selectedRole = roleSelect.value;
    const token = crypto.randomUUID();

    try {
      if (supabase) {
        await supabase.from('enlaces_compartidos').insert([
          { proyecto_id: this.currentProjectId, token, rol: selectedRole }
        ]);
      }

      const generatedUrl = `${window.location.origin}/?project=${this.currentProjectId}&token=${token}&role=${selectedRole}`;
      
      const linkContainer = this.container.querySelector('#link-result-container') as HTMLElement;
      const linkInput = this.container.querySelector('#generated-link-input') as HTMLInputElement;
      
      if (linkContainer && linkInput) {
        linkInput.value = generatedUrl;
        linkContainer.style.display = 'block';
      }
    } catch (err) {
      console.error('Error al generar enlace:', err);
    }
  }

  public destroy() {
    this.container.remove();
  }
}
